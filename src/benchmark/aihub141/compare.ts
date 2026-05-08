/**
 * Compare multiple aihub141 reports across A/B mechanism modes.
 *
 * Phase B-γ — naia-local default vs --no-importance vs --no-kg vs both,
 * naia-on-mem0 hybrid 등.
 *
 * Usage:
 *   pnpm exec tsx src/benchmark/aihub141/compare.ts \
 *     reports/aihub141-r2-3-naia-local-default-*.json \
 *     reports/aihub141-r2-3-naia-local-no-importance-*.json \
 *     reports/aihub141-r2-3-naia-local-no-kg-*.json \
 *     ...
 *
 * Output: stdout markdown — recall@k 비교 + per-session breakdown +
 * delta from baseline + mechanism 효과 정량.
 */

import { readFileSync } from "node:fs";
import type { AIHub141RecallResult } from "./types.js";

interface ReportFile {
	meta: {
		ts: string;
		adapter?: string;
		split?: string;
		level?: number;
		limit?: number;
		topK?: number;
		elapsedMs?: number;
		disableImportanceGating?: boolean;
		disableKGSpreading?: boolean;
	};
	cost?: {
		estimatedUSD?: number;
		usage?: { llmCalls: number; embedCalls: number };
	};
	aggregate: {
		totalSessions: number;
		totalGroundTruth: number;
		totalMatched: number;
		microRecallAtK: number;
		macroRecallAtK: number;
		bySession: Record<string, { sessions: number; recallAtK: number }>;
	};
	results: AIHub141RecallResult[];
}

function pct(x: number): string {
	return (x * 100).toFixed(1) + "%";
}

function deltaPp(treatment: number, baseline: number): string {
	const delta = (treatment - baseline) * 100;
	const sign = delta >= 0 ? "+" : "";
	return `${sign}${delta.toFixed(1)}pp`;
}

function modeLabel(meta: ReportFile["meta"]): string {
	const adapter = meta.adapter ?? "naia-local";
	const tags: string[] = [];
	if (meta.disableImportanceGating) tags.push("no-importance");
	if (meta.disableKGSpreading) tags.push("no-kg");
	if (tags.length === 0) tags.push("default");
	return `${adapter} | ${tags.join("+")}`;
}

function loadReport(path: string): ReportFile {
	return JSON.parse(readFileSync(path, "utf-8"));
}

function main() {
	const paths = process.argv.slice(2);
	if (paths.length === 0) {
		console.error("Usage: tsx compare.ts <report1.json> <report2.json> ...");
		process.exit(1);
	}

	const reports = paths.map(loadReport);
	const baseline = reports[0]; // first = baseline reference

	const out: string[] = [];
	out.push(`# AI Hub 141 R2.3 — A/B Mechanism Comparison`);
	out.push(``);
	out.push(`Baseline = first report (${modeLabel(baseline.meta)}).`);
	out.push(``);

	out.push(`## Recall@${baseline.meta.topK}`);
	out.push(``);
	out.push(`| Mode | Conv | Total GT | Matched | Micro recall | Δ baseline |`);
	out.push(`|---|---:|---:|---:|---:|---:|`);
	for (const r of reports) {
		const isBase = r === baseline;
		out.push(
			`| ${modeLabel(r.meta)} | ${r.results.length} | ${r.aggregate.totalGroundTruth} | ${r.aggregate.totalMatched} | **${pct(r.aggregate.microRecallAtK)}** | ${isBase ? "—" : deltaPp(r.aggregate.microRecallAtK, baseline.aggregate.microRecallAtK)} |`,
		);
	}
	out.push(``);

	out.push(`## Macro recall (per-session mean)`);
	out.push(``);
	out.push(`| Mode | Macro recall | Δ baseline |`);
	out.push(`|---|---:|---:|`);
	for (const r of reports) {
		const isBase = r === baseline;
		out.push(
			`| ${modeLabel(r.meta)} | ${pct(r.aggregate.macroRecallAtK)} | ${isBase ? "—" : deltaPp(r.aggregate.macroRecallAtK, baseline.aggregate.macroRecallAtK)} |`,
		);
	}
	out.push(``);

	out.push(`## Per-nthSession`);
	out.push(``);
	const sessions = [
		...new Set(reports.flatMap((r) => Object.keys(r.aggregate.bySession))),
	].sort();
	out.push(`| Mode | ${sessions.map((s) => `S${s}`).join(" | ")} |`);
	out.push(`|---|${sessions.map(() => "---:").join("|")}|`);
	for (const r of reports) {
		const cells = sessions.map((s) => {
			const v = r.aggregate.bySession[s];
			return v ? pct(v.recallAtK) : "—";
		});
		out.push(`| ${modeLabel(r.meta)} | ${cells.join(" | ")} |`);
	}
	out.push(``);

	out.push(`## Cost / Time`);
	out.push(``);
	out.push(`| Mode | Elapsed | LLM calls | Embed calls | Cost USD |`);
	out.push(`|---|---:|---:|---:|---:|`);
	for (const r of reports) {
		const elapsedMin = ((r.meta.elapsedMs ?? 0) / 1000 / 60).toFixed(1);
		const cost = r.cost?.estimatedUSD?.toFixed(4) ?? "—";
		const llm = r.cost?.usage?.llmCalls ?? "—";
		const embed = r.cost?.usage?.embedCalls ?? "—";
		out.push(
			`| ${modeLabel(r.meta)} | ${elapsedMin} min | ${llm} | ${embed} | ${cost} |`,
		);
	}
	out.push(``);

	out.push(`## Mechanism 효과 정량 (vs baseline)`);
	out.push(``);
	out.push(
		`각 treatment 의 *baseline 대비 micro recall 변화* — mechanism 의 *실제 효과 정량*.`,
	);
	out.push(``);
	for (const r of reports) {
		if (r === baseline) continue;
		const delta = (r.aggregate.microRecallAtK - baseline.aggregate.microRecallAtK) * 100;
		const sign = delta >= 0 ? "+" : "";
		const interpretation =
			Math.abs(delta) < 2
				? "noise band ±2pp 안 — 효과 미미"
				: delta > 0
					? "treatment 가 baseline 보다 **좋음** — 해당 mechanism 이 *방해* 였을 가능성"
					: "treatment 가 baseline 보다 **나쁨** — 해당 mechanism 의 *진짜 가치* 정량";
		out.push(`- **${modeLabel(r.meta)}**: ${sign}${delta.toFixed(1)}pp — ${interpretation}`);
	}
	out.push(``);

	out.push(`## 해석 가이드`);
	out.push(``);
	out.push(`- *baseline (default)* = 모든 mechanism ON, Phase A 의 76.8% cosine 이 reference`);
	out.push(`- *--no-importance* = importance gating 효과 측정 (gating 없으면 어떻게?)`);
	out.push(`- *--no-kg* = KG spreading activation 효과 (graph 활성 없이 vector + BM25 만)`);
	out.push(`- *둘 다 OFF* = 두 mechanism 모두 없는 단순 retrieval`);
	out.push(``);
	out.push(`해석:`);
	out.push(`- baseline > treatment 큰 차이 → mechanism 진짜 가치 ✓`);
	out.push(`- baseline ≈ treatment → mechanism 효과 미미 (noise band)`);
	out.push(`- baseline < treatment → mechanism 이 *오히려 방해* (재검토 필요)`);
	out.push(``);

	console.log(out.join("\n"));
}

main();
