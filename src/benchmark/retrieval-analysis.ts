import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Fact {
	id: string;
	statement: string;
}

interface Query {
	query: string;
	verify?: string;
	fact?: string;
	facts?: string[];
	noisy_input?: string;
	setup?: string;
	update?: string;
}

interface RetrievalResult {
	id: string;
	query: string;
	capability: string;
	memories: string[];
}

function normalize(s: string) {
	return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * Retrieval Quality Analysis
 * Calculates MRR, Recall@K, and NDCG for a given benchmark checkpoint.
 */
async function analyze() {
	const lang = "ko";
	const factBankPath = join(process.cwd(), "src/benchmark/fact-bank.json");
	const templatesPath = join(
		process.cwd(),
		"src/benchmark/query-templates.json",
	);

	// Default to naia-local-ko checkpoint if not provided
	const checkpointPath =
		process.argv[2] ||
		join(process.cwd(), "reports/checkpoint-naia-local-ko.json");

	console.log(`Loading fact bank from: ${factBankPath}`);
	const factBank = JSON.parse(readFileSync(factBankPath, "utf-8"))
		.facts as Fact[];
	const factMap = new Map<string, string>();
	for (const f of factBank) {
		factMap.set(f.id, f.statement);
	}

	console.log(`Loading query templates from: ${templatesPath}`);
	const templates = JSON.parse(
		readFileSync(templatesPath, "utf-8"),
	).capabilities;

	console.log(`Loading checkpoint from: ${checkpointPath}`);
	const results = JSON.parse(
		readFileSync(checkpointPath, "utf-8"),
	) as RetrievalResult[];

	// Flatten templates in the exact order as run-comparison.ts
	const CAPABILITY_ORDER = [
		"direct_recall",
		"semantic_search",
		"proactive_recall",
		"abstention",
		"irrelevant_isolation",
		"multi_fact_synthesis",
		"entity_disambiguation",
		"contradiction_direct",
		"contradiction_indirect",
		"noise_resilience",
		"unchanged_persistence",
		"temporal",
	];

	const flattenedQueries: Array<{ cap: string; q: Query }> = [];
	for (const capName of CAPABILITY_ORDER) {
		const cap = templates[capName];
		if (cap && cap.queries) {
			for (const q of cap.queries) {
				flattenedQueries.push({ cap: capName, q });
			}
		}
	}

	// Join results with templates by index (since IDs are generated sequentially)
	// Or by query string if possible. Let's use query string first as it's safer if some were skipped.
	const queryToGold = new Map<string, string[]>();
	for (const entry of flattenedQueries) {
		const q = entry.q;
		const queryStr = q.query || q.verify || "";
		const golds: string[] = [];
		if (q.fact) {
			const s = factMap.get(q.fact);
			if (s) golds.push(s);
		}
		if (q.facts) {
			for (const fId of q.facts) {
				const s = factMap.get(fId);
				if (s) golds.push(s);
			}
		}
		if (q.noisy_input) golds.push(q.noisy_input);
		if (q.setup) golds.push(q.setup);
		if (q.update) golds.push(q.update);

		if (golds.length > 0) {
			queryToGold.set(queryStr, golds);
		}
	}

	// Metrics
	let totalRR = 0;
	let totalNDCG = 0;
	let totalQueries = 0;
	const hitAtK = { 1: 0, 5: 0, 10: 0, 20: 0, 50: 0, 100: 0 };
	const capabilityStats: Record<
		string,
		{ rr: number; count: number; hit1: number; hit10: number; ndcg: number }
	> = {};

	for (const res of results) {
		const golds = queryToGold.get(res.query);
		if (!golds || golds.length === 0) continue;

		const normalizedGolds = golds.map(normalize);
		let firstRank = -1;
		let dcg = 0;
		const hits: number[] = []; // indices of hits

		for (let i = 0; i < res.memories.length; i++) {
			const m = normalize(res.memories[i]);
			const rank = i + 1;
			// Match if memory contains gold or gold contains memory (for partial matches/truncation)
			const isHit = normalizedGolds.some(
				(gold) => m.includes(gold) || gold.includes(m),
			);
			if (isHit) {
				if (firstRank === -1) firstRank = rank;
				hits.push(i);
				dcg += 1 / Math.log2(rank + 1);
			}
		}

		// RR
		const rr = firstRank === -1 ? 0 : 1 / firstRank;
		totalRR += rr;

		// Hit@K
		for (const K of Object.keys(hitAtK).map(Number)) {
			if (firstRank !== -1 && firstRank <= K) hitAtK[K]++;
		}

		// NDCG
		let idcg = 0;
		// Ideal: all golds are at the top
		for (let i = 0; i < golds.length; i++) {
			idcg += 1 / Math.log2(i + 1 + 1);
		}
		const ndcg = idcg === 0 ? 0 : dcg / idcg;
		totalNDCG += ndcg;

		totalQueries++;

		// Capability stats
		if (!capabilityStats[res.capability]) {
			capabilityStats[res.capability] = {
				rr: 0,
				count: 0,
				hit1: 0,
				hit10: 0,
				ndcg: 0,
			};
		}
		const cs = capabilityStats[res.capability];
		cs.rr += rr;
		cs.count++;
		cs.ndcg += ndcg;
		if (firstRank === 1) cs.hit1++;
		if (firstRank !== -1 && firstRank <= 10) cs.hit10++;
	}

	// Output
	console.log("\n" + "═".repeat(50));
	console.log("  RETRIEVAL QUALITY ANALYSIS REPORT");
	console.log("═".repeat(50));
	console.log(`Target: ${checkpointPath}`);
	console.log(`Total valid queries: ${totalQueries}`);
	console.log(`MRR:       ${(totalRR / totalQueries).toFixed(4)}`);
	console.log(`NDCG:      ${(totalNDCG / totalQueries).toFixed(4)}`);
	console.log("-".repeat(50));
	for (const K of Object.keys(hitAtK)
		.map(Number)
		.sort((a, b) => a - b)) {
		console.log(
			`Recall@${String(K).padEnd(3)}: ${(hitAtK[K] / totalQueries).toFixed(4)} (${hitAtK[K]}/${totalQueries})`,
		);
	}

	console.log("\n" + "─".repeat(50));
	console.log("  BY CAPABILITY");
	console.log("─".repeat(50));
	console.log(
		`${"Capability".padEnd(22)} ${"MRR".padStart(8)} ${"Hit@1".padStart(8)} ${"Hit@10".padStart(8)} ${"NDCG".padStart(8)}`,
	);

	for (const capName of CAPABILITY_ORDER) {
		const s = capabilityStats[capName];
		if (!s) continue;
		console.log(
			`${capName.padEnd(22)} ${(s.rr / s.count).toFixed(3).padStart(8)} ${(s.hit1 / s.count).toFixed(3).padStart(8)} ${(s.hit10 / s.count).toFixed(3).padStart(8)} ${(s.ndcg / s.count).toFixed(3).padStart(8)}`,
		);
	}
	console.log("═".repeat(50) + "\n");
}

analyze().catch(console.error);
