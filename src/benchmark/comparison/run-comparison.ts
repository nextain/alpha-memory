import { execSync } from "node:child_process";
/**
 * Memory System Comparison Benchmark
 *
 * Runs the same 55 tests (fact-bank.json + query-templates.json) against
 * multiple memory systems and produces a side-by-side comparison.
 *
 * Usage:
 *   pnpm exec tsx src/memory/benchmark/comparison/run-comparison.ts [options]
 *
 * Options:
 *   --adapters=naia,mem0,letta   (default: naia,mem0)
 *   --judge=claude-cli|keyword                (default: claude-cli)
 *   --runs=N                                  (runs per test, default: 1)
 *   --skip-encode                             (skip encoding, assume already done)
 *   --categories=recall,abstention,...         (filter categories)
 *
 * Requires: GEMINI_API_KEY env var
 */
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { GraphitiAdapter } from "./adapter-graphiti.js";
import { LettaAdapter } from "./adapter-letta.js";
import { Mem0Adapter } from "./adapter-mem0.js";
import { NaiaLocalAdapter } from "./adapter-naia-local.js";
import { type EmbeddingBackend, NaiaAdapter } from "./adapter-naia.js";
import { NoMemoryAdapter } from "./adapter-no-memory.js";
import { OpenLLMVTuberAdapter } from "./adapter-open-llm-vtuber.js";
import { OpenClawAdapter } from "./adapter-openclaw.js";
import { SapAdapter } from "./adapter-sap.js";
import { SillyTavernAdapter } from "./adapter-sillytavern.js";
import { StarnionAdapter } from "./adapter-starnion.js";
import type {
	BenchmarkAdapter,
	ComparisonResult,
	TestDetail,
} from "./types.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
// THROTTLE_MS removed — Vertex AI gateway has no rate limit
const THROTTLE_MS = 0;

// ─── CLI Args ────────────────────────────────────────────────────────────────

function parseArgs() {
	const args = process.argv.slice(2);
	let adapterNames = ["naia", "mem0"];
	let judge: "claude-cli" | "keyword" | "gemini-pro" | "glm-api" = "claude-cli";
	let runs = 1;
	let categories: string[] | null = null;
	let llm: "gemini" | "qwen3" | "gemini-cli" | "gemini-flash-lite" =
		"gemini-flash-lite";
	let skipEncode = false;
	let lang = "ko";
	let embedder = "gemini";
	let topK = 10;
	let v2 = false;

	for (const arg of args) {
		if (arg.startsWith("--adapters="))
			adapterNames = arg.split("=")[1].split(",");
		if (arg.startsWith("--judge=")) judge = arg.split("=")[1] as any;
		if (arg.startsWith("--runs="))
			runs = Number.parseInt(arg.split("=")[1], 10);
		if (arg.startsWith("--categories="))
			categories = arg.split("=")[1].split(",");
		if (arg.startsWith("--llm=")) llm = arg.split("=")[1] as any;
		if (arg === "--skip-encode") skipEncode = true;
		if (arg.startsWith("--lang=")) lang = arg.split("=")[1];
		if (arg.startsWith("--embedder=")) embedder = arg.split("=")[1];
		if (arg.startsWith("--topK="))
			topK = Number.parseInt(arg.split("=")[1], 10);
		if (arg === "--v2") v2 = true;
	}
	return {
		adapterNames,
		judge,
		runs,
		categories,
		llm,
		skipEncode,
		lang,
		embedder,
		topK,
		v2,
	};
}

// ─── V2 → V1 Template Converter ──────────────────────────────────────────────

function convertV2ToV1(v2: any): any {
	const capabilities: Record<string, any> = {};
	for (const q of v2.queries) {
		const cat = q.category;
		if (!capabilities[cat]) {
			capabilities[cat] = {
				description: cat,
				weight: q.weight ?? (cat === "semantic_search" || cat === "multi_fact_synthesis" ? 2 : 1),
				queries: [],
			};
		}
		const entry: Record<string, any> = { query: q.query };

		if (Array.isArray(q.fact_ref)) {
			entry.facts = q.fact_ref;
			if (q.expected_any) entry.expected_any = q.expected_any;
			if (q.min_expected) entry.min_expected = q.min_expected;
		} else if (q.fact_ref && q.fact_ref !== "NONE") {
			entry.fact = q.fact_ref;
		}

		if (q.expected_not_contains) entry.expected_not_contains = q.expected_not_contains;
		if (q.setup) entry.setup = q.setup;
		if (q.update) entry.update = q.update;
		if (q.verify) entry.verify = q.verify;
		if (q.noisy_input) entry.noisy_input = q.noisy_input;
		if (q.expected_pattern) entry.expected_pattern = q.expected_pattern;
		if (q.hallucination_keywords) entry.hallucination_keywords = q.hallucination_keywords;
		if (q.context) entry.context = q.context;
		if (q.min_facts) entry.min_facts = q.min_facts;
		if (q.is_reasoning) entry.is_reasoning = q.is_reasoning;

		// Convert 0-3 scoring to v1 expected_contains
		if (q.scoring) {
			if (q.scoring.score_3 && q.scoring.score_3.length > 0) {
				entry.expected_contains = q.scoring.score_3;
			}
			if (q.scoring.score_0 && q.scoring.score_0.length > 0 && !entry.expected_not_contains) {
				entry.expected_not_contains = q.scoring.score_0;
			}
		}

		// Abstention: no fact ref, has expected_pattern
		if (cat === "abstention" && !entry.fact) {
			delete entry.fact;
		}

		// Irrelevant isolation: no fact ref
		if (cat === "irrelevant_isolation" && !entry.fact) {
			delete entry.fact;
		}

		capabilities[cat].queries.push(entry);
	}

	// Mark abstention as mandatory
	if (capabilities.abstention) {
		capabilities.abstention.mandatory_pass = true;
		capabilities.abstention.weight = 2;
	}

	return {
		$schema: v2.$schema,
		capabilities,
		scoring: v2.scoring || {
			mandatory_pass: ["abstention"],
			grades: { A: "core >= 90%", B: "core >= 75%", C: "core >= 60%", F: "core < 60%" },
		},
	};
}

// ─── Adapter Factory ────────────────────────────────────────────────────────

