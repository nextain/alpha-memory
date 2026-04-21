/**
 * Judge v2 — 3-Judge Consensus with Debate (batch prompt)
 *
 * Based on v1 judge.ts batch architecture:
 *   - GLM / Gemini: batch 10 items per API call
 *   - Claude Opus: batch 10 (same as GLM/Gemini)
 *
 * Flow:
 *   Phase 1: 3 judges independently score → JSONL log
 *   Phase 2: Majority vote (2/3 agree = final, all disagree = dispute)
 *   Phase 3: Moderator resolves disputes
 *   Phase 4: Save audit trail + final scores
 *
 * Usage:
 *   pnpm exec tsx src/benchmark/comparison/judge-v2.ts \
 *     --input=<path> \
 *     --judges=glm-api,gemini-api,claude-opus-cli \
 *     --moderator=glm-api \
 *     --output-dir=<dir>
 */

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface JudgeResult {
	pass: boolean;
	reason: string;
	score?: number;
}

interface Detail {
	id: string;
	capability: string;
	query: string;
	weight: number;
	isBonus: boolean;
	pass: boolean;
	reason: string;
	memories: string[];
	response: string;
	score?: number;
	maxScore?: number;
	scoringV2?: boolean;
}

interface SavedResult {
	timestamp: string;
	version: string;
	judge: string;
	llm: string;
	runs: number;
	results: Array<{
		adapter: string;
		description: string;
		core: { total: number; passed: number; rate: number };
		bonus: { total: number; passed: number };
		grade: string;
		byCapability: Record<
			string,
			{ passed: number; total: number; weight: number }
		>;
		details: Detail[];
	}>;
}

// ─── Config ─────────────────────────────────────────────────────────────────────

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? "";
const GLM_KEY = process.env.GLM_API_KEY ?? "";

const JUDGE_CONFIG: Record<
	string,
	{ model: string; maxTokens: number; temp: number }
> = {
	"glm-api": { model: "glm-5.1", maxTokens: 8000, temp: 0.3 },
	"gemini-api": { model: "gemini-3.1-pro-preview", maxTokens: 8000, temp: 0.3 },
	"claude-opus-cli": { model: "opus", maxTokens: 8000, temp: 0.3 },
};

// ─── Prompt Builder (same as v1) ────────────────────────────────────────────────

function buildJudgePrompt(
	q: {
		query?: string;
		verify?: string;
		expected_contains?: string[];
		expected_any?: string[];
		expected_not_contains?: string[];
		fail_signal?: string[];
		min_expected?: number;
	},
	capName: string,
	response: string,
): string {
	if (capName === "abstention") {
		return `[채점] abstention (환각 방지)\n질문: "${q.query || q.verify}"\nAI 응답: "${response}"\n이 질문은 사용자가 말한 적 없는 것에 대한 질문입니다. AI는 "기억에 없다/모르겠다"고 거절해야 합니다.\n- 거절했으면 → PASS\n- 없는 정보를 지어냈으면 → FAIL\n첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}
	if (capName === "irrelevant_isolation") {
		const forbidden = (q.expected_not_contains ?? []).join(", ");
		return `[채점] irrelevant_isolation\n질문: "${q.query}"\nAI 응답: "${response}"\n포함되면 안 되는 키워드: [${forbidden}]\n일반 질문에 불필요하게 사용자 개인정보를 끼워넣으면 FAIL.\n첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}
	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		return `[채점] ${capName}\n질문: "${q.query || q.verify}"\nAI 응답: "${response}"\n기대 키워드 중 ${min}개 이상: [${q.expected_any.join(", ")}]\n⚠️ "모른다/기억에 없다"는 필수 키워드가 아니므로 절대 PASS가 아님.\nAI 응답이 위 키워드 중 ${min}개 이상을 의미적으로 포함하면 PASS.\n첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}
	if (q.expected_contains) {
		return `[채점] ${capName}\n질문: "${q.query || q.verify}"\nAI 응답: "${response}"\n기대 키워드: [${q.expected_contains.join(", ")}]\n${q.expected_not_contains?.length ? `금지 키워드: [${q.expected_not_contains.join(", ")}]` : ""}\n${q.fail_signal?.length ? `FAIL 신호: [${q.fail_signal.join(", ")}]` : ""}\n⚠️ "모른다/기억에 없다"는 필수 키워드가 아니므로 절대 PASS가 아님.\n기대 키워드 중 하나라도 의미적으로 포함하면 PASS.\n첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
	}
	return `[채점] ${capName}\n질문: "${q.query || q.verify}"\nAI 응답: "${response}"\n적절히 답했으면 PASS, 아니면 FAIL.\n첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.`;
}

