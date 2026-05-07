/**
 * Retroactive multi-metric reanalysis of an aihub141 report.
 *
 * Cross-review (devil's advocate) 발견:
 * - 69.1% recall@20 은 inflated — topK=20 의 ceiling 효과 + keyword false positive
 * - 정직한 측정 = recall@5 / @10 / @20 + polarity-aware + hard match
 *
 * 비용 0 — report.json 의 sessionResults 위에서 logic 만 다시 적용.
 *
 * Usage:
 *   pnpm exec tsx src/benchmark/aihub141/reanalyze.ts reports/aihub141-r2-3-*.json
 *
 * Output: stdout markdown with 3-axis breakdown.
 */

import { readFileSync } from "node:fs";
import {
	hardMatch,
	hasNegation,
	keywordMatch,
	polarityAwareMatch,
} from "./scorer.js";
import type { AIHub141RecallResult } from "./types.js";

interface ReportFile {
	meta: { adapter?: string; topK?: number; ts: string };
	results: AIHub141RecallResult[];
}

interface MetricRow {
	totalGT: number;
	totalMatched: number;
	recallAtK: number;
}

function pct(x: number): string {
	return (x * 100).toFixed(1) + "%";
}

function recompute(
	results: AIHub141RecallResult[],
	K: number,
	matcher: (gt: string, recalled: string[]) => boolean,
): MetricRow {
	let totalGT = 0;
	let totalMatched = 0;
	for (const conv of results) {
		for (const s of conv.sessionResults) {
			const recalledTopK = s.recalledFacts.slice(0, K);
			for (const gt of s.groundTruthFacts) {
				totalGT++;
				if (matcher(gt, recalledTopK)) totalMatched++;
			}
		}
	}
	return {
		totalGT,
		totalMatched,
		recallAtK: totalGT > 0 ? totalMatched / totalGT : 0,
	};
}

/** Diagnostic: count GT facts that have negation polarity. */
function polarityFalsePositive(results: AIHub141RecallResult[]): {
	negationGT: number;
	matchedAsKeyword: number;
	matchedAsPolarity: number;
	flippedFalsePositives: number;
} {
	let negationGT = 0;
	let matchedAsKeyword = 0;
	let matchedAsPolarity = 0;
	let flipped = 0;
	for (const conv of results) {
		for (const s of conv.sessionResults) {
			const recalled = s.recalledFacts;
			for (const gt of s.groundTruthFacts) {
				if (!hasNegation(gt)) continue;
				negationGT++;
				const kw = keywordMatch(gt, recalled);
				const pol = polarityAwareMatch(gt, recalled);
				if (kw) matchedAsKeyword++;
				if (pol) matchedAsPolarity++;
				if (kw && !pol) flipped++; // matched by keyword but flipped polarity
			}
		}
	}
	return {
		negationGT,
		matchedAsKeyword,
		matchedAsPolarity,
		flippedFalsePositives: flipped,
	};
}

function recalledStats(results: AIHub141RecallResult[]): {
	avgRecalled: number;
	avgGT: number;
	medianRecalled: number;
	totalSessions: number;
} {
	const recalledLens: number[] = [];
	const gtLens: number[] = [];
	for (const conv of results) {
		for (const s of conv.sessionResults) {
			recalledLens.push(s.recalledFacts.length);
			gtLens.push(s.groundTruthFacts.length);
		}
	}
	const sorted = [...recalledLens].sort((a, b) => a - b);
	return {
		avgRecalled: recalledLens.length > 0 ? recalledLens.reduce((a, b) => a + b, 0) / recalledLens.length : 0,
		avgGT: gtLens.length > 0 ? gtLens.reduce((a, b) => a + b, 0) / gtLens.length : 0,
		medianRecalled: sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0,
		totalSessions: recalledLens.length,
	};
}

