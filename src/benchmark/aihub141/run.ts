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
 *
 * Phase B-γ A/B mechanism toggles (independent, can be combined):
 *   --no-importance   neutralize 3-axis importance score (utility=1.0)
 *   --no-kg           skip knowledge-graph spreading-activation at recall
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Mem0Adapter } from "../comparison/adapter-mem0.js";
import { LocalAdapter } from "../../memory/adapters/local.js";
import { Mem0Adapter as NaiaMem0Adapter } from "../../memory/adapters/mem0.js";
import {
	OpenAICompatEmbeddingProvider,
	type EmbeddingProvider,
} from "../../memory/embeddings.js";
import { MemorySystem } from "../../memory/index.js";
import { buildLLMFactExtractor } from "../../memory/llm-fact-extractor.js";
import {
	estimateCostUSD,
	getPricingFromEnv,
	getUsage,
	resetUsage,
} from "../../memory/usage-tracker.js";
import { loadAIHub141 } from "./loader.js";
import { aggregateResults, scoreConversation } from "./scorer.js";
import type { AIHub141RecallResult } from "./types.js";

type AdapterKind = "naia-local" | "no-memory" | "mem0" | "naia-on-mem0";

interface CLIArgs {
	limit: number;
	level: 2 | 3 | 4;
	topK: number;
	verbose: boolean;
	split: "validation" | "training";
	adapter: AdapterKind;
	/** Phase B-γ A/B toggle — when true, MemorySystem is built with
	 *  `disableImportanceGating: true` so the 3-axis importance score is
	 *  neutralized for the run. Used to compare gating ON vs OFF. */
	noImportance: boolean;
	/** Phase B-γ A/B toggle — when true, the underlying adapter is built
	 *  with `disableKGSpreading: true` so the knowledge-graph spreading
	 *  activation step is skipped at recall time (ranking falls back to
	 *  vector cosine + BM25 only). The graph itself is still built —
	 *  only the lookup-side propagation is bypassed. Used to compare
	 *  KG spreading ON vs OFF. */
	noKg: boolean;
	/** #27 Step 1 sweep — minConfidence threshold for retrieval. */
	minConfidence: number;
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	let limit = 100;
	let level: 2 | 3 | 4 = 4;
	let topK = 20;
	let verbose = false;
	let split: "validation" | "training" = "validation";
	let adapter: AdapterKind = "naia-local";
	let noImportance = false;
	let noKg = false;
	let minConfidence = 0;
	for (const a of args) {
		if (a.startsWith("--limit=")) limit = Number.parseInt(a.split("=")[1], 10);
		if (a.startsWith("--level=")) level = Number.parseInt(a.split("=")[1], 10) as 2 | 3 | 4;
		if (a.startsWith("--topK=")) topK = Number.parseInt(a.split("=")[1], 10);
		if (a === "--verbose") verbose = true;
		if (a.startsWith("--split=")) split = a.split("=")[1] as any;
		if (a.startsWith("--adapter=")) adapter = a.split("=")[1] as AdapterKind;
		if (a === "--no-importance") noImportance = true;
		if (a === "--no-kg") noKg = true;
		if (a.startsWith("--min-confidence=")) minConfidence = Number.parseFloat(a.split("=")[1]);
	}
	return { limit, level, topK, verbose, split, adapter, noImportance, noKg, minConfidence };
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

async function buildSystem(
	apiKey: string,
	cacheId: string,
	opts: {
		disableImportanceGating?: boolean;
		disableKGSpreading?: boolean;
	} = {},
): Promise<MemorySystem> {
	const storePath = `/tmp/aihub141-naia-${cacheId}.json`;
	const embedder = buildEmbedder(apiKey);
	const adapter = new LocalAdapter({
		storePath,
		embeddingProvider: embedder,
		disableKGSpreading: opts.disableKGSpreading ?? false,
	});
	const factExtractor = buildLLMFactExtractor({ apiKey });
	return new MemorySystem({
		adapter,
		factExtractor,
		disableImportanceGating: opts.disableImportanceGating ?? false,
	});
}

/** naia-on-mem0 hybrid: naia capability (R2.3 / R2.5 / decay / KG) on top
 *  of mem0 OSS backend (vector store + LLM dedup). The "stack on top"
 *  pattern from CLAUDE.md / decision-matrix §A06.
 */
async function buildSystemOnMem0(
	apiKey: string,
	cacheId: string,
	opts: {
		disableImportanceGating?: boolean;
		disableKGSpreading?: boolean;
	} = {},
): Promise<MemorySystem> {
	const useGateway = !!(process.env.GATEWAY_URL && process.env.GATEWAY_MASTER_KEY);
	const gwBase = process.env.GATEWAY_URL ?? "";
	const gwKey = process.env.GATEWAY_MASTER_KEY ?? "";
	const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";

	const embedderConfig = useGateway
		? {
				apiKey: gwKey,
				baseURL: `${gwBase}/v1/`,
				model: "vertexai:text-embedding-004",
				user: "benchmark",
			}
		: { apiKey, baseURL: GEMINI_BASE, model: "gemini-embedding-001" };

	const llmConfig = useGateway
		? {
				apiKey: gwKey,
				baseURL: `${gwBase}/v1/`,
				model: "vertexai:gemini-2.5-flash",
				user: "benchmark",
			}
		: { apiKey, baseURL: GEMINI_BASE, model: "gemini-2.5-flash" };

	const mem0Config = {
		embedder: { provider: "openai", config: embedderConfig as Record<string, any> },
		vectorStore: {
			provider: "memory",
			config: {
				collectionName: "bench",
				dimension: useGateway ? 768 : 3072,
				dbPath: `/tmp/aihub141-naia-on-mem0-${cacheId}-vec.db`,
			},
		},
		llm: { provider: "openai", config: llmConfig as Record<string, any> },
		historyDbPath: `/tmp/aihub141-naia-on-mem0-${cacheId}-hist.db`,
	};

	const adapter = new NaiaMem0Adapter({
		mem0Config,
		userId: "benchmark",
		disableKGSpreading: opts.disableKGSpreading ?? false,
	});
	const factExtractor = buildLLMFactExtractor({ apiKey });
	return new MemorySystem({
		adapter,
		factExtractor,
		disableImportanceGating: opts.disableImportanceGating ?? false,
	});
}

async function main() {
	const args = parseArgs();
	const apiKey = process.env.GEMINI_API_KEY;
	if (args.adapter !== "no-memory" && !apiKey) {
		console.error(`ERROR: GEMINI_API_KEY env var required for ${args.adapter}`);
		process.exit(1);
	}

	console.log(
		`[aihub141] adapter=${args.adapter} split=${args.split} level=${args.level} limit=${args.limit} topK=${args.topK} importance=${args.noImportance ? "OFF" : "ON"} kg=${args.noKg ? "OFF" : "ON"} minConfidence=${args.minConfidence}`,
	);

	const conversations = await loadAIHub141({
		split: args.split,
		level: args.level,
		limit: args.limit,
	});
	console.log(`[aihub141] loaded ${conversations.length} conversations`);

	resetUsage();
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

		// Build hooks per adapter kind. no-memory = absolute floor (0% expected),
		// proves naia recall is mechanism-driven not coincidental keyword overlap.
		let hooks;
		let mem0Inst: Mem0Adapter | null = null;
		if (args.adapter === "no-memory") {
			hooks = {
				reset: async () => {},
				encode: async () => {},
				consolidate: async () => {},
				recallUserFacts: async () => [] as string[],
			};
		} else if (args.adapter === "mem0") {
			mem0Inst = new Mem0Adapter(apiKey!);
			await mem0Inst.init(cacheId);
			const m = mem0Inst;
			hooks = {
				reset: async () => {},
				encode: async ({ content }: { content: string; timestampMs: number }) => {
					await m.addFact(content);
				},
				consolidate: async () => {
					// mem0 dedup/consolidate happens inside add() — no explicit step.
				},
				recallUserFacts: async (query: string, topK: number) => {
					return await m.search(query, topK);
				},
			};
		} else if (args.adapter === "naia-on-mem0") {
			system = await buildSystemOnMem0(apiKey!, cacheId, {
				disableImportanceGating: args.noImportance,
				disableKGSpreading: args.noKg,
			});
			const sys = system;
			hooks = {
				reset: async () => {},
				encode: async ({ content, timestampMs }: { content: string; timestampMs: number }) => {
					await sys.encode(
						{ content, role: "user", timestamp: timestampMs },
						{ project: "aihub141" },
					);
				},
				consolidate: async () => {
					await sys.consolidateNow(true);
				},
				recallUserFacts: async (query: string, topK: number) => {
					const r = await sys.recall(query, {
						project: "aihub141",
						topK,
						deepRecall: true,
						minConfidence: args.minConfidence,
					});
					return [...new Set(r.facts.map((f) => f.content))];
				},
			};
		} else {
			system = await buildSystem(apiKey!, cacheId, {
				disableImportanceGating: args.noImportance,
				disableKGSpreading: args.noKg,
			});
			const sys = system;
			hooks = {
				reset: async () => {},
				encode: async ({ content, timestampMs }: { content: string; timestampMs: number }) => {
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
						minConfidence: args.minConfidence,
					});
					return [...new Set(r.facts.map((f) => f.content))];
				},
			};
		}

		try {
			const result = await scoreConversation(
				conv,
				hooks,
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
		if (mem0Inst) await mem0Inst.cleanup();
	}

	if (system) await system.close();

	const elapsedMs = Date.now() - startMs;
	const agg = aggregateResults(allResults);
	const usage = getUsage();
	const pricing = getPricingFromEnv();
	const costUSD = estimateCostUSD(usage, pricing);

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
	console.log("\n=== Cost ===");
	console.log(
		`LLM:    ${usage.llmCalls} calls, ${usage.llmPromptTokens} in / ${usage.llmCompletionTokens} out tokens`,
	);
	console.log(
		`Embed:  ${usage.embedCalls} calls, ${usage.embedTokens} tokens`,
	);
	console.log(
		`Pricing: $${pricing.llmInputPerM}/M in, $${pricing.llmOutputPerM}/M out, $${pricing.embedPerM}/M embed`,
	);
	console.log(`Total estimated cost: $${costUSD.toFixed(4)}`);
	console.log(
		`Per-conv: $${(costUSD / Math.max(1, allResults.length)).toFixed(5)} / ${(elapsedMs / 1000 / Math.max(1, allResults.length)).toFixed(1)}s`,
	);

	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const reportDir = "reports";
	mkdirSync(reportDir, { recursive: true });
	const tagParts: string[] = [];
	if (args.noImportance) tagParts.push("no-importance");
	if (args.noKg) tagParts.push("no-kg");
	const tag = tagParts.length > 0 ? tagParts.join("+") : "default";
	const reportPath = join(
		reportDir,
		`aihub141-r2-3-${args.adapter}-${tag}-${ts}.json`,
	);
	writeFileSync(
		reportPath,
		JSON.stringify(
			{
				meta: {
					ts,
					adapter: args.adapter,
					split: args.split,
					level: args.level,
					limit: args.limit,
					topK: args.topK,
					disableImportanceGating: args.noImportance,
					disableKGSpreading: args.noKg,
					elapsedMs,
				},
				cost: {
					usage,
					pricing,
					estimatedUSD: costUSD,
					perConvUSD: costUSD / Math.max(1, allResults.length),
					perConvSec: elapsedMs / 1000 / Math.max(1, allResults.length),
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