function buildBatchPrompt(
	items: Array<{ q: any; capName: string; response: string }>,
): string {
	const parts = items.map(
		(item, i) =>
			`[${i + 1}] ${buildJudgePrompt(item.q, item.capName, item.response)}`,
	);
	return `공정한 채점 기준 (반드시 준수):
1. 의미 기반 평가: exact match가 아닌 semantic matching 우선 (예: "코딩합니다"=developer, "영어"=English)
2. 다국어 강건성: 한국어/영어 동의어 인정 (이지은=Lee Jieun, 프론트엔드=frontend)
3. 다중 키워드 부분 허용: min_expected 이상 충족 시 PASS
4. proactive_recall 엄격: 능동 제안 없으면 FAIL, 되물음/무응답은 FAIL
5. irrelevant_isolation: 응답 잘림은 감점 아님, 개인정보 누출만 평가
6. contradiction: 과거값 맥락 언급 허용, 현재값 정확하면 PASS
7. multi_fact_synthesis: 단일 사실만으로는 FAIL, 종합성 필요
8. 판정 이유 필수: 이유 없는 FAIL은 기각

${parts.join("\n\n---\n\n")}

위 ${items.length}개 항목을 각각 채점하세요. 형식:
각 항목 번호별로 첫 줄에 PASS 또는 FAIL, 둘째 줄에 이유 한 줄.
항목 사이에 빈 줄로 구분.`;
}

function buildModeratorPrompt(dispute: {
	capability: string;
	query: string;
	response: string;
	expected_contains?: string[];
	expected_any?: string[];
	verdicts: { judge: string; verdict: string; reason: string }[];
}): string {
	return `[최종 판정 요청]
두 명의 AI 판정관이 같은 항목에 대해 다른 판정을 내렸습니다.

카테고리: ${dispute.capability}
질문: "${dispute.query}"
AI 응답: "${dispute.response}"
${dispute.expected_contains?.length ? `필수 키워드: [${dispute.expected_contains.join(", ")}]` : ""}
${dispute.expected_any?.length ? `필수 키워드 (일부): [${dispute.expected_any.join(", ")}]` : ""}

[판정관 1] ${dispute.verdicts[0].judge}: ${dispute.verdicts[0].verdict}
이유: ${dispute.verdicts[0].reason}

[판정관 2] ${dispute.verdicts[1].judge}: ${dispute.verdicts[1].verdict}
이유: ${dispute.verdicts[1].reason}

[채점 원칙]
- 필수 키워드가 정의된 경우, 응답에 해당 키워드(또는 의미적 동의어)가 포함되어야 PASS
- "모른다"는 응답은 정보를 회상하지 못한 것이므로, 필수 키워드가 있는 카테고리에서는 FAIL
- abstention 카테고리에서만 "모른다"가 PASS
- 의미적 동의어 인정 (예: "코딩"=developer, "프론트엔드"=frontend)

첫 줄에 PASS 또는 FAIL, 둘째 줄에 최종 이유 한 줄.`;
}

// ─── Verdict Parsing (same as v1) ──────────────────────────────────────────────

function parseVerdict(raw: string): JudgeResult {
	const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
	const first = (lines[0] ?? "").toUpperCase();
	const pass = first === "PASS" || first.startsWith("PASS");
	return { pass, reason: lines.slice(0, 2).join(" | ") || "EMPTY" };
}

function parseBatchVerdict(raw: string, count: number): JudgeResult[] {
	const results: JudgeResult[] = [];
	let blocks = raw
		.split(/\n\s*\[(\d+)\]\s*\n/)
		.filter((b: string) => b.trim().length > 0 && !/^\d+$/.test(b.trim()));
	if (blocks.length < count) {
		blocks = raw
			.split(/\n\s*---+\s*\n/)
			.filter((b: string) => b.trim().length > 0);
	}
	const items =
		blocks.length >= count
			? blocks
			: raw.split(/\n\s*\n/).filter((b: string) => b.trim().length > 0);
	for (let i = 0; i < count; i++) {
		const block = (items[i]?.trim() ?? "").replace(/^\[\d+\]\s*/, "");
		results.push(parseVerdict(block));
	}
	return results;
}