function createAdapter(
	name: string,
	apiKey: string,
	embedder?: string,
): BenchmarkAdapter {
	switch (name) {
		case "naia":
			return new NaiaAdapter(
				apiKey,
				(embedder ?? "gemini") as EmbeddingBackend,
			);
		case "naia-local":
			return new NaiaLocalAdapter(apiKey, embedder);
		case "mem0":
			return new Mem0Adapter(apiKey);
		case "letta":
			return new LettaAdapter();
		case "graphiti":
			return new GraphitiAdapter();
		case "starnion":
			return new StarnionAdapter();
		case "sap":
			return new SapAdapter(apiKey);
		case "sillytavern":
			return new SillyTavernAdapter();
		case "airi":
			return new NoMemoryAdapter(
				"airi",
				"project-airi — memory WIP (stub), no search",
			);
		case "open-llm-vtuber":
			return new OpenLLMVTuberAdapter();
		case "openclaw":
			return new OpenClawAdapter();
		default:
			throw new Error(`Unknown adapter: ${name}`);
	}
}

// ─── LLM Response Generation ────────────────────────────────────────────────

const OLLAMA_BASE = "http://localhost:11434/v1/";

async function callOllama(
	model: string,
	messages: Array<{ role: string; content: string }>,
	maxTokens: number,
): Promise<{
	content: string;
	promptTokens: number;
	completionTokens: number;
}> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(`${OLLAMA_BASE}chat/completions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					model,
					messages,
					max_tokens: maxTokens,
				}),
			});
			if (!res.ok) {
				await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
				continue;
			}
			const data = (await res.json()) as any;
			return {
				content: data.choices?.[0]?.message?.content ?? "",
				promptTokens: data.usage?.prompt_tokens ?? 0,
				completionTokens: data.usage?.completion_tokens ?? 0,
			};
		} catch {
			await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
		}
	}
	return { content: "", promptTokens: 0, completionTokens: 0 };
}

/**
 * Call Gemini via gateway (if GATEWAY_URL + GATEWAY_MASTER_KEY set) or direct API.
 * Gateway uses Vertex AI (higher quota), direct uses AI Studio.
 */
async function callGemini(
	apiKey: string,
	messages: Array<{ role: string; content: string }>,
	maxTokens: number,
): Promise<{
	content: string;
	promptTokens: number;
	completionTokens: number;
}> {
	const gwUrl = process.env.GATEWAY_URL;
	const gwKey = process.env.GATEWAY_MASTER_KEY;
	const useGateway = !!(gwUrl && gwKey);

	const url = useGateway
		? `${gwUrl}/v1/chat/completions`
		: `${GEMINI_BASE}chat/completions`;
	const authKey = useGateway ? gwKey : apiKey;
	const model = useGateway
		? "vertexai:gemini-2.5-flash-lite"
		: "gemini-2.5-flash-lite";

	for (let attempt = 0; attempt < 3; attempt++) {
		await new Promise((r) => setTimeout(r, THROTTLE_MS));
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${authKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model,
					messages,
					max_tokens: maxTokens,
					...(useGateway && { user: "benchmark" }),
				}),
			});
			if (!res.ok) {
				await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
				continue;
			}
			const data = (await res.json()) as any;
			const content = data.choices?.[0]?.message?.content ?? "";
			const promptTokens = data.usage?.prompt_tokens ?? 0;
			const completionTokens = data.usage?.completion_tokens ?? 0;
			if (content.length > 0)
				return { content, promptTokens, completionTokens };
		} catch {}
	}
	return { content: "", promptTokens: 0, completionTokens: 0 };
}

/**
 * Call Gemini via CLI (gemini command).
 * credit-free usage.
 */
async function callGeminiCLI(
	messages: Array<{ role: string; content: string }>,
	model = "gemini-2.5-flash",
): Promise<{
	content: string;
	promptTokens: number;
	completionTokens: number;
}> {
	// Format prompt for CLI
	const fullPrompt = messages
		.map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
		.join("\n\n");

	try {
		// Use stdin for prompt to handle large content
		const output = execSync(`gemini -p "" -m ${model} -o text`, {
			input: fullPrompt,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const content = output.trim();
		return {
			content,
			// Estimated tokens for CLI usage (roughly 4 chars per token for Korean/English mix)
			promptTokens: Math.ceil(fullPrompt.length / 4),
			completionTokens: Math.ceil(content.length / 4),
		};
	} catch (error: any) {
		const stderr = error.stderr?.toString() ?? "";
		if (stderr.includes("Quota exceeded") || stderr.includes("429")) {
			console.error(
				"\n[STOP] Gemini CLI Quota Exceeded. Please switch accounts and resume.",
			);
			process.exit(1);
		}
		console.error(`Gemini CLI Error: ${stderr}`);
		return { content: "", promptTokens: 0, completionTokens: 0 };
	}
}

// ─── Token Usage Tracker ─────────────────────────────────────────────────────

let totalPromptTokens = 0;
let totalCompletionTokens = 0;
let judgeCallCount = 0;

function printTokenUsage(): void {
	console.log(`\n  ─── Token Usage ───`);
	console.log(`    Judge calls: ${judgeCallCount}`);
	console.log(`    Prompt tokens: ${totalPromptTokens.toLocaleString()}`);
	console.log(
		`    Completion tokens: ${totalCompletionTokens.toLocaleString()}`,
	);
	console.log(
		`    Total tokens: ${(totalPromptTokens + totalCompletionTokens).toLocaleString()}`,
	);
}

// ─── Gemini CLI Batch Judge ──────────────────────────────────────────────────

interface BatchJudgeItem {
	idx: number;
	q: any;
	capName: string;
	response: string;
}

function buildBatchJudgePrompt(items: BatchJudgeItem[]): string {
	const parts = items.map(
		(item, i) =>
			`[${i + 1}] ${buildJudgePrompt(item.q, item.capName, item.response)}`,
	);
	return `${parts.join("\n\n---\n\n")}

위 ${items.length}개 항목을 각각 채점하세요. 형식:
각 항목 번호별로 첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.
항목 사이에 빈 줄로 구분.`;
}

/** Call gemini CLI (gemini-3.1-pro-preview) to judge */
function callGeminiCli(prompt: string): string {
	try {
		return execSync('gemini -p "" -m gemini-3.1-pro-preview -o text', {
			input: prompt,
			timeout: 120000,
			encoding: "utf-8",
			maxBuffer: 1024 * 1024,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch (e: any) {
		const stderr = e.stderr?.toString() ?? "";
		if (stderr.includes("Quota exceeded") || stderr.includes("429")) {
			console.error(
				"\n[STOP] Gemini CLI Judge Quota Exceeded. Please switch accounts and resume.",
			);
			process.exit(1);
		}
		return "";
	}
}

/** Call GLM-5.1 API (Z.AI) for judge */
async function callGlmApi(prompt: string): Promise<string> {
	const apiKey = process.env.GLM_API_KEY ?? "";
	if (!apiKey) {
		console.error("  ❌ GLM_API_KEY not found in environment.");
		return "";
	}

	const url = "https://api.z.ai/api/coding/paas/v4/chat/completions";
	for (let attempt = 0; attempt < 5; attempt++) {
		// Mandatory wait to respect RPM (Coding Plan might have tight limits)
		await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "glm-5.1",
					messages: [{ role: "user", content: prompt }],
					max_tokens: 2000,
					temperature: 0.1,
				}),
			});
			if (res.status === 429) {
				console.warn(
					`    ⚠ glm-api 429 (Rate Limit), retrying... (attempt ${attempt + 1})`,
				);
				await new Promise((r) => setTimeout(r, 10000 * (attempt + 1))); // Wait 10s+ on 429
				continue;
			}
			if (!res.ok) {
				console.warn(
					`    ⚠ glm-api error ${res.status}, attempt ${attempt + 1}`,
				);
				continue;
			}
			const data = (await res.json()) as any;
			return data.choices?.[0]?.message?.content ?? "";
		} catch {
			await new Promise((r) => setTimeout(r, 5000));
		}
	}
	return "";
}

function geminiProBatchJudgeSync(items: BatchJudgeItem[]): JudgeResult[] {
	const prompt = buildBatchJudgePrompt(items);
	console.log(`    🤖 gemini-pro batch: judging ${items.length} items...`);
	const raw = callGeminiCli(prompt);
	if (!raw) {
		console.warn(
			"    ⚠ gemini cli judge returned empty, falling back to keyword",
		);
		return items.map((item) =>
			keywordJudge(item.response, item.q, item.capName),
		);
	}
	judgeCallCount++;
	// Rough token estimate for CLI budgeting (~4 chars per token)
	totalPromptTokens += Math.ceil(prompt.length / 4);
	totalCompletionTokens += Math.ceil(raw.length / 4);
	return parseBatchVerdict(raw, items.length);
}

function parseBatchVerdict(raw: string, count: number): JudgeResult[] {
	const results: JudgeResult[] = [];
	// More robust parsing: look for lines starting with [N] or N. or just number at start of line
	const blocks = raw
		.split(/(?=\n\s*\[?\d+[\]\.]\s+)/)
		.filter((b: string) => b.trim().length > 0);

	// If the split didn't yield enough blocks, fallback to double newline but more carefully
	const finalBlocks =
		blocks.length >= count
			? blocks
			: raw.split(/\n\s*\n/).filter((b: string) => b.trim().length > 0);

	for (let i = 0; i < count; i++) {
		const block = finalBlocks[i]?.trim() ?? "";
		// Strip the index prefix [N] or N. if present
		const cleanBlock = block.replace(/^\[?\d+[\]\.]\s+/, "").trim();
		results.push(parseVerdict(cleanBlock));
	}
	return results;
}

function callClaudeCli(prompt: string): string {
	try {
		return execSync("claude -p 2>/dev/null", {
			input: prompt,
			timeout: 60000,
			encoding: "utf-8",
		}).trim();
	} catch {
		return "";
	}
}

async function askWithMemory(
	apiKey: string,
	memories: string[],
	question: string,
	llm:
		| "gemini"
		| "qwen3"
		| "gemini-cli"
		| "gemini-flash-lite" = "gemini-flash-lite",
): Promise<{
	content: string;
	promptTokens: number;
	completionTokens: number;
	latencyMs: number;
}> {
	const start = Date.now();
	const memCtx =
		memories.length > 0
			? `The following is information from your long-term memory. Use it to answer the user's request.

<recalled_memories>
${memories.map((m) => `- ${m}`).join("\n")}
</recalled_memories>`
			: "(No relevant memories found)";

	const messages = [
		{
			role: "system",
			content: `You are the user's personal AI companion. Respond in the same language as the user's message.

## CORE RULES
1. **Faithfulness**: For questions about the user's life, identity, preferences, or past interactions, you MUST ONLY answer based on the provided <recalled_memories>.
2. **Abstention**: If the specific personal fact requested is not found in the memories, you MUST reply that you don't recall it (e.g., "기억에 없습니다" or "I don't have that in my memory") in the same language as the user's message.
3. **Conflict Resolution**: If memories provide contradictory information, prioritize the one with the most recent date if available, or mention the contradiction to the user.
4. **No Hallucination**: Do not fabricate names, dates, preferences, or events not present in the memories.
5. **General Knowledge**: You may use your general knowledge for non-personal questions (e.g., science, history), but never mix it with personal facts or use it to "fill in the blanks" for personal memories.
6. **Synthesis**: If multiple memory fragments are relevant, synthesize them into a coherent and comprehensive answer.
7. **Preference Alignment**: When the user expresses a preference or asks for help, prioritize using known information from their memory to provide a personalized response.
8. **Honesty over Guessing**: If memories are present but don't address the specific question, prioritize honesty over guessing.`,
		},
		{ role: "user", content: `${memCtx}\n\nUser Question: ${question}` },
	];

	let result: {
		content: string;
		promptTokens: number;
		completionTokens: number;
	};
	if (llm === "gemini-cli") {
		result = await callGeminiCLI(messages, "gemini-2.5-flash");
	} else if (llm === "qwen3") {
		result = await callOllama("qwen3:8b", messages, 500);
	} else {
		result = await callGemini(apiKey, messages, 500);
	}

	// Track global token usage
	totalPromptTokens += result.promptTokens;
	totalCompletionTokens += result.completionTokens;

	return { ...result, latencyMs: Date.now() - start };
}
// ─── Judge ───────────────────────────────────────────────────────────────────

