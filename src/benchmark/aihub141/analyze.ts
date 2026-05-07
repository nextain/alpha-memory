/**
 * AI Hub 141 report analyzer — markdown summary from report.json.
 *
 * Usage:
 *   pnpm exec tsx src/benchmark/aihub141/analyze.ts reports/aihub141-r2-3-*.json
 *
 * Output: stdout markdown — topic breakdown, difficulty distribution,
 * forgetting curve, cost (if present).
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
	};
	cost?: {
		usage?: {
			llmCalls: number;
			llmPromptTokens: number;
			llmCompletionTokens: number;
			embedCalls: number;
			embedTokens: number;
		};
		pricing?: { llmInputPerM: number; llmOutputPerM: number; embedPerM: number };
		estimatedUSD?: number;
		perConvUSD?: number;
		perConvSec?: number;
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

function pct(x: number, decimals = 1): string {
	return (x * 100).toFixed(decimals) + "%";
}

function analyze(reportPath: string): void {
	const r: ReportFile = JSON.parse(readFileSync(reportPath, "utf-8"));
	const out: string[] = [];
	out.push(`# AI Hub 141 R2.3 Report — ${r.meta.adapter ?? "naia-local"}`);
	out.push(``);
	out.push(`**Source**: \`${reportPath}\``);
	out.push(``);
	out.push(`## Meta`);
	out.push(``);
	out.push(`| key | value |`);
	out.push(`|---|---|`);
	out.push(`| ts | ${r.meta.ts} |`);
	out.push(`| adapter | ${r.meta.adapter ?? "naia-local"} |`);
	out.push(`| split / level | ${r.meta.split} / S${r.meta.level} |`);
	out.push(`| conversations | ${r.results.length} (limit ${r.meta.limit}) |`);
	out.push(`| topK | ${r.meta.topK} |`);
	out.push(`| elapsed | ${(r.meta.elapsedMs ?? 0) / 1000}s |`);
	out.push(``);

	out.push(`## Recall`);
	out.push(``);
	out.push(`| metric | value |`);
	out.push(`|---|---|`);
	out.push(
		`| **Micro recall@${r.meta.topK}** | **${pct(r.aggregate.microRecallAtK)}** (${r.aggregate.totalMatched}/${r.aggregate.totalGroundTruth}) |`,
	);
	out.push(
		`| Macro recall@${r.meta.topK} | ${pct(r.aggregate.macroRecallAtK)} |`,
	);
	out.push(`| Total sessions | ${r.aggregate.totalSessions} |`);
	out.push(``);

	out.push(`## Forgetting curve (per nthSession)`);
	out.push(``);
	out.push(`| session | sessions | recall@k |`);
	out.push(`|---|---|---|`);
	for (const k of Object.keys(r.aggregate.bySession).sort()) {
		const v = r.aggregate.bySession[k];
		out.push(`| S${k} | ${v.sessions} | ${pct(v.recallAtK)} |`);
	}
	out.push(``);

	// Per-topic breakdown
	const byTopic = new Map<string, { gt: number; matched: number; convs: number }>();
	for (const c of r.results) {
		const topic = c.topicType ?? "(none)";
		const cur = byTopic.get(topic) ?? { gt: 0, matched: 0, convs: 0 };
		cur.convs++;
		for (const s of c.sessionResults) {
			cur.gt += s.groundTruthFacts.length;
			cur.matched += s.matchedCount;
		}
		byTopic.set(topic, cur);
	}
	const topicRows = [...byTopic.entries()]
		.map(([t, v]) => ({
			topic: t,
			convs: v.convs,
			gt: v.gt,
			matched: v.matched,
			recall: v.gt > 0 ? v.matched / v.gt : 0,
		}))
		.sort((a, b) => b.recall - a.recall);

	out.push(`## Per-topic breakdown (${topicRows.length} topics)`);
	out.push(``);
	out.push(`| topic | convs | matched/GT | recall |`);
	out.push(`|---|---|---|---|`);
	for (const t of topicRows) {
		out.push(
			`| ${t.topic} | ${t.convs} | ${t.matched}/${t.gt} | ${pct(t.recall)} |`,
		);
	}
	out.push(``);

	// Difficulty distribution
	const buckets = { easy: 0, medium: 0, hard: 0, total: 0 };
	for (const c of r.results) {
		const gt = c.sessionResults.reduce((s, x) => s + x.groundTruthFacts.length, 0);
		const m = c.sessionResults.reduce((s, x) => s + x.matchedCount, 0);
		if (gt === 0) continue;
		const recall = m / gt;
		buckets.total++;
		if (recall >= 0.7) buckets.easy++;
		else if (recall >= 0.3) buckets.medium++;
		else buckets.hard++;
	}
	out.push(`## Difficulty distribution`);
	out.push(``);
	out.push(`| bucket | recall range | conversations | % |`);
	out.push(`|---|---|---|---|`);
	out.push(
		`| easy | ≥ 70% | ${buckets.easy} | ${pct(buckets.easy / Math.max(1, buckets.total))} |`,
	);
	out.push(
		`| medium | 30-70% | ${buckets.medium} | ${pct(buckets.medium / Math.max(1, buckets.total))} |`,
	);
	out.push(
		`| hard | < 30% | ${buckets.hard} | ${pct(buckets.hard / Math.max(1, buckets.total))} |`,
	);
	out.push(``);

	// Cost (if present)
	if (r.cost) {
		out.push(`## Cost`);
		out.push(``);
		out.push(`| key | value |`);
		out.push(`|---|---|`);
		if (r.cost.usage) {
			out.push(
				`| LLM calls | ${r.cost.usage.llmCalls} (${r.cost.usage.llmPromptTokens} in / ${r.cost.usage.llmCompletionTokens} out tokens) |`,
			);
			out.push(
				`| Embed calls | ${r.cost.usage.embedCalls} (${r.cost.usage.embedTokens} tokens) |`,
			);
		}
		if (r.cost.pricing) {
			out.push(
				`| Pricing | $${r.cost.pricing.llmInputPerM}/M in, $${r.cost.pricing.llmOutputPerM}/M out, $${r.cost.pricing.embedPerM}/M embed |`,
			);
		}
		out.push(
			`| **Total estimated** | **$${(r.cost.estimatedUSD ?? 0).toFixed(4)}** |`,
		);
		out.push(
			`| Per-conv | $${(r.cost.perConvUSD ?? 0).toFixed(5)} / ${(r.cost.perConvSec ?? 0).toFixed(1)}s |`,
		);
		out.push(``);
	}

	// Hardest 5 conversations
	const sorted = [...r.results]
		.map((c) => {
			const gt = c.sessionResults.reduce(
				(s, x) => s + x.groundTruthFacts.length,
				0,
			);
			const m = c.sessionResults.reduce((s, x) => s + x.matchedCount, 0);
			return { c, gt, m, recall: gt > 0 ? m / gt : 0 };
		})
		.filter((x) => x.gt > 0)
		.sort((a, b) => a.recall - b.recall);

	out.push(`## Hardest 5 conversations (lowest recall)`);
	out.push(``);
	out.push(`| id | topic | matched/GT | recall |`);
	out.push(`|---|---|---|---|`);
	for (const x of sorted.slice(0, 5)) {
		out.push(
			`| ${x.c.multisessionID} | ${x.c.topicType} | ${x.m}/${x.gt} | ${pct(x.recall)} |`,
		);
	}
	out.push(``);

	console.log(out.join("\n"));
}

const path = process.argv[2];
if (!path) {
	console.error("Usage: tsx analyze.ts <report.json>");
	process.exit(1);
}
analyze(path);