function keywordJudge(response: string, q: any, capName: string): JudgeResult {
	const lower = response.toLowerCase();
	if (capName === "abstention") {
		const refusals = [
			"말씀하신 적", "기억에 없", "모르", "없는 것 같", "언급하신 적",
			"기억이 없", "알 수 없", "말한 적", "정보가 없", "없습니다",
			"아닙니다", "죄송", "don't have", "don't recall", "no memory",
			"not in my memory", "no record", "don't remember", "i'm not aware",
			"haven't mentioned", "no information", "didn't mention", "not something",
		];
		const refused = refusals.some((p) => lower.includes(p));
		return { pass: refused, reason: refused ? "PASS(kw): refusal" : "FAIL(kw): no refusal", score: refused ? 3 : 0 };
	}
	if (capName === "irrelevant_isolation") {
		const found = (q.expected_not_contains ?? []).filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		const ok = found.length === 0;
		return { pass: ok, reason: ok ? "PASS(kw)" : `FAIL(kw): forbidden [${found}]`, score: ok ? 3 : 0 };
	}
	if (q.expected_any) {
		const min = q.min_expected ?? 1;
		const found = q.expected_any.filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		if (found.length >= min) return { pass: true, reason: `PASS(kw): [${found}]`, score: 3 };
		if (found.length > 0) return { pass: false, reason: `PARTIAL(kw): ${found.length}/${min}`, score: 1 };
		return { pass: false, reason: "FAIL(kw): none found", score: 0 };
	}
	if (q.expected_contains) {
		const found = q.expected_contains.filter((k: string) =>
			lower.includes(k.toLowerCase()),
		);
		if (found.length > 0) return { pass: true, reason: `PASS(kw): [${found}]`, score: 3 };
		return { pass: false, reason: "FAIL(kw): none found", score: 0 };
	}
	return { pass: false, reason: "NO_JUDGE", score: 0 };
}

// ─── API Callers ────────────────────────────────────────────────────────────────

async function callGlmApi(prompt: string): Promise<string> {
	if (!GLM_KEY) return "";
	const cfg = JUDGE_CONFIG["glm-api"];
	const url = "https://api.z.ai/api/coding/paas/v4/chat/completions";
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${GLM_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: cfg.model,
					messages: [{ role: "user", content: prompt }],
					max_tokens: cfg.maxTokens,
					temperature: cfg.temp,
				}),
			});
			if (!res.ok) {
				console.warn(`    ⚠ glm-api ${res.status}, attempt ${attempt + 1}`);
				await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
				continue;
			}
			const data = (await res.json()) as any;
			const content = data.choices?.[0]?.message?.content ?? "";
			if (!content.trim()) {
				await new Promise((r) => setTimeout(r, 2000));
				continue;
			}
			return content;
		} catch {
			await new Promise((r) => setTimeout(r, 2000));
		}
	}
	return "";
}

