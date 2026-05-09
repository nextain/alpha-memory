/**
 * Phase B-α — R2.5 contradiction filter framework runner.
 *
 * Plays back a synthetic Korean ledger (50 base facts + 30 update statements)
 * through naia-local and reports the 3-axis score (Recall / Supersede
 * precision / False positive). Optional `--adapter=no-memory` for the
 * absolute floor sanity check.
 *
 * Usage:
 *   GEMINI_API_KEY=xxx GATEWAY_URL=... GATEWAY_MASTER_KEY=... \
 *     pnpm exec tsx src/benchmark/phase-b/run.ts [--adapter=naia-local|no-memory] [--ledger=path] [--topK=10] [--verbose]
 *
 * If --ledger is omitted, generates a fresh synthetic ledger (seed=42).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LocalAdapter } from "../../memory/adapters/local.js";
import {
	OpenAICompatEmbeddingProvider,
	type EmbeddingProvider,
} from "../../memory/embeddings.js";
import {
	GeminiFlashLiteContradictionFilter,
	HeuristicContradictionFilter,
	VllmReasoningContradictionFilter,
} from "../../memory/contradiction-filter.js";
import { MemorySystem } from "../../memory/index.js";
import { buildLLMFactExtractor } from "../../memory/llm-fact-extractor.js";
import {
	estimateCostUSD,
	getPricingFromEnv,
	getUsage,
	resetUsage,
} from "../../memory/usage-tracker.js";
import { generateLedger } from "./ledger-generator.js";
import { scoreLedger } from "./scorer.js";
import type { AdapterHooks } from "./scorer.js";
import type { Ledger, LedgerEntry } from "./types.js";

type AdapterKind = "naia-local" | "no-memory";

interface CLIArgs {
	adapter: AdapterKind;
	ledger?: string;
	topK: number;
	verbose: boolean;
	filter: "heuristic" | "gemini" | "vllm" | "off";
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	let adapter: AdapterKind = "naia-local";
	let ledger: string | undefined;
	let topK = 10;
	let verbose = false;
	let filter: CLIArgs["filter"] = "heuristic";
	for (const a of args) {
		if (a.startsWith("--adapter=")) adapter = a.split("=")[1] as AdapterKind;
		if (a.startsWith("--ledger=")) ledger = a.split("=")[1];
		if (a.startsWith("--topK=")) topK = Number.parseInt(a.split("=")[1], 10);
		if (a === "--verbose") verbose = true;
		if (a.startsWith("--filter=")) filter = a.split("=")[1] as CLIArgs["filter"];
	}
	return { adapter, ledger, topK, verbose, filter };
}

function loadLedger(path: string): Ledger {
	const lines = readFileSync(path, "utf-8")
		.split("\n")
		.filter((l) => l.trim());
	let meta: any = null;
	const entries: LedgerEntry[] = [];
	for (const line of lines) {
		const obj = JSON.parse(line);
		if (obj.meta) meta = obj.meta;
		else if (obj.id && obj.turn) entries.push(obj);
	}
	if (!meta) {
		meta = {
			schemaVersion: 1,
			createdAt: new Date().toISOString(),
			generator: "user-authored",
		};
	}
	return { meta, entries };
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

function buildHooks(
	args: CLIArgs,
	apiKey: string | undefined,
): { hooks: AdapterHooks; cleanup: () => Promise<void> } {
	if (args.adapter === "no-memory") {
		return {
			hooks: {
				reset: async () => {},
				encode: async () => {},
				consolidate: async () => {},
				recallUserFacts: async () => [],
				listFacts: async () => [],
			},
			cleanup: async () => {},
		};
	}

	if (!apiKey) throw new Error("GEMINI_API_KEY required for naia-local");

	const storePath = `/tmp/phase-b-naia-${Date.now()}.json`;
	const embedder = buildEmbedder(apiKey);
	const adapter = new LocalAdapter({
		storePath,
		embeddingProvider: embedder,
	});
	const factExtractor = buildLLMFactExtractor({ apiKey });
	const contradictionFilter = (() => {
		switch (args.filter) {
			case "off":
				return undefined;
			case "heuristic":
				return new HeuristicContradictionFilter();
			case "gemini":
				return new GeminiFlashLiteContradictionFilter({ apiKey: apiKey! });
			case "vllm":
				return new VllmReasoningContradictionFilter();
		}
	})();

	const sys = new MemorySystem({ adapter, factExtractor, contradictionFilter });

	return {
		hooks: {
			reset: async () => {},
			encode: async ({ content, timestampMs }) => {
				await sys.encode(
					{ content, role: "user", timestamp: timestampMs },
					{ project: "phase-b" },
				);
			},
			consolidate: async () => {
				await sys.consolidateNow(true);
			},
			recallUserFacts: async (query, topK) => {
				const r = await sys.recall(query, {
					project: "phase-b",
					topK,
					deepRecall: true,
				});
				return [...new Set(r.facts.map((f) => f.content))];
			},
			listFacts: async () => {
				const store = (adapter as LocalAdapter).getStore();
				return store.facts.map((f) => ({
					content: f.content,
					status: f.status,
					createdAt: f.createdAt,
				}));
			},
		},
		cleanup: async () => {
			await sys.close();
		},
	};
}

async function main() {
	const args = parseArgs();
	const apiKey = process.env.GEMINI_API_KEY;

	const ledger = args.ledger ? loadLedger(args.ledger) : generateLedger();
	console.log(
		`[phase-b] adapter=${args.adapter} filter=${args.filter} topK=${args.topK} entries=${ledger.entries.length} contradictions=${ledger.entries.filter((e) => e.contradiction).length}`,
	);

	resetUsage();
	const startMs = Date.now();
	const { hooks, cleanup } = buildHooks(args, apiKey);

	let result;
	try {
		result = await scoreLedger(ledger, hooks, {
			topK: args.topK,
			verbose: args.verbose,
		});
	} finally {
		await cleanup();
	}

	const elapsedMs = Date.now() - startMs;
	const usage = getUsage();
	const pricing = getPricingFromEnv();
	const costUSD = estimateCostUSD(usage, pricing);

	console.log("\n=== Phase B-α R2.5 Scoring ===");
	console.log(
		`Total entries: ${result.totalEntries} (${result.contradictionEntries} contradictions, ${result.totalEntries - result.contradictionEntries} base)`,
	);
	console.log("");
	console.log(
		`Axis A — Recall@${result.axisA.topK}: ${(result.axisA.recallAtK * 100).toFixed(1)}% (${result.axisA.matched} / ${result.axisA.activeFactsAtEnd})  ${result.pass.axisA ? "PASS" : "FAIL"}  threshold ≥70%`,
	);
	console.log(
		`Axis B — Supersede precision: ${(result.axisB.precision * 100).toFixed(1)}% (${result.axisB.correctlySuperseded} / ${result.axisB.totalContradictions})  ${result.pass.axisB ? "PASS" : "FAIL"}  threshold ≥80%`,
	);
	console.log(
		`Axis C — False positive rate: ${(result.axisC.falsePositiveRate * 100).toFixed(1)}% (${result.axisC.incorrectSupersedes} / ${result.axisC.nonContradictionEntries})  ${result.pass.axisC ? "PASS" : "FAIL"}  threshold ≤5%`,
	);
	console.log("");
	console.log(`Overall: ${result.pass.overall ? "✅ PASS" : "❌ FAIL"}`);
	console.log("");
	console.log(`Elapsed: ${(elapsedMs / 1000).toFixed(1)}s`);
	console.log(
		`Cost: $${costUSD.toFixed(4)} (${usage.llmCalls} LLM calls, ${usage.embedCalls} embedding calls)`,
	);
	// R4 #26 활성도 보고 (spike emit + replay boost count).
	const spikeTotal = usage.spikeEmits
		? Object.values(usage.spikeEmits).reduce((a, b) => a + b, 0)
		: 0;
	console.log(
		`R4 spikes: ${spikeTotal}${
			usage.spikeEmits && Object.keys(usage.spikeEmits).length > 0
				? ` (${Object.entries(usage.spikeEmits)
						.map(([r, c]) => `${r}=${c}`)
						.join(", ")})`
				: ""
		} | replay boost: ${usage.replayBoosted ?? 0}`,
	);

	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const reportDir = "reports";
	mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `phase-b-${args.adapter}-${ts}.json`);
	writeFileSync(
		reportPath,
		JSON.stringify(
			{
				meta: {
					ts,
					adapter: args.adapter,
					filter: args.filter,
					topK: args.topK,
					elapsedMs,
					ledger: { ...ledger.meta, entryCount: ledger.entries.length },
				},
				cost: { usage, pricing, estimatedUSD: costUSD },
				score: result,
			},
			null,
			2,
		),
		"utf-8",
	);
	console.log(`\nReport: ${reportPath}`);
}

main().catch((e) => {
	console.error("[phase-b] fatal:", e);
	process.exit(1);
});
