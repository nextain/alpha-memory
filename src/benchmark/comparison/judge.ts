/**
 * Standalone Re-Judge Script
 *
 * Reads an existing benchmark result JSON, re-runs judge on saved responses,
 * and updates the JSON file with new verdicts.
 *
 * Usage:
 *   pnpm exec tsx src/benchmark/comparison/judge.ts --input=<path> --judge=glm-api [options]
 *
 * Options:
 *   --input=<path>          (required) path to saved result JSON
 *   --judge=keyword|claude-cli|gemini-pro-cli|glm-api  (default: gemini-pro-cli)
 *   --batch-size=N          (default: 10)
 *   --categories=a,b,...    (filter to specific categories)
 *   --dry-run               (show plan without executing)
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface JudgeResult {
	pass: boolean;
	reason: string;
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

// ─── Token Tracker ─────────────────────────────────────────────────────────────

let totalPromptChars = 0;
let totalCompletionChars = 0;
let judgeCallCount = 0;
let startTime = 0;

function printTokenUsage(mode: string): void {
	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	// Rough estimate: ~4 chars per token for English+Korean mix
	const estPrompt = Math.ceil(totalPromptChars / 4);
	const estCompletion = Math.ceil(totalCompletionChars / 4);
	console.log(`\n  ─── Token Usage (estimated) ───`);
	console.log(`    Judge mode: ${mode}`);
	console.log(`    Judge calls: ${judgeCallCount}`);
	console.log(`    Est. prompt tokens: ${estPrompt.toLocaleString()}`);
	console.log(`    Est. completion tokens: ${estCompletion.toLocaleString()}`);
	console.log(
		`    Est. total tokens: ${(estPrompt + estCompletion).toLocaleString()}`,
	);
	console.log(`    Elapsed: ${elapsed}s`);
}

// ─── Judge Prompt Builder ───────────────────────────────────────────────────────

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

// ─── Verdict Parsing ────────────────────────────────────────────────────────────

function parseVerdict(raw: string): JudgeResult {
	const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
	const first = (lines[0] ?? "").toUpperCase();
	const pass = first === "PASS" || first.startsWith("PASS");
	return { pass, reason: lines.slice(0, 2).join(" | ") || "EMPTY" };
}

function parseBatchVerdict(raw: string, count: number): JudgeResult[] {
	const results: JudgeResult[] = [];
	// Split by numbered markers: [1], [2], etc.
	let blocks = raw
		.split(/\n\s*\[(\d+)\]\s*\n/)
		.filter((b: string) => b.trim().length > 0 && !/^\d+$/.test(b.trim()));
	// Fallback: split by --- separator
	if (blocks.length < count) {
		blocks = raw
			.split(/\n\s*---+\s*\n/)
			.filter((b: string) => b.trim().length > 0);
	}
	// Fallback: split by blank lines
	const items =
		blocks.length >= count
			? blocks
			: raw.split(/\n\s*\n/).filter((b: string) => b.trim().length > 0);
	for (let i = 0; i < count; i++) {
		let block = items[i]?.trim() ?? "";
		// Strip leading [N] marker if present
		block = block.replace(/^\[\d+\]\s*/, "");
		results.push(parseVerdict(block));
	}
	return results;
}

// ─── Keyword Judge ──────────────────────────────────────────────────────────────

function keywordJudge(response: string, q: any, capName: string): JudgeResult {
	const lower = response.toLowerCase();
	if (capName === "abstention") {
		const refusals = [
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

// ─── CLI Judges ─────────────────────────────────────────────────────────────────

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

function callCodexCli(prompt: string): string {
	try {
		const raw = execSync('echo "$(cat)" | codex exec - 2>/dev/null', {
			input: prompt,
			timeout: 120000,
			encoding: "utf-8",
			maxBuffer: 1024 * 1024,
			shell: "/bin/bash",
		}).trim();
		const lines = raw.split("\n");
		for (const line of lines) {
			const trimmed = line.trim();
			if (trimmed === "PASS" || trimmed === "FAIL" || trimmed.startsWith("PASS") || trimmed.startsWith("FAIL")) {
				return line;
			}
		}
		return raw;
	} catch {
		return "";
	}
}

function callGeminiCli(
	prompt: string,
	model = "gemini-3.1-pro-preview",
): string {
	try {
		return execSync(`gemini -p "" -m ${model} -o text 2>/dev/null`, {
			input: prompt,
			timeout: 120000,
			encoding: "utf-8",
			maxBuffer: 1024 * 1024,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return "";
	}
}

/** Call GLM-5.1 API (Z.AI) for judge */
async function callGlmApi(prompt: string): Promise<string> {
	const apiKey = process.env.GLM_API_KEY ?? "";
	if (!apiKey) return "";

	const url = "https://api.z.ai/api/coding/paas/v4/chat/completions";
	for (let attempt = 0; attempt < 3; attempt++) {
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
					max_tokens: 8000,
					temperature: 0.3,
				}),
			});
			if (!res.ok) {
				console.warn(
					`    ⚠ glm-api error ${res.status}, attempt ${attempt + 1}`,
				);
				await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
				continue;
			}
			const data = (await res.json()) as any;
			const content = data.choices?.[0]?.message?.content ?? "";
			if (!content.trim()) {
				console.warn(`    ⚠ glm-api empty content, attempt ${attempt + 1}`);
				await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
				continue;
			}
			return content;
		} catch {
			await new Promise((r) => setTimeout(r, 2000));
		}
	}
	return "";
}

