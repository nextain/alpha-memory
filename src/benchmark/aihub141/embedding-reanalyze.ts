/**
 * Embedding-cosine reanalysis of an aihub141 report.
 *
 * Hard match 가 0% 였던 이유 = naia atomic fact ("사용자 X: Y") vs GT 자연
 * phrase ("나는 X 이다") 의 surface 차이. paraphrase 의미 보존을 *embedding
 * cosine* 로만 정확 측정 가능.
 *
 * 비용 ~$0.1, 시간 1-2분 (batch embedding via gateway).
 *
 * Usage:
 *   GEMINI_API_KEY=xxx GATEWAY_URL=... GATEWAY_MASTER_KEY=... \
 *     pnpm exec tsx src/benchmark/aihub141/embedding-reanalyze.ts reports/*.json
 */

import { readFileSync, writeFileSync } from "node:fs";
import { OpenAICompatEmbeddingProvider } from "../../memory/embeddings.js";
import {
	estimateCostUSD,
	getPricingFromEnv,
	getUsage,
	resetUsage,
} from "../../memory/usage-tracker.js";
import type { AIHub141RecallResult } from "./types.js";

interface ReportFile {
	meta: { adapter?: string; topK?: number; ts: string };
	results: AIHub141RecallResult[];
}

function pct(x: number): string {
	return (x * 100).toFixed(1) + "%";
}

function cosine(a: number[], b: number[]): number {
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		na += a[i] * a[i];
		nb += b[i] * b[i];
	}
	return dot / Math.sqrt(na * nb + 1e-10);
}

async function batchEmbed(
	texts: string[],
	provider: OpenAICompatEmbeddingProvider,
	batchSize = 100,
): Promise<Map<string, number[]>> {
	const unique = [...new Set(texts.filter((t) => t && t.length > 0))];
	const cache = new Map<string, number[]>();
	for (let i = 0; i < unique.length; i += batchSize) {
		const batch = unique.slice(i, i + batchSize);
		const vecs = await provider.embedBatch(batch);
		for (let j = 0; j < batch.length; j++) cache.set(batch[j], vecs[j]);
		const done = Math.min(i + batchSize, unique.length);
		process.stderr.write(`\r[embed] ${done}/${unique.length}`);
	}
	process.stderr.write("\n");
	return cache;
}

function buildEmbedder(): OpenAICompatEmbeddingProvider {
	const gwUrl = process.env.GATEWAY_URL;
	const gwKey = process.env.GATEWAY_MASTER_KEY;
	const apiKey = process.env.GEMINI_API_KEY;
	if (gwUrl && gwKey) {
		return new OpenAICompatEmbeddingProvider(
			gwUrl,
			gwKey,
			"vertexai:gemini-embedding-001",
			3072,
		);
	}
	if (!apiKey) throw new Error("GEMINI_API_KEY required if no gateway");
	return new OpenAICompatEmbeddingProvider(
		"https://generativelanguage.googleapis.com/v1beta/openai/",
		apiKey,
		"gemini-embedding-001",
		3072,
	);
}

interface MetricRow {
	totalGT: number;
	totalMatched: number;
	recallAtK: number;
}

function recompute(
	results: AIHub141RecallResult[],
	K: number,
	threshold: number,
	emb: Map<string, number[]>,
): MetricRow {
	let totalGT = 0;
	let totalMatched = 0;
	for (const conv of results) {
		for (const s of conv.sessionResults) {
			const recalledTopK = s.recalledFacts.slice(0, K);
			const recalledVecs = recalledTopK
				.map((r) => emb.get(r))
				.filter((v): v is number[] => !!v);
			for (const gt of s.groundTruthFacts) {
				totalGT++;
				const gtVec = emb.get(gt);
				if (!gtVec) continue;
				let bestCos = -1;
				for (const rv of recalledVecs) {
					const c = cosine(gtVec, rv);
					if (c > bestCos) bestCos = c;
				}
				if (bestCos >= threshold) totalMatched++;
			}
		}
	}
	return {
		totalGT,
		totalMatched,
		recallAtK: totalGT > 0 ? totalMatched / totalGT : 0,
	};
}

async function main() {
	const reportPath = process.argv[2];
	if (!reportPath) {
		console.error("Usage: tsx embedding-reanalyze.ts <report.json>");
		process.exit(1);
	}
	const r: ReportFile = JSON.parse(readFileSync(reportPath, "utf-8"));

	const allFacts: string[] = [];
	for (const c of r.results) {
		for (const s of c.sessionResults) {
			allFacts.push(...s.groundTruthFacts);
			allFacts.push(...s.recalledFacts);
		}
	}
	const unique = [...new Set(allFacts.filter((t) => t && t.length > 0))];
	console.error(`[embed] ${unique.length} unique facts to embed`);

	resetUsage();
	const startMs = Date.now();
	const provider = buildEmbedder();
	const cache = await batchEmbed(unique, provider);
	const elapsedMs = Date.now() - startMs;

	const usage = getUsage();
	const pricing = getPricingFromEnv();
	const costUSD = estimateCostUSD(usage, pricing);

	const out: string[] = [];
	out.push(`# AI Hub 141 R2.3 — Embedding Cosine 재해석`);
	out.push(``);
	out.push(`**Source**: \`${reportPath}\``);
	out.push(`**Adapter**: ${r.meta.adapter ?? "naia-local"}`);
	out.push(``);
	out.push(`> Hard match 0% 의 진짜 의미 측정. naia atomic fact paraphrase 가 의미 보존했는지 embedding cosine 로 검증.`);
	out.push(``);

	out.push(`## Embedding setup`);
	out.push(``);
	out.push(`- Provider: vertexai:gemini-embedding-001 (3072d)`);
	out.push(`- Unique facts: ${unique.length}`);
	out.push(`- Embed time: ${(elapsedMs / 1000).toFixed(1)}s`);
	out.push(`- Cost: $${costUSD.toFixed(4)} (${usage.embedCalls} calls, ${usage.embedTokens} tokens)`);
	out.push(``);

	out.push(`## Cosine recall@K (threshold sweep)`);
	out.push(``);
	out.push(`| threshold | recall@5 | recall@10 | recall@20 |`);
	out.push(`|---|---|---|---|`);
	for (const th of [0.5, 0.6, 0.65, 0.7, 0.75, 0.8]) {
		const r5 = recompute(r.results, 5, th, cache);
		const r10 = recompute(r.results, 10, th, cache);
		const r20 = recompute(r.results, 20, th, cache);
		out.push(
			`| ${th} | ${pct(r5.recallAtK)} | ${pct(r10.recallAtK)} | ${pct(r20.recallAtK)} |`,
		);
	}
	out.push(``);

	out.push(`## 의미 분석`);
	out.push(``);
	out.push(`- threshold 0.5 = *느슨* (paraphrase 인정 폭 큼)`);
	out.push(`- threshold 0.7 = *통상* (semantic similarity 일반 cutoff)`);
	out.push(`- threshold 0.8 = *엄격* (거의 동일 의미만)`);
	out.push(``);
	out.push(`hard match 0% 의 진짜 의미 = surface 다르지만 의미 보존된 paraphrase 비율을 cosine 으로 측정 가능.`);
	out.push(``);

	console.log(out.join("\n"));

	const outPath = reportPath.replace(/\.json$/, "-embedding-reanalysis.md");
	writeFileSync(outPath, out.join("\n"), "utf-8");
	console.error(`\nReport: ${outPath}`);
}

main().catch((e) => {
	console.error("[fatal]", e);
	process.exit(1);
});