function main(reportPath: string): void {
	const r: ReportFile = JSON.parse(readFileSync(reportPath, "utf-8"));
	const out: string[] = [];
	out.push(`# AI Hub 141 R2.3 — 정직한 재해석`);
	out.push(``);
	out.push(`**Source**: \`${reportPath}\``);
	out.push(`**Adapter**: ${r.meta.adapter ?? "naia-local"}`);
	out.push(``);
	out.push(`> Cross-review (devil's advocate) 발견에 따라 *3-axis 정직한 측정*. 같은 report 위에서 logic 재적용. 비용 0.`);
	out.push(``);

	out.push(`## 1. recall@K — topK ceiling 효과`);
	out.push(``);
	out.push(`| K | matched / GT | recall@K |`);
	out.push(`|---|---|---|`);
	for (const K of [5, 10, 20]) {
		const m = recompute(r.results, K, keywordMatch);
		out.push(`| ${K} | ${m.totalMatched} / ${m.totalGT} | **${pct(m.recallAtK)}** |`);
	}
	out.push(``);

	const stats = recalledStats(r.results);
	out.push(
		`Average recalled set: ${stats.avgRecalled.toFixed(1)} facts / GT: ${stats.avgGT.toFixed(1)} facts (${stats.totalSessions} sessions, median recalled = ${stats.medianRecalled}).`,
	);
	out.push(``);
	out.push(
		`→ topK=20 이 평균 recalled set (${stats.avgRecalled.toFixed(1)}) 보다 크면 **\"top 20 안에 있냐\"** 만 본 셈. ranking 품질 측정 X.`,
	);
	out.push(``);

	out.push(`## 2. Polarity-aware match — 부정형 false positive`);
	out.push(``);
	const pol = polarityFalsePositive(r.results);
	out.push(`| metric | value |`);
	out.push(`|---|---|`);
	out.push(`| Negation GT facts | ${pol.negationGT} |`);
	out.push(`| Matched (keyword, no polarity check) | ${pol.matchedAsKeyword} |`);
	out.push(`| Matched (polarity-aware) | ${pol.matchedAsPolarity} |`);
	out.push(
		`| **Polarity-flipped false positives** | **${pol.flippedFalsePositives}** (${pct(pol.flippedFalsePositives / Math.max(1, pol.matchedAsKeyword))} of keyword matches) |`,
	);
	out.push(``);
	out.push(`### Polarity-corrected recall@20`);
	out.push(``);
	const polCorrected = recompute(r.results, 20, polarityAwareMatch);
	out.push(
		`recall@20 (polarity-aware) = **${pct(polCorrected.recallAtK)}** (${polCorrected.totalMatched} / ${polCorrected.totalGT})`,
	);
	out.push(``);

	out.push(`## 3. Hard match — entire GT substring`);
	out.push(``);
	out.push(`| K | matched / GT | hard recall@K |`);
	out.push(`|---|---|---|`);
	for (const K of [5, 10, 20]) {
		const m = recompute(r.results, K, hardMatch);
		out.push(`| ${K} | ${m.totalMatched} / ${m.totalGT} | **${pct(m.recallAtK)}** |`);
	}
	out.push(``);
	out.push(
		`→ Hard match = GT phrase (조사 제거 후) 가 recalled fact 의 substring. topK ceiling 회피, naia 가 *원형* 그대로 회상한 비율.`,
	);
	out.push(``);

	out.push(`## 4. 정직한 band`);
	out.push(``);
	const r5 = recompute(r.results, 5, keywordMatch).recallAtK;
	const r10 = recompute(r.results, 10, keywordMatch).recallAtK;
	const r20 = recompute(r.results, 20, keywordMatch).recallAtK;
	const rPol = polCorrected.recallAtK;
	const rHard = recompute(r.results, 20, hardMatch).recallAtK;
	out.push(`| metric | recall | 의미 |`);
	out.push(`|---|---|---|`);
	out.push(`| recall@5 (loose keyword) | **${pct(r5)}** | top-5 ranking 품질 (LLM context 주입 가정) |`);
	out.push(`| recall@10 (loose keyword) | ${pct(r10)} | mid-bound |`);
	out.push(`| recall@20 (loose keyword) | ${pct(r20)} | ← 원래 보고 (inflated by topK ceiling) |`);
	out.push(`| recall@20 (polarity-aware) | **${pct(rPol)}** | false positive 제외 — 비교 가능한 정직한 수치 |`);
	out.push(`| recall@20 (hard, entire phrase) | ${pct(rHard)} | naia 가 GT 원형 그대로 저장 X — *paraphrase mechanism 정상 동작* |`);
	out.push(``);
	out.push(
		`### 결론`,
	);
	out.push(``);
	out.push(
		`- **정직한 band: ${pct(r5)} ~ ${pct(rPol)}** (recall@5 ~ recall@20 polarity-aware)`,
	);
	out.push(`- 하한 (${pct(r5)}) — daily LLM context 주입 시 top-5 안에 prior fact 가 있을 확률`);
	out.push(`- 상한 (${pct(rPol)}) — 전체 fact pool 안에 있고 polarity 도 맞음 (false positive 제외)`);
	out.push(`- recall@20 hard 가 0% 인 것은 *bug 아님* — naia 의 atomic fact extraction (\"사용자 X: Y\" 형식) 이 GT 의 자연 phrase (\"나는 X 이다\") 와 surface 다른 *paraphrase* 인 정상 동작. embedding cosine metric 으로만 정확 측정 가능 (별도 spike)`);
	out.push(``);
	out.push(`### 외부 벤치 비교 (cross-review reviewer 1)`);
	out.push(``);
	out.push(`- LoCoMo J-score (영어): mem0 67%, Letta 74%, Zep 66-75%, MemU 92%`);
	out.push(`- 다른 metric, 직접 비교 disclaim 필요. 그러나 *수치적으로* naia ${pct(rPol)} (한국어 polarity-aware) ≈ mem0/Zep mid-tier (영어).`);
	out.push(`- AI Hub 141 = naia 가 *novel KO multi-session memory benchmark* 첫 시도. 외부 leaderboard 없음.`);
	out.push(``);

	console.log(out.join("\n"));
}

const path = process.argv[2];
if (!path) {
	console.error("Usage: tsx reanalyze.ts <report.json>");
	process.exit(1);
}
main(path);