// ─── Batch Judge ────────────────────────────────────────────────────────────────

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

async function batchJudge(
	mode: string,
	items: Array<{
		detailIdx: number;
		q: any;
		capName: string;
		response: string;
	}>,
	batchSize: number,
): Promise<JudgeResult[]> {
	if (mode === "keyword") {
		return items.map((item) =>
			keywordJudge(item.response, item.q, item.capName),
		);
	}

	const results: JudgeResult[] = [];

	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const prompt = buildBatchPrompt(batch);

		console.log(
			`    🤖 ${mode} batch ${Math.floor(i / batchSize) + 1}: ${batch.length} items...`,
		);

		let raw: string;
		if (mode === "gemini-pro-cli") {
			raw = callGeminiCli(prompt);
		} else if (mode === "glm-api") {
			raw = await callGlmApi(prompt);
		} else {
			// claude-cli: no batching, one by one
			for (const item of batch) {
				const singlePrompt = buildJudgePrompt(
					item.q,
					item.capName,
					item.response,
				);
				const singleRaw = callClaudeCli(singlePrompt);
				if (!singleRaw) {
					results.push(keywordJudge(item.response, item.q, item.capName));
				} else {
					results.push(parseVerdict(singleRaw));
				}
				totalPromptChars += singlePrompt.length;
				totalCompletionChars += singleRaw.length;
				judgeCallCount++;
			}
			continue;
		}

		if (!raw) {
			console.warn(`    ⚠ ${mode} returned empty, falling back to keyword`);
			for (const item of batch) {
				results.push(keywordJudge(item.response, item.q, item.capName));
			}
		} else {
			const batchResults = parseBatchVerdict(raw, batch.length);
			results.push(...batchResults);
			totalPromptChars += prompt.length;
			totalCompletionChars += raw.length;
			judgeCallCount++;
		}
	}

	return results;
}

// ─── Score Calculator ───────────────────────────────────────────────────────────

