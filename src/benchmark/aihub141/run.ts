/**
 * AI Hub 141 R2.3 multi-session recall runner.
 *
 * naia-local adapter, **standalone — no baseline comparison** (per user
 * directive: "1등 X, 한국어 쓸만함 검증").
 *
 * Output: `reports/aihub141-r2-3-{ts}.json` — absolute recall@k score, per
 * session breakdown, per-conv detail.
 *
 * Decision gate: ±2pp noise → measurement design 재검토. NOT prompt iteration.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx pnpm exec tsx src/benchmark/aihub141/run.ts [--limit=100] [--level=4] [--topK=20] [--verbose]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LocalAdapter } from "../../memory/adapters/local.js";
import {
	OpenAICompatEmbeddingProvider,
	type EmbeddingProvider,
} from "../../memory/embeddings.js";
import { MemorySystem } from "../../memory/index.js";
import { buildLLMFactExtractor } from "../../memory/llm-fact-extractor.js";
import { loadAIHub141 } from "./loader.js";
import { aggregateResults, scoreConversation } from "./scorer.js";
import type { AIHub141RecallResult } from "./types.js";

interface CLIArgs {
	limit: number;
	level: 2 | 3 | 4;
	topK: number;
	verbose: boolean;
	split: "validation" | "training";
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	let limit = 100;
	let level: 2 | 3 | 4 = 4;
	let topK = 20;
	let verbose = false;
	let split: "validation" | "training" = "validation";
	for (const a of args) {
		if (a.startsWith("--limit=")) limit = Number.parseInt(a.split("=")[1], 10);
		if (a.startsWith("--level=")) level = Number.parseInt(a.split("=")[1], 10) as 2 | 3 | 4;
		if (a.startsWith("--topK=")) topK = Number.parseInt(a.split("=")[1], 10);
		if (a === "--verbose") verbose = true;
		if (a.startsWith("--split=")) split = a.split("=")[1] as any;
	}
	return { limit, level, topK, verbose, split };
}

function buildEmbedder(apiKey: string): EmbeddingProvider {
	const gwUrl = process.env.GATEWAY_URL;
	const gwKey = process.env.GATEWAY_MASTER_KEY;
	if (gwUrl && gwKey) {
		return new OpenAICompatEmbeddingProvider(
			gwUrl,
			gwKey,
			"vertexai:gemini-embedding-001",
			3072,
		);
	}
	return new OpenAICompatEmbeddingProvider(
		"https://generativelanguage.googleapis.com/v1beta/openai/",
		apiKey,
		"gemini-embedding-001",
		3072,
	);
}

async function buildSystem(apiKey: string, cacheId: string): Promise<MemorySystem> {
	const storePath = `/tmp/aihub141-naia-${cacheId}.json`;
	const embedder = buildEmbedder(apiKey);
	const adapter = new LocalAdapter({ storePath, embeddingProvider: embedder });
	const factExtractor = buildLLMFactExtractor({ apiKey });
	return new MemorySystem({ adapter, factExtractor });
}

async function main() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error("ERROR: GEMINI_API_KEY env var required");
		process.exit(1);
	}

	const args = parseArgs();
	console.log(
		`[aihub141] split=${args.split} level=${args.level} limit=${args.limit} topK=${args.topK}`,
	);

	const conversations = await loadAIHub141({
		split: args.split,
		level: args.level,
		limit: args.limit,
	});
	console.log(`[aihub141] loaded ${conversations.length} conversations`);

	const allResults: AIHub141RecallResult[] = [];
	const startMs = Date.now();
	let system: MemorySystem | null = null;

	for (let idx = 0; idx < conversations.length; idx++) {
		const conv = conversations[idx];
		const cacheId = `${idx}-${conv.multisessionID}`;

		// Fresh MemorySystem per conversation — clean state.
		if (system) await system.close();
		// Wipe any leftover store file
		try {
			const fs = await import("node:fs");
			fs.rmSync(`/tmp/aihub141-naia-${cacheId}.json`, { force: true });
		} catch {}
		system = await buildSystem(apiKey, cacheId);

		const sys = system;
		try {
			const result = await scoreConversation(
				conv,
				{
					reset: async () => {},
					encode: async ({ content, timestampMs }) => {
						await sys.encode(
							{ content, role: "user", timestamp: timestampMs },
							{ project: "aihub141" },
						);
					},
					consolidate: async () => {
						await sys.consolidateNow(true);
					},
					recallUserFacts: async (query: string, topK: number) => {
						// CRITICAL: only facts, NOT episodes. Episode raw text would
						// give keyword-match hits even when fact extraction failed,
						// making the measurement meaningless (R2.3 verifies that
						// extracted *facts* survive multi-session, not raw turn text).
						const r = await sys.recall(query, {
							project: "aihub141",
							topK,
							deepRecall: true,
						});
						return [...new Set(r.facts.map((f) => f.content))];
					},
				},
				{ topK: args.topK, verbose: args.verbose },
			);
			allResults.push(result);

			if (!args.verbose) {
				const totalGT = result.sessionResults.reduce(
					(s, r) => s + r.groundTruthFacts.length,
					0,
				);
				const totalM = result.sessionResults.reduce(
					(s, r) => s + r.matchedCount,
					0,
				);
				console.log(
					`[${idx + 1}/${conversations.length}] ${conv.multisessionID} (${conv.topicType}): ${totalM}/${totalGT}`,
				);
			}
		} catch (e: any) {
			console.warn(`[${idx}] ${conv.multisessionID} failed: ${e?.message}`);
		}
	}

	if (system) await system.close();

	const elapsedMs = Date.now() - startMs;
	const agg = aggregateResults(allResults);

	console.log("\n=== AI Hub 141 R2.3 Recall Results ===");
	console.log(`Conversations:       ${allResults.length} / ${conversations.length}`);
	console.log(`Total sessions:      ${agg.totalSessions}`);
	console.log(`Total ground truth:  ${agg.totalGroundTruth} facts`);
	console.log(`Total matched:       ${agg.totalMatched} facts`);
	console.log(
		`Micro recall@${args.topK}: ${(agg.microRecallAtK * 100).toFixed(1)}%  (matched / GT)`,
	);
	console.log(
		`Macro recall@${args.topK}: ${(agg.macroRecallAtK * 100).toFixed(1)}%  (mean per session)`,
	);
	console.log("\nBy nthSession:");
	for (const [k, v] of Object.entries(agg.bySession).sort()) {
		console.log(
			`  S${k}: ${v.sessions} sessions, recall=${(v.recallAtK * 100).toFixed(1)}%`,
		);
	}
	console.log(`\nElapsed: ${(elapsedMs / 1000).toFixed(1)}s`);

	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const reportDir = "reports";
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `aihub141-r2-3-${ts}.json`);
	writeFileSync(
		reportPath,
		JSON.stringify(
			{
				meta: {
					ts,
					split: args.split,
					level: args.level,
					limit: args.limit,
					topK: args.topK,
					elapsedMs,
				},
				aggregate: agg,
				results: allResults,
			},
			null,
			2,
		),
		"utf-8",
	);
	console.log(`\nReport: ${reportPath}`);
}

main().catch((e) => {
	console.error("[aihub141] fatal:", e);
	process.exit(1);
});