interface JudgeResult {
	pass: boolean;
	reason: string;
}

function buildJudgePrompt(
	q: any,
	capName: string,
	response: string,
	lang = "ko",
): string {
	if (lang === "en") {
		if (capName === "abstention") {
			return `[Judge] abstention (Hallucination Prevention)
Question: "${q.query || q.verify}"
AI Response: "${response}"
This question is about something the user never mentioned. The AI must decline to answer (e.g., "I don't recall", "Not in memory").
- If declined → PASS
- If fabricated information → FAIL
First line: PASS or FAIL. Second line: one-line reason.`;
		}

		if (capName === "irrelevant_isolation") {
			const forbidden = (q.expected_not_contains ?? []).join(", ");
			return `[Judge] irrelevant_isolation
Question: "${q.query}"
AI Response: "${response}"
Forbidden keywords: [${forbidden}]
If the AI unnecessarily includes user's private info in a general question → FAIL.
First line: PASS or FAIL. Second line: one-line reason.`;
		}

		if (q.expected_any) {
			const min = q.min_expected ?? 1;
			return `[Judge] ${capName}
Question: "${q.query || q.verify}"
AI Response: "${response}"
Expected at least ${min} of: [${q.expected_any.join(", ")}]
If AI response semantically contains at least ${min} of these → PASS.
First line: PASS or FAIL. Second line: one-line reason.`;
		}

		if (q.expected_contains) {
			return `[Judge] ${capName}
Question: "${q.query || q.verify}"
AI Response: "${response}"
Expected keywords: [${q.expected_contains.join(", ")}]
${q.expected_not_contains?.length ? `Forbidden keywords: [${q.expected_not_contains.join(", ")}]` : ""}
${q.fail_signal?.length ? `FAIL signals: [${q.fail_signal.join(", ")}]` : ""}
If AI response semantically contains any of the expected keywords → PASS.
First line: PASS or FAIL. Second line: one-line reason.`;
		}

		return `[Judge] ${capName}
Question: "${q.query || q.verify}"
AI Response: "${response}"
If the AI answered appropriately → PASS, otherwise FAIL.
First line: PASS or FAIL. Second line: one-line reason.`;
	}

	// Legacy Korean prompts
	if (capName === "abstention") {
		return `[채점] abstention (환각 방지)
질문: "${q.query || q.verify}"
AI 응답: "${response}"
이 질문은 사용자가 말한 적 없는 것에 대한 질문입니다. AI는 "기억에 없다/모르겠다"고 거절해야 합니다.
- 거절했으면 → PASS
- 없는 정보를 지어냈으면 → FAIL
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (capName === "irrelevant_isolation") {
		const forbidden = (q.expected_not_contains ?? []).join(", ");
		return `[채점] irrelevant_isolation
질문: "${q.query}"
AI 응답: "${response}"
포함되면 안 되는 키워드: [${forbidden}]
일반 질문에 불필요하게 사용자 개인정보를 끼워넣으면 FAIL.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		return `[채점] ${capName}
질문: "${q.query || q.verify}"
AI 응답: "${response}"
기대 키워드 중 ${min}개 이상: [${q.expected_any.join(", ")}]
AI 응답이 위 키워드 중 ${min}개 이상을 의미적으로 포함하면 PASS.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	if (q.expected_contains) {
		return `[채점] ${capName}
질문: "${q.query || q.verify}"
AI 응답: "${response}"
기대 키워드: [${q.expected_contains.join(", ")}]
${q.expected_not_contains?.length ? `금지 키워드: [${q.expected_not_contains.join(", ")}]` : ""}
${q.fail_signal?.length ? `FAIL 신호: [${q.fail_signal.join(", ")}]` : ""}
기대 키워드 중 하나라도 의미적으로 포함하면 PASS.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}

	return `[채점] ${capName}
질문: "${q.query || q.verify}"
AI 응답: "${response}"
적절히 답했으면 PASS, 아니면 FAIL.
첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
}

function parseVerdict(raw: string): JudgeResult {
	const first = raw.split("\n")[0].trim().toUpperCase();
	const pass = first === "PASS" || first.startsWith("PASS");
	return { pass, reason: raw.slice(0, 120) || "EMPTY" };
}

function keywordJudge(response: string, q: any, capName: string): JudgeResult {
	const lower = response.toLowerCase();
	if (capName === "abstention") {
		const refusals = [
			// Korean
			"말씀하신 적",
			"기억에 없",
			"모르",
			"없는 것 같",
			"언급하신 적",
			"기억이 없",
			"알 수 없",
			"말한 적",
			"정보가 없",
			"없습니다",
			"아닙니다",
			"죄송",
			// English
			"don't have",
			"don't recall",
			"no memory",
			"not in my memory",
			"no record",
			"don't remember",
			"i'm not aware",
			"haven't mentioned",
			"no information",
			"didn't mention",
			"not something",
		];
		return refusals.some((p) => lower.includes(p))
			? { pass: true, reason: "PASS(kw): refusal" }
			: { pass: false, reason: "FAIL(kw): no refusal" };
	}
	if (capName === "irrelevant_isolation") {
		const found = (q.expected_not_contains ?? []).filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		return found.length > 0
			? { pass: false, reason: `FAIL(kw): forbidden [${found}]` }
			: { pass: true, reason: "PASS(kw)" };
	}
	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		const found = q.expected_any.filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		return found.length >= min
			? { pass: true, reason: `PASS(kw): [${found}]` }
			: {
					pass: false,
					reason: `FAIL(kw): ${found.length}/${q.expected_any.length}`,
				};
	}
	if (q.expected_contains) {
		const found = q.expected_contains.filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		return found.length > 0
			? { pass: true, reason: `PASS(kw): [${found}]` }
			: { pass: false, reason: "FAIL(kw): none found" };
	}
	return { pass: false, reason: "NO_JUDGE" };
}

function judgeResponse(
	apiKey: string,
	mode: string,
	q: any,
	capName: string,
	response: string,
): JudgeResult {
	if (mode === "keyword") return keywordJudge(response, q, capName);
	if (mode === "gemini-pro") {
		const results = geminiProBatchJudgeSync([{ idx: 0, q, capName, response }]);
		return results[0] ?? keywordJudge(response, q, capName);
	}

	// claude-cli judge
	const prompt = buildJudgePrompt(q, capName, response);
	const raw = callClaudeCli(prompt);
	if (!raw) return keywordJudge(response, q, capName); // fallback
	return parseVerdict(raw);
}

/** Batch-judge items using GLM-5.1 API (10 items per call) */
async function batchJudgeGlmApi(
	items: Array<{ q: any; capName: string; response: string }>,
	batchSize = 10,
): Promise<JudgeResult[]> {
	const results: JudgeResult[] = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize).map((item, idx) => ({
			idx,
			...item,
		}));
		const prompt = buildBatchJudgePrompt(batch);
		console.log(
			`    🤖 glm-5.1 batch ${Math.floor(i / batchSize) + 1}: judging ${batch.length} items...`,
		);
		const raw = await callGlmApi(prompt);
		if (!raw) {
			console.warn(
				"    ⚠ glm api judge returned empty, falling back to keyword",
			);
			results.push(
				...batch.map((item) =>
					keywordJudge(item.response, item.q, item.capName),
				),
			);
		} else {
			judgeCallCount++;
			totalPromptTokens += Math.ceil(prompt.length / 4);
			totalCompletionTokens += Math.ceil(raw.length / 4);
			results.push(...parseBatchVerdict(raw, batch.length));
		}
	}
	return results;
}

/** Batch-judge items using Gemini CLI (10 items per call) */
function batchJudgeGeminiProSync(
	items: Array<{ q: any; capName: string; response: string }>,
	batchSize = 10,
): JudgeResult[] {
	const results: JudgeResult[] = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize).map((item, idx) => ({
			idx,
			...item,
		}));
		const batchResults = geminiProBatchJudgeSync(batch);
		results.push(...batchResults);
	}
	return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const config = parseArgs();

	const apiKey = process.env.GEMINI_API_KEY ?? "";
	const hasGateway = !!(
		process.env.GATEWAY_URL && process.env.GATEWAY_MASTER_KEY
	);
	const needsGemini = config.embedder === "gemini" || config.llm === "gemini";
	// Gateway (Vertex AI) can replace direct Gemini API key
	if (needsGemini && !apiKey && !hasGateway) {
		console.error(
			"GEMINI_API_KEY required (or set GATEWAY_URL + GATEWAY_MASTER_KEY to use gateway)",
		);
		process.exit(1);
	}
	console.log("\n╔══════════════════════════════════════════════════════════╗");
	console.log("║  MEMORY SYSTEM COMPARISON BENCHMARK                     ║");
	console.log(`║  Adapters: ${config.adapterNames.join(", ").padEnd(44)}║`);
	console.log(`║  Judge: ${config.judge.padEnd(47)}║`);
	console.log(`║  LLM: ${config.llm.padEnd(49)}║`);
	console.log(`║  Runs: ${String(config.runs).padEnd(48)}║`);
	console.log(`║  Lang: ${config.lang.padEnd(48)}║`);
	console.log(`║  Embedder: ${config.embedder.padEnd(44)}║`);
	if (config.skipEncode)
		console.log("║  ⚡ Skip-encode mode (using cached DB)              ║");
	console.log("╚══════════════════════════════════════════════════════════╝\n");

	const langSuffix = config.lang === "ko" ? "" : `.${config.lang}`;
	const v2Suffix = config.v2 ? "-v2" : "";
	const factBankPath = join(
		import.meta.dirname,
		"..",
		`fact-bank${v2Suffix}${langSuffix}.json`,
	);
	const templatesPath = join(
		import.meta.dirname,
		"..",
		`query-templates${v2Suffix}${langSuffix}.json`,
	);
	const factBank = JSON.parse(readFileSync(factBankPath, "utf-8"));
	const templatesRaw = JSON.parse(readFileSync(templatesPath, "utf-8"));

	// Convert v2 flat queries to v1 capabilities structure
	const templates = templatesRaw.version === 2 && templatesRaw.queries
		? convertV2ToV1(templatesRaw)
		: templatesRaw;

	const timestampStr = new Date().toISOString().replace(/[:.]/g, "-");
	const runId = `run-${timestampStr}`;
	const reportsDir = join(import.meta.dirname, "..", "..", "..", "reports");
	const runDir = join(reportsDir, "runs", runId);
	mkdirSync(runDir, { recursive: true });

	const historyLogPath = join(reportsDir, "EXECUTION_HISTORY.md");
	const startInfo = `\n### 🚀 Run Started: ${new Date().toLocaleString()}\n- Run ID: \`${runId}\`\n- Adapters: ${config.adapterNames.join(", ")}\n- Language: ${config.lang}\n- LLM: ${config.llm}\n- Judge: ${config.judge}\n`;
	try {
		appendFileSync(historyLogPath, startInfo);
	} catch (e) {}

	console.log(`  📂 Artifacts will be saved to: ${runDir}\n`);

	const allResults: ComparisonResult[] = [];

	for (const adapterName of config.adapterNames) {
		console.log(`\n${"═".repeat(60)}`);
		console.log(`  TESTING: ${adapterName}`);
		console.log(`${"═".repeat(60)}\n`);

		let adapter: BenchmarkAdapter;
		try {
			adapter = createAdapter(adapterName, apiKey, config.embedder);
		} catch (err: any) {
			console.error(`  ❌ Failed to create adapter: ${err.message}`);
			continue;
		}

		try {
			// Phase 1: Init + Encode
			// Always use lang-specific cacheId so EN and KO data stay in separate DBs.
			// skip-encode mode reuses the existing DB without re-encoding.
			const cacheId = `cache-${config.lang}`;
			await adapter.init(cacheId);

			if (config.skipEncode) {
				console.log("  Phase 1: ⚡ SKIPPED (using cached DB)\n");
			} else {
				console.log("  Phase 1: Init + Encode\n");
				const encodeLogPath = join(runDir, `encoding-${adapterName}.json`);
				const encodeCheckpointPath = join(
					import.meta.dirname,
					"..",
					"..",
					"..",
					"reports",
					`encode-checkpoint-${adapterName}-${config.lang}.json`,
				);
				let processedIds: string[] = [];
				const encodingLogs: any[] = [];
				try {
					processedIds = JSON.parse(
						readFileSync(encodeCheckpointPath, "utf-8"),
					);
					if (processedIds.length > 0) {
						console.log(
							`    🔄 Resuming from checkpoint: ${processedIds.length} facts already stored.\n`,
						);
					}
				} catch (e) {}

				let stored = 0;
				let gated = 0;
				for (const fact of factBank.facts) {
					if (processedIds.includes(fact.id)) {
						stored++;
						console.log(
							`    ⏭️ [SKIP] ${fact.id}: Already processed in checkpoint.`,
						);
						continue;
					}
					let retryCount = 0;
					const MAX_RETRIES = 3;
					let success = false;

					while (retryCount < MAX_RETRIES && !success) {
						const startTime = Date.now();
						try {
							console.log(
								`    💸 [COST] ${fact.id}: Calling API for embedding/extraction...`,
							);
							const ok = await adapter.addFact(
								fact.statement,
								(fact as any).date,
							);
							const duration = Date.now() - startTime;

							const logEntry = {
								id: fact.id,
								statement: fact.statement,
								date: (fact as any).date,
								timestamp: new Date().toISOString(),
								duration_ms: duration,
								status: ok ? "stored" : "gated",
							};
							encodingLogs.push(logEntry);
							try {
								writeFileSync(
									encodeLogPath,
									JSON.stringify(encodingLogs, null, 2),
								);
							} catch (e) {}

							if (ok) {
								stored++;
								console.log(
									`    ✅ [DONE] ${fact.id}: Stored successfully (${duration}ms).`,
								);
								processedIds.push(fact.id);
								try {
									writeFileSync(
										encodeCheckpointPath,
										JSON.stringify(processedIds),
									);
								} catch (e) {}
							} else {
								gated++;
								console.log(`    ⛔ [GATE] ${fact.id}: GATED (not stored)`);
								processedIds.push(fact.id);
								try {
									writeFileSync(
										encodeCheckpointPath,
										JSON.stringify(processedIds),
									);
								} catch (e) {}
							}
							success = true;
						} catch (err: any) {
							retryCount++;
							if (retryCount < MAX_RETRIES) {
								console.warn(
									`    ⚠️ ${fact.id}: Retry ${retryCount}/${MAX_RETRIES} due to error: ${err.message?.slice(0, 50)}`,
								);
								await new Promise((r) => setTimeout(r, 2000 * retryCount)); // Exponential backoff
							} else {
								console.error(
									`    ❌ ${fact.id}: Failed after ${MAX_RETRIES} attempts: ${err.message?.slice(0, 60)}`,
								);
							}
						}
					}
				}
				const summary = `  - [Phase 1] ${adapterName}: Stored: ${stored}/${factBank.facts.length} (New: ${stored - processedIds.length}, Skipped: ${processedIds.length})\n`;
				try {
					appendFileSync(historyLogPath, summary);
				} catch (e) {}
				console.log(
					`\n    Stored: ${stored}/${factBank.facts.length} (gated: ${gated})\n`,
				);

				if (adapter.consolidate) {
					await adapter.consolidate();
					console.log("    Phase 1.5: Consolidation Complete\n");
				}
			}

			// Phase 2: Query + Respond + Judge
			console.log("  Phase 2: Query + Judge\n");
			const details: TestDetail[] = [];
			const checkpointPath = join(
				import.meta.dirname,
				"..",
				"..",
				"..",
				"reports",
				`checkpoint-${adapterName}-${config.lang}.json`,
			);
			let existingDetails: TestDetail[] = [];
			if (existsSync(checkpointPath)) {
				try {
					existingDetails = JSON.parse(readFileSync(checkpointPath, "utf-8"));
					console.log(
						`    ↻ Resuming from checkpoint: ${existingDetails.length} items already completed.`,
					);
				} catch (e) {
					console.warn("    ⚠ Failed to load checkpoint, starting fresh.");
				}
			}

			let testNum = 0;
			const pendingJudge: Array<{
				q: any;
				capName: string;
				response: string;
				detailIdx: number;
			}> = [];

			// Explicit execution order — do NOT rely on JSON key order.
			// Pre-update tests first, then contradiction (which mutates), then post-update tests.
			const CAPABILITY_ORDER = [
				"direct_recall",
				"semantic_search",
				"proactive_recall",
				"abstention",
				"irrelevant_isolation",
				"multi_fact_synthesis",
				"entity_disambiguation",
				// === Mutation boundary: updates/additions happen below ===
				"contradiction_direct",
				"contradiction_indirect",
				"noise_resilience",
				// === Post-mutation tests ===
				"unchanged_persistence",
				"temporal",
			];
			const capEntries = CAPABILITY_ORDER.filter(
				(name) => templates.capabilities[name],
			).map((name) => [name, templates.capabilities[name]] as [string, any]);

			// Warn about capabilities in templates but missing from CAPABILITY_ORDER
			const unordered = Object.keys(templates.capabilities).filter(
				(k) => !CAPABILITY_ORDER.includes(k),
			);
			if (unordered.length > 0) {
				console.warn(
					`    ⚠ Capabilities not in CAPABILITY_ORDER (will be skipped): ${unordered.join(", ")}`,
				);
			}

			for (const [capName, cap] of capEntries) {
				if (!cap.queries) continue;
				if (config.categories && !config.categories.includes(capName)) continue;

				const weight = cap.weight ?? 1;
				const isBonus = cap.is_bonus ?? false;
				console.log(
					`    ── ${capName} (w:${weight}${isBonus ? " bonus" : ""}) ──`,
				);

				for (const q of cap.queries) {
					testNum++;
					const id = `${capName.slice(0, 4).toUpperCase()}-${String(testNum).padStart(2, "0")}`;
					const query = q.query || q.verify || "";
					if (!query) continue;

					// RESUME LOGIC: Check if already completed
					const existing = existingDetails.find((d) => d.id === id);
					if (existing) {
						details.push(existing);
						console.log(
							`      ⏩ ${id} "${query.slice(0, 30)}..." [Skipped - Already completed]`,
						);
						continue;
					}

					// Handle setup/update/noise — log failures + wait for indexing
					if (q.setup)
						try {
							await adapter.addFact(q.setup);
							await new Promise((r) => setTimeout(r, THROTTLE_MS));
						} catch (e: any) {
							console.error(`      ⚠ setup fail: ${e.message?.slice(0, 60)}`);
						}
					if (q.update)
						try {
							await adapter.addFact(q.update);
							await new Promise((r) => setTimeout(r, THROTTLE_MS));
						} catch (e: any) {
							console.error(`      ⚠ update fail: ${e.message?.slice(0, 60)}`);
						}
					if (q.noisy_input)
						try {
							await adapter.addFact(q.noisy_input);
							await new Promise((r) => setTimeout(r, THROTTLE_MS));
						} catch (e: any) {
							console.error(`      ⚠ noise fail: ${e.message?.slice(0, 60)}`);
						}

					// Search memories
					let memories: string[] = [];
					const searchStart = Date.now();
					try {
						memories = await adapter.search(query, config.topK);
					} catch (err: any) {
						console.error(`      ⚠ search: ${err.message?.slice(0, 60)}`);
					}
					const searchLatency = Date.now() - searchStart;

					// Generate response with memories
					const askResult = await askWithMemory(
						apiKey,
						memories,
						query,
						config.llm,
					);
					let lastResponse = askResult.content;
					let passCount = 0;
					let lastReason = "";

					if (
						(config.judge === "gemini-pro" || config.judge === "glm-api") &&
						config.runs === 1
					) {
						// Defer judge to batch — push placeholder detail
						details.push({
							id,
							capability: capName,
							query,
							weight,
							isBonus,
							pass: false,
							reason: "(pending judge)",
							memories,
							response: lastResponse.slice(0, 400),
							latencyMs: searchLatency + askResult.latencyMs,
							tokens: {
								prompt: askResult.promptTokens,
								completion: askResult.completionTokens,
								total: askResult.promptTokens + askResult.completionTokens,
							},
						});
						pendingJudge.push({
							q,
							capName,
							response: lastResponse,
							detailIdx: details.length - 1,
						});
						console.log(
							`      ⏳ ${id} "${query.slice(0, 30)}..." [${memories.length} mem] (pending judge)`,
						);
					} else {
						let totalPromptTokens = askResult.promptTokens;
						let totalCompletionTokens = askResult.completionTokens;
						let totalLatency = searchLatency + askResult.latencyMs;

						for (let run = 0; run < config.runs; run++) {
							if (run > 0) {
								const r = await askWithMemory(
									apiKey,
									memories,
									query,
									config.llm,
								);
								lastResponse = r.content;
								totalPromptTokens += r.promptTokens;
								totalCompletionTokens += r.completionTokens;
								totalLatency += r.latencyMs;
							}
							const verdict = judgeResponse(
								apiKey,
								config.judge,
								q,
								capName,
								lastResponse,
							);
							lastReason = verdict.reason;
							if (verdict.pass) passCount++;
						}

						const pass = passCount >= Math.ceil(config.runs / 2);
						const reason =
							config.runs > 1
								? `${passCount}/${config.runs} → ${pass ? "PASS" : "FAIL"} | ${lastReason.slice(0, 60)}`
								: lastReason;

						details.push({
							id,
							capability: capName,
							query,
							weight,
							isBonus,
							pass,
							reason,
							memories,
							response: lastResponse.slice(0, 400),
							latencyMs: totalLatency / config.runs,
							tokens: {
								prompt: totalPromptTokens / config.runs,
								completion: totalCompletionTokens / config.runs,
								total:
									(totalPromptTokens + totalCompletionTokens) / config.runs,
							},
						});
						console.log(
							`      ${pass ? "✅" : "❌"} ${id} "${query.slice(0, 30)}..." [${memories.length} mem] ${reason.slice(0, 50)}`,
						);

						// Save checkpoint after each query
						try {
							writeFileSync(checkpointPath, JSON.stringify(details, null, 2));
						} catch (e) {}
					}
				}
				console.log();
			}

			// Phase 2.5: Batch judge (gemini-pro or glm-api mode)
			if (
				(config.judge === "gemini-pro" || config.judge === "glm-api") &&
				pendingJudge.length > 0
			) {
				console.log(
					`\n  Phase 2.5: Batch judging ${pendingJudge.length} items with ${config.judge === "gemini-pro" ? "Gemini 2.5 Pro" : "GLM-5.1"}\n`,
				);

				const verdicts =
					config.judge === "gemini-pro"
						? batchJudgeGeminiProSync(pendingJudge)
						: await batchJudgeGlmApi(pendingJudge);

				for (let i = 0; i < pendingJudge.length; i++) {
					const v = verdicts[i];
					const d = details[pendingJudge[i].detailIdx];
					if (d && v) {
						d.pass = v.pass;
						d.reason = v.reason;
					}
				}

				// Save intermediate judgments for verification
				try {
					const judgmentsPath = join(runDir, `judgments-${adapterName}.json`);
					writeFileSync(judgmentsPath, JSON.stringify(verdicts, null, 2));
					console.log(
						`    💾 Saved intermediate judgments to: ${judgmentsPath}`,
					);
				} catch (e) {}

				// Print resolved results

				for (const d of details) {
					if (d.reason === "(pending judge)") {
						console.log(
							`      ${d.pass ? "✅" : "❌"} ${d.id} (resolved) ${d.reason.slice(0, 50)}`,
						);
					}
				}
				printTokenUsage();
			}

			// Phase 3: Score (weighted)
			const core = details.filter((d) => !d.isBonus);
			const bonus = details.filter((d) => d.isBonus);
			// Weighted score: each test contributes its category weight
			const coreWeightedPass = core.reduce(
				(sum, d) => sum + (d.pass ? d.weight : 0),
				0,
			);
			const coreWeightedTotal = core.reduce((sum, d) => sum + d.weight, 0);
			const corePassed = core.filter((d) => d.pass).length;
			const bonusPassed = bonus.filter((d) => d.pass).length;
			const coreRate =
				coreWeightedTotal > 0 ? coreWeightedPass / coreWeightedTotal : 0;
			const bonusRate = bonus.length > 0 ? bonusPassed / bonus.length : 0;
			const abstentionFail = details.some(
				(d) => d.capability === "abstention" && !d.pass,
			);

			let grade: string;
			if (abstentionFail) grade = "F (abstention fail)";
			else if (coreRate >= 0.9 && (bonus.length === 0 || bonusRate >= 0.5))
				grade = "A";
			else if (coreRate >= 0.75) grade = "B";
			else if (coreRate >= 0.6) grade = "C";
			else grade = "F";

			const byCapability: ComparisonResult["byCapability"] = {};
			for (const d of details) {
				if (!byCapability[d.capability])
					byCapability[d.capability] = {
						passed: 0,
						total: 0,
						weight: d.weight,
					};
				byCapability[d.capability].total++;
				if (d.pass) byCapability[d.capability].passed++;
			}

			const validDetails = details.filter((d) => d.latencyMs !== undefined);
			const totalTokens = validDetails.reduce(
				(sum, d) => sum + (d.tokens?.total ?? 0),
				0,
			);
			const avgLatencyMs =
				validDetails.length > 0
					? validDetails.reduce((sum, d) => sum + (d.latencyMs ?? 0), 0) /
						validDetails.length
					: 0;
			const inputTokens = validDetails.reduce(
				(sum, d) => sum + (d.tokens?.prompt ?? 0),
				0,
			);
			const outputTokens = validDetails.reduce(
				(sum, d) => sum + (d.tokens?.completion ?? 0),
				0,
			);
			// Cost calculation: vertexai:gemini-2.5-flash-lite pricing (approx)
			const costUsd = (inputTokens * 0.075 + outputTokens * 0.3) / 1_000_000;

			allResults.push({
				adapter: adapter.name,
				description: adapter.description,
				core: { total: core.length, passed: corePassed, rate: coreRate },
				bonus: { total: bonus.length, passed: bonusPassed },
				grade,
				byCapability,
				details,
				metrics: {
					avgLatencyMs,
					totalTokens,
					costUsd,
				},
			});

			console.log(`    ─── ${adapter.name} Result ───`);
			console.log(
				`    Core: ${corePassed}/${core.length} items, weighted ${Math.round(coreRate * 100)}% (${coreWeightedPass}/${coreWeightedTotal} pts)`,
			);
			console.log(`    Bonus: ${bonusPassed}/${bonus.length}`);
			console.log(`    Grade: ${grade}`);
			console.log(`    Avg Latency: ${avgLatencyMs.toFixed(0)}ms`);
			console.log(
				`    Total Tokens: ${totalTokens.toLocaleString()} ($${costUsd.toFixed(4)})\n`,
			);
		} catch (err: any) {
			console.error(`  ❌ ${adapterName} failed: ${err.message}`);
			allResults.push({
				adapter: adapterName,
				description: `ERROR: ${err.message}`,
				core: { total: 0, passed: 0, rate: 0 },
				bonus: { total: 0, passed: 0 },
				grade: "ERROR",
				byCapability: {},
				details: [],
			});
		} finally {
			try {
				await adapter?.cleanup();
			} catch {}
		}
	}

	// ─── Final Comparison Report ─────────────────────────────────────────
	console.log(`\n${"═".repeat(70)}`);
	console.log("  COMPARISON SUMMARY");
	console.log(`${"═".repeat(70)}\n`);

	// Header
	const names = allResults.map((r) => r.adapter);
	console.log(
		`  ${"Category".padEnd(25)} ${names.map((n) => n.padStart(10)).join(" ")}`,
	);
	console.log(
		`  ${"─".repeat(25)} ${names.map(() => "─".repeat(10)).join(" ")}`,
	);

	// Collect all capability names
	const allCaps = new Set<string>();
	for (const r of allResults)
		for (const cap of Object.keys(r.byCapability)) allCaps.add(cap);

	for (const cap of allCaps) {
		const cells = allResults.map((r) => {
			const c = r.byCapability[cap];
			return c ? `${c.passed}/${c.total}` : "-";
		});
		console.log(
			`  ${cap.padEnd(25)} ${cells.map((c) => c.padStart(10)).join(" ")}`,
		);
	}

	console.log(
		`  ${"─".repeat(25)} ${names.map(() => "─".repeat(10)).join(" ")}`,
	);
	console.log(
		`  ${"CORE TOTAL".padEnd(25)} ${allResults.map((r) => `${r.core.passed}/${r.core.total}`.padStart(10)).join(" ")}`,
	);
	console.log(
		`  ${"CORE %".padEnd(25)} ${allResults.map((r) => `${Math.round(r.core.rate * 100)}%`.padStart(10)).join(" ")}`,
	);
	console.log(
		`  ${"GRADE".padEnd(25)} ${allResults.map((r) => r.grade.padStart(10)).join(" ")}`,
	);

	// Save report — per-adapter files in the run directory
	for (const result of allResults) {
		const adapterPath = join(runDir, `report-${result.adapter}.json`);
		writeFileSync(
			adapterPath,
			JSON.stringify(
				{
					runId,
					timestamp: new Date().toISOString(),
					version: "comparison-v2",
					judge: config.judge,
					llm: config.llm,
					runs: config.runs,
					results: [result],
				},
				null,
				2,
			),
		);
		console.log(`  Report (${result.adapter}): ${adapterPath}`);
	}

	// Also save a global summary in the main reports dir for convenience
	const summaryPath = join(
		import.meta.dirname,
		"../../../..",
		"reports",
		`summary-${runId}.json`,
	);
	writeFileSync(
		summaryPath,
		JSON.stringify(
			{
				runId,
				summary: allResults.map((r) => ({
					adapter: r.adapter,
					score: r.core.rate,
					grade: r.grade,
				})),
			},
			null,
			2,
		),
	);

	// Also save combined report
	const date = new Date().toISOString().slice(0, 10);
	const combinedPath = join(reportsDir, `memory-comparison-${date}.json`);
	writeFileSync(
		combinedPath,
		JSON.stringify(
			{
				runId,
				timestamp: new Date().toISOString(),
				version: "comparison-v2",
				judge: config.judge,
				llm: config.llm,
				runs: config.runs,
				results: allResults,
			},
			null,
			2,
		),
	);
	console.log(`  Report (combined): ${combinedPath}\n`);
}

main().catch(console.error);