function rescore(details: Detail[]): {
	core: { total: number; passed: number; rate: number };
	bonus: { total: number; passed: number };
	grade: string;
	byCapability: Record<
		string,
		{ passed: number; total: number; weight: number }
	>;
} {
	const core = details.filter((d) => !d.isBonus);
	const bonus = details.filter((d) => d.isBonus);
	const coreWeightedPass = core.reduce(
		(sum, d) => sum + (d.pass ? d.weight : 0),
		0,
	);
	const coreWeightedTotal = core.reduce((sum, d) => sum + d.weight, 0);
	const corePassed = core.filter((d) => d.pass).length;
	const bonusPassed = bonus.filter((d) => d.pass).length;
	const coreRate =
		coreWeightedTotal > 0 ? coreWeightedPass / coreWeightedTotal : 0;
	const abstentionFail = details.some(
		(d) => d.capability === "abstention" && !d.pass,
	);

	let grade: string;
	if (abstentionFail) grade = "F (abstention fail)";
	else if (
		coreRate >= 0.9 &&
		(bonus.length === 0 || bonusPassed / bonus.length >= 0.5)
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
		core: { total: core.length, passed: corePassed, rate: coreRate },
		bonus: { total: bonus.length, passed: bonusPassed },
		grade,
		byCapability,
	};
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main() {
	const args = process.argv.slice(2);
	let inputPath = "";
	let judgeMode: "keyword" | "claude-cli" | "codex-cli" | "gemini-pro-cli" | "glm-api" =
		"gemini-pro-cli";
	let batchSize = 10;
	let categories: string[] | null = null;
	let dryRun = false;

	for (const arg of args) {
		if (arg.startsWith("--input=")) inputPath = arg.split("=")[1];
		if (arg.startsWith("--judge=")) judgeMode = arg.split("=")[1] as any;
		if (arg.startsWith("--batch-size="))
			batchSize = Number.parseInt(arg.split("=")[1], 10);
		if (arg.startsWith("--categories="))
			categories = arg.split("=")[1].split(",");
		if (arg === "--dry-run") dryRun = true;
	}

	if (!inputPath) {
		console.error(
			"Usage: judge.ts --input=<path> [--judge=gemini-pro-cli|glm-api|claude-cli|keyword] [--batch-size=10] [--categories=a,b] [--dry-run]",
		);
		process.exit(1);
	}

	console.log("\n╔══════════════════════════════════════════════════════════╗");
	console.log("║  BENCHMARK RE-JUDGE                                     ║");
	console.log(`║  Input: ${inputPath.padEnd(49)}║`);
	console.log(`║  Judge: ${judgeMode.padEnd(49)}║`);
	console.log(`║  Batch size: ${String(batchSize).padEnd(44)}║`);
	console.log("╚══════════════════════════════════════════════════════════╝\n");

	// Load saved results
	const saved: SavedResult = JSON.parse(readFileSync(inputPath, "utf-8"));

	// Load query templates to get expected_contains etc.
	const langSuffix =
		inputPath.includes("-en-") || inputPath.includes(".en.") ? ".en" : "";
	const templatesPath = langSuffix
		? new URL("../query-templates.en.json", import.meta.url).pathname
		: new URL("../query-templates.json", import.meta.url).pathname;

	let templates: any = null;
	try {
		templates = JSON.parse(readFileSync(templatesPath, "utf-8"));
	} catch {
		console.warn(
			"  ⚠ Could not load query templates — will judge from response only",
		);
	}

	// Build a lookup: capability → queries with expected values
	const queryLookup = new Map<string, any[]>();
	if (templates) {
		for (const [capName, cap] of Object.entries(templates.capabilities)) {
			queryLookup.set(capName, (cap as any).queries ?? []);
		}
	}

	startTime = Date.now();

	for (const result of saved.results) {
		console.log(`\n${"═".repeat(60)}`);
		console.log(
			`  RE-JUDGING: ${result.adapter} (${result.details.length} items)`,
		);
		console.log(`${"═".repeat(60)}\n`);

		// Collect items to judge
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

			// Find matching query template for expected_contains etc.
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

		if (dryRun) {
			console.log(`  Would judge ${items.length} items with ${judgeMode}`);
			continue;
		}

		console.log(`  Judging ${items.length} items...\n`);

		if (judgeMode === "keyword") {
			for (const item of items) {
				const v = keywordJudge(item.response, item.q, item.capName);
				const d = result.details[item.detailIdx];
				if (d) { d.pass = v.pass; d.reason = v.reason; }
			}
		} else if (judgeMode === "claude-cli") {
			for (const item of items) {
				const singlePrompt = buildJudgePrompt(item.q, item.capName, item.response);
				const singleRaw = callClaudeCli(singlePrompt);
				const v = singleRaw ? parseVerdict(singleRaw) : keywordJudge(item.response, item.q, item.capName);
				const d = result.details[item.detailIdx];
				if (d) { d.pass = v.pass; d.reason = v.reason; }
				totalPromptChars += singlePrompt.length;
				totalCompletionChars += singleRaw.length;
				judgeCallCount++;
			}
			saved.judge = judgeMode;
			saved.timestamp = new Date().toISOString();
			const scored = rescore(result.details);
			result.core = scored.core; result.bonus = scored.bonus; result.grade = scored.grade; result.byCapability = scored.byCapability;
			writeFileSync(inputPath, JSON.stringify(saved, null, 2));
		} else {
			for (let bi = 0; bi < items.length; bi += batchSize) {
				const batch = items.slice(bi, bi + batchSize);
				const prompt = buildBatchPrompt(batch);
				const batchNum = Math.floor(bi / batchSize) + 1;
				const totalBatches = Math.ceil(items.length / batchSize);
				console.log(`    🤖 ${judgeMode} batch ${batchNum}/${totalBatches}: ${batch.length} items...`);

				let raw: string;
				if (judgeMode === "gemini-pro-cli") {
					raw = callGeminiCli(prompt);
				} else if (judgeMode === "codex-cli") {
					raw = callCodexCli(prompt);
				} else {
					raw = await callGlmApi(prompt);
				}

				if (!raw) {
					console.warn(`    ⚠ ${judgeMode} returned empty, falling back to keyword`);
					for (const item of batch) {
						const v = keywordJudge(item.response, item.q, item.capName);
						const d = result.details[item.detailIdx];
						if (d) { d.pass = v.pass; d.reason = v.reason; }
					}
				} else {
					const batchResults = parseBatchVerdict(raw, batch.length);
					for (let j = 0; j < batch.length; j++) {
						const v = batchResults[j];
						const d = result.details[batch[j].detailIdx];
						if (d && v) { d.pass = v.pass; d.reason = v.reason; }
					}
					totalPromptChars += prompt.length;
					totalCompletionChars += raw.length;
					judgeCallCount++;
				}

				const scored = rescore(result.details);
				result.core = scored.core; result.bonus = scored.bonus; result.grade = scored.grade; result.byCapability = scored.byCapability;
				saved.judge = judgeMode;
				saved.timestamp = new Date().toISOString();
				writeFileSync(inputPath, JSON.stringify(saved, null, 2));
				console.log(`    💾 Saved batch ${batchNum}/${totalBatches} → ${scored.core.passed}/${scored.core.total} (${Math.round(scored.core.rate * 100)}%)`);
			}
		}

		const scored = rescore(result.details);
		console.log(`\n    ─── ${result.adapter} Result ───`);
		console.log(`    Core: ${scored.core.passed}/${scored.core.total}, weighted ${Math.round(scored.core.rate * 100)}%`);
		console.log(`    Grade: ${scored.grade}`);
		for (const [cap, data] of Object.entries(scored.byCapability)) {
			console.log(`    ${cap.padEnd(28)} ${data.passed}/${data.total}`);
		}
	}

	printTokenUsage(judgeMode);
	console.log(`\n  Final: ${inputPath}`);
}

main();