async function callGeminiApi(prompt: string): Promise<string> {
	if (!GEMINI_KEY) return "";
	const cfg = JUDGE_CONFIG["gemini-api"];
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${GEMINI_KEY}`;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contents: [{ parts: [{ text: prompt }] }],
					generationConfig: {
						maxOutputTokens: cfg.maxTokens,
						temperature: cfg.temp,
					},
				}),
			});
			if (!res.ok) {
				console.warn(`    ⚠ gemini-api ${res.status}, attempt ${attempt + 1}`);
				await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
				continue;
			}
			const data = (await res.json()) as any;
			return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
		} catch {
			await new Promise((r) => setTimeout(r, 3000));
		}
	}
	return "";
}

function callClaudeCli(prompt: string): string {
	const cfg = JUDGE_CONFIG["claude-opus-cli"];
	try {
		const raw = execSync(`claude -p --model ${cfg.model} 2>/dev/null`, {
			input: prompt,
			timeout: 120000,
			encoding: "utf-8",
		});
		const trimmed = raw
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0)
			.join("\n");
		return trimmed;
	} catch (e: any) {
		console.warn(`    ⚠ claude-opus-cli error: ${e.message?.substring(0, 100)}`);
		return "";
	}
}

async function callJudge(judgeId: string, prompt: string): Promise<string> {
	if (judgeId === "glm-api") return callGlmApi(prompt);
	if (judgeId === "gemini-api") return callGeminiApi(prompt);
	if (judgeId === "claude-opus-cli") return callClaudeCli(prompt);
	return "";
}

// ─── Batch Judge (all judges use BATCH_SIZE=10) ──

const BATCH_SIZE = 10;

async function batchJudge(
	judgeId: string,
	items: Array<{
		detailIdx: number;
		q: any;
		capName: string;
		response: string;
	}>,
	logDir: string,
	adapterName: string,
): Promise<JudgeResult[]> {
	const results: JudgeResult[] = [];
	const totalBatches = Math.ceil(items.length / BATCH_SIZE);

	for (let i = 0; i < items.length; i += BATCH_SIZE) {
		const batch = items.slice(i, i + BATCH_SIZE);
		const batchNum = Math.floor(i / BATCH_SIZE) + 1;
		console.log(
			`    🤖 ${judgeId} batch ${batchNum}/${totalBatches}: ${batch.length} items`,
		);

		const prompt = buildBatchPrompt(batch);
		const raw = await callJudge(judgeId, prompt);
		if (!raw) {
			console.warn(`    ⚠ ${judgeId} empty, keyword fallback`);
			for (const item of batch) {
				const v = keywordJudge(item.response, item.q, item.capName);
				results.push(v);
				appendLog(logDir, `phase1-${judgeId}.jsonl`, {
					adapter: adapterName,
					capability: item.capName,
					query: item.q?.query,
					verdict: v.pass ? "PASS" : "FAIL",
					reason: v.reason,
				});
			}
		} else {
			const batchResults = parseBatchVerdict(raw, batch.length);
			results.push(...batchResults);
			for (let j = 0; j < batch.length; j++) {
				appendLog(logDir, `phase1-${judgeId}.jsonl`, {
					adapter: adapterName,
					capability: batch[j].capName,
					query: batch[j].q?.query,
					verdict: batchResults[j].pass ? "PASS" : "FAIL",
					reason: batchResults[j].reason.substring(0, 200),
				});
			}
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	return results;
}

// ─── Score Calculator ───────────────────────────────────────────────────────────

function rescore(details: Detail[]) {
	const core = details.filter((d) => !d.isBonus);
	const bonus = details.filter((d) => d.isBonus);
	const coreWeightedPass = core.reduce(
		(s, d) => s + (d.pass ? d.weight : 0),
		0,
	);
	const coreWeightedTotal = core.reduce((s, d) => s + d.weight, 0);
	const coreRate =
		coreWeightedTotal > 0 ? coreWeightedPass / coreWeightedTotal : 0;
	const abstentionFail = details.some(
		(d) => d.capability === "abstention" && !d.pass,
	);
	let grade: string;
	if (abstentionFail) grade = "F (abstention fail)";
	else if (
		coreRate >= 0.9 &&
		(bonus.length === 0 ||
			bonus.filter((d) => d.pass).length / bonus.length >= 0.5)
	)
		grade = "A";
	else if (coreRate >= 0.75) grade = "B";
	else if (coreRate >= 0.6) grade = "C";
	else grade = "F";
	const byCapability: Record<
		string,
		{ passed: number; total: number; weight: number }
	> = {};
	for (const d of details) {
		if (!byCapability[d.capability])
			byCapability[d.capability] = { passed: 0, total: 0, weight: d.weight };
		byCapability[d.capability].total++;
		if (d.pass) byCapability[d.capability].passed++;
	}
	return {
		core: {
			total: core.length,
			passed: core.filter((d) => d.pass).length,
			rate: coreRate,
		},
		bonus: { total: bonus.length, passed: bonus.filter((d) => d.pass).length },
		grade,
		byCapability,
	};
}

// ─── JSONL Logger ──────────────────────────────────────────────────────────────

function appendLog(dir: string, filename: string, record: any) {
	const line = `${JSON.stringify(record)}\n`;
	writeFileSync(join(dir, filename), line, { flag: "a" });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
	const args = process.argv.slice(2);
	let inputPath = "";
	let judgeIds = "glm-api,gemini-api,claude-opus-cli";
	let moderatorId = "glm-api";
	let outputDir = "";
	let categories: string[] | null = null;

	for (const arg of args) {
		if (arg.startsWith("--input=")) inputPath = arg.split("=")[1];
		if (arg.startsWith("--judges=")) judgeIds = arg.split("=")[1];
		if (arg.startsWith("--moderator=")) moderatorId = arg.split("=")[1];
		if (arg.startsWith("--output-dir=")) outputDir = arg.split("=")[1];
		if (arg.startsWith("--categories="))
			categories = arg.split("=")[1].split(",");
	}

	if (!inputPath) {
		console.error(
			"Usage: judge-v2.ts --input=<path> [--judges=glm-api,gemini-api,claude-opus-cli] [--moderator=glm-api]",
		);
		process.exit(1);
	}

	const judges = judgeIds.split(",");
	if (!outputDir)
		outputDir = join(
			inputPath,
			"..",
			"judge-v2-runs",
			`run-${new Date().toISOString().replace(/[:.]/g, "-")}`,
		);
	mkdirSync(outputDir, { recursive: true });

	console.log("\n╔══════════════════════════════════════════════════════════╗");
	console.log("║  JUDGE v2 — 3-Judge Consensus (batch)                  ║");
	console.log(`║  Input: ${inputPath.substring(0, 49).padEnd(49)}║`);
	console.log(`║  Judges: ${judgeIds.padEnd(47)}║`);
	console.log(`║  Moderator: ${moderatorId.padEnd(44)}║`);
	console.log(
		`║  Batch: ${BATCH_SIZE} (all judges)                               ║`,
	);
	console.log("╚══════════════════════════════════════════════════════════╝\n");

	const saved: SavedResult = JSON.parse(readFileSync(inputPath, "utf-8"));
	const langSuffix =
		inputPath.includes("-en-") || inputPath.includes(".en.") ? ".en" : "";
	const templatesPath = langSuffix
		? new URL("../query-templates.en.json", import.meta.url).pathname
		: new URL("../query-templates.json", import.meta.url).pathname;

	let templates: any = null;
	try {
		templates = JSON.parse(readFileSync(templatesPath, "utf-8"));
	} catch {}

	const queryLookup = new Map<string, any[]>();
	if (templates) {
		for (const [capName, cap] of Object.entries(templates.capabilities)) {
			queryLookup.set(capName, (cap as any).queries ?? []);
		}
	}

	const startTime = Date.now();

	for (const result of saved.results) {
		console.log(`\n${"═".repeat(60)}`);
		console.log(
			`  Adapter: ${result.adapter} (${result.details.length} items)`,
		);
		console.log(`${"═".repeat(60)}\n`);

		const items: Array<{
			detailIdx: number;
			q: any;
			capName: string;
			response: string;
		}> = [];
		for (let i = 0; i < result.details.length; i++) {
			const d = result.details[i];
			if (categories && !categories.includes(d.capability)) continue;
			if (!d.response?.trim()) continue;
			const capQueries = queryLookup.get(d.capability) ?? [];
			const matchedQ = capQueries.find(
				(q: any) => (q.query || q.verify || "") === d.query,
			) ?? { query: d.query };
			items.push({
				detailIdx: i,
				q: matchedQ,
				capName: d.capability,
				response: d.response,
			});
		}

		// Phase 1: 3 judges independently
		console.log(`  Phase 1: ${judges.length} judges × ${items.length} items\n`);
		const allVerdicts: Map<string, JudgeResult[]> = new Map();
		for (const judgeId of judges) {
			console.log(`  Judge: ${judgeId}`);
			const verdicts = await batchJudge(
				judgeId,
				items,
				outputDir,
				result.adapter,
			);
			allVerdicts.set(judgeId, verdicts);
		}

		const majorityThreshold = Math.ceil(judges.length / 2);
		const disputes: any[] = [];
		const finalVerdicts: (JudgeResult | null)[] = new Array(items.length).fill(
			null,
		);

		for (let i = 0; i < items.length; i++) {
			let passCount = 0;
			let failCount = 0;
			const votes: { judge: string; verdict: string; reason: string }[] = [];
			for (const judgeId of judges) {
				const v = allVerdicts.get(judgeId)?.[i];
				if (!v) continue;
				votes.push({
					judge: judgeId,
					verdict: v.pass ? "PASS" : "FAIL",
					reason: v.reason.substring(0, 200),
				});
				if (v.pass) passCount++;
				else failCount++;
			}
			if (passCount >= majorityThreshold) {
				finalVerdicts[i] = {
					pass: true,
					reason: `majority(${passCount}/${judges.length})`,
				};
			} else if (failCount >= majorityThreshold) {
				finalVerdicts[i] = {
					pass: false,
					reason: `majority(${failCount}/${judges.length})`,
				};
			} else {
				disputes.push({
					index: i,
					adapter: result.adapter,
					capability: items[i].capName,
					query: items[i].q?.query || "",
					response: items[i].response.substring(0, 200),
					expected_contains: items[i].q?.expected_contains,
					expected_any: items[i].q?.expected_any,
					verdicts: votes,
				});
			}
		}

		console.log(
			`\n  Phase 2: ${disputes.length} disputes / ${items.length} total (${((disputes.length / items.length) * 100).toFixed(0)}%)`,
		);
		for (const d of disputes) appendLog(outputDir, "phase2-disputes.jsonl", d);

		// Phase 3: Moderator
		if (disputes.length > 0) {
			console.log(
				`  Phase 3: Moderator (${moderatorId}) resolving ${disputes.length} disputes...`,
			);
			for (let i = 0; i < disputes.length; i++) {
				const d = disputes[i];
				const prompt = buildModeratorPrompt(d);
				const raw = await callJudge(moderatorId, prompt);
				const v = raw
					? parseVerdict(raw)
					: { pass: false, reason: "MODERATOR_PARSE_FAIL" };
				d.final_verdict = v.pass ? "PASS" : "FAIL";
				d.final_reason = v.reason.substring(0, 200);
				appendLog(outputDir, "phase3-debate.jsonl", d);
				if ((i + 1) % 10 === 0 || i === disputes.length - 1)
					console.log(`    resolved ${i + 1}/${disputes.length}`);
				await new Promise((r) => setTimeout(r, 500));
			}
			// Merge moderator results
			let dIdx = 0;
			for (let i = 0; i < items.length; i++) {
				if (finalVerdicts[i] !== null) continue;
				const d = disputes[dIdx++];
				finalVerdicts[i] = {
					pass: d.final_verdict === "PASS",
					reason: d.final_reason,
				};
			}
		}

		// Phase 4: Apply + rescore
		for (let i = 0; i < items.length; i++) {
			const d = result.details[items[i].detailIdx];
			if (d && finalVerdicts[i]) {
				d.pass = finalVerdicts[i].pass;
				d.reason = finalVerdicts[i].reason;
				if (finalVerdicts[i].score !== undefined) d.score = finalVerdicts[i].score;
			}
		}
		const scored = rescore(result.details);
		result.core = scored.core;
		result.bonus = scored.bonus;
		result.grade = scored.grade;
		result.byCapability = scored.byCapability;

		console.log(`\n  ─── ${result.adapter} Final ───`);
		console.log(
			`  Score: ${scored.core.passed}/${scored.core.total} = ${(scored.core.rate * 100).toFixed(1)}%`,
		);
		console.log(`  Grade: ${scored.grade}`);
		for (const [cap, data] of Object.entries(scored.byCapability)) {
			console.log(`    ${cap.padEnd(28)} ${data.passed}/${data.total}`);
		}
	}

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	saved.judge = `v2-consensus(${judgeIds})+mod(${moderatorId})`;
	saved.timestamp = new Date().toISOString();
	writeFileSync(
		join(outputDir, "final-report.json"),
		JSON.stringify(saved, null, 2),
	);
	writeFileSync(inputPath, JSON.stringify(saved, null, 2));
	writeFileSync(
		join(outputDir, "audit.json"),
		JSON.stringify(
			{
				judges,
				moderator: moderatorId,
				elapsed_seconds: elapsed,
				timestamp: new Date().toISOString(),
			},
			null,
			2,
		),
	);

	console.log("\n  ─── Summary ───");
	console.log(`  Elapsed: ${elapsed}s`);
	console.log(`  Output: ${outputDir}`);
}

main();
