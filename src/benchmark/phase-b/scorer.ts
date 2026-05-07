/**
 * Phase B-α 3-axis scorer.
 *
 * Axes:
 *   A. Recall@K — at the end of all turns, can naia recall each *final-state*
 *      fact (i.e. base facts that were never superseded + the latest version
 *      of each updated attribute)?
 *   B. Supersede precision — for each entry tagged with `contradiction`, did
 *      naia mark the prior (`supersedes`) fact as superseded?
 *   C. False positive — for each entry NOT tagged with `contradiction`, did
 *      naia incorrectly mark some unrelated fact as superseded?
 *
 * Naia exposes superseded state via the store's fact records (each fact has
 * `supersededAt` / `supersededBy` fields after R2.5 processing). The scorer
 * inspects those fields after all turns are encoded + consolidated.
 */

import { keywordMatch, polarityAwareMatch } from "../aihub141/scorer.js";
import type { Ledger, LedgerEntry, PhaseBScoring } from "./types.js";

export interface AdapterHooks {
	/** Encode one turn into the memory system. */
	encode(input: { content: string; timestampMs: number }): Promise<void>;
	/** Force consolidation (so superseded marks land before scoring). */
	consolidate(): Promise<void>;
	/** Recall topK fact contents for the given query. */
	recallUserFacts(query: string, topK: number): Promise<string[]>;
	/**
	 * Inspect store: return fact records with supersede metadata.
	 * Used for axes B + C. Scorer calls AFTER all encodes + final consolidate.
	 *
	 * `status === "superseded"` is naia's canonical marker. Other adapters
	 * (mem0, no-memory) can return `status: "active"` for everything if they
	 * lack supersede tracking.
	 */
	listFacts(): Promise<
		Array<{
			content: string;
			status?: "active" | "superseded" | "archived";
			supersededBy?: string | null;
			supersededAt?: number | null;
			createdAt?: number;
		}>
	>;
	/** Reset store to clean slate. */
	reset(): Promise<void>;
}

export interface ScoringOptions {
	topK?: number; // axis A; default 10
	axisAThreshold?: number; // pass if recall >= 0.7
	axisBThreshold?: number; // pass if precision >= 0.8
	axisCThreshold?: number; // pass if FP rate <= 0.05
	verbose?: boolean;
}

/**
 * Compute the *final-state* facts: base facts NOT in any
 * `contradiction.supersedes` set + the latest update entry per attributeKey.
 */
export function computeFinalState(ledger: Ledger): LedgerEntry[] {
	const supersededIds = new Set<string>();
	for (const e of ledger.entries) {
		if (e.contradiction) supersededIds.add(e.contradiction.supersedes);
	}
	return ledger.entries.filter((e) => !supersededIds.has(e.id));
}

function parseIso(ts: string): number {
	const t = Date.parse(ts);
	return Number.isFinite(t) ? t : Date.now();
}

/**
 * Did the recalled set match the ground-truth fact?
 * Uses polarity-aware keyword (more strict than loose keyword to reduce
 * false positives in supersede measurement).
 */
function recallHit(gt: string, recalled: string[]): boolean {
	if (polarityAwareMatch(gt, recalled)) return true;
	return keywordMatch(gt, recalled); // fallback (looser)
}

/**
 * Score an adapter on the ledger. Plays back all turns, force-consolidates,
 * then runs queries + inspects store for supersede metadata.
 */
export async function scoreLedger(
	ledger: Ledger,
	hooks: AdapterHooks,
	opts: ScoringOptions = {},
): Promise<PhaseBScoring> {
	const topK = opts.topK ?? 10;
	const tA = opts.axisAThreshold ?? 0.7;
	const tB = opts.axisBThreshold ?? 0.8;
	const tC = opts.axisCThreshold ?? 0.05;

	await hooks.reset();

	// Encode all turns.
	for (const e of ledger.entries) {
		await hooks.encode({
			content: `User: ${e.utterance}`,
			timestampMs: parseIso(e.timestamp),
		});
	}
	await hooks.consolidate();

	const finalEntries = computeFinalState(ledger);
	const contradictionEntries = ledger.entries.filter((e) => e.contradiction);
	const nonContradictionEntries = ledger.entries.filter((e) => !e.contradiction);

	// Axis A — recall each final-state fact.
	let matched = 0;
	for (const fe of finalEntries) {
		const query = `사용자에 대해 알고 있는 사실 (${fe.category ?? ""}): ${fe.groundTruthFact.split(":")[0] ?? ""}`;
		const recalled = await hooks.recallUserFacts(query, topK);
		if (recallHit(fe.groundTruthFact, recalled)) matched++;
		if (opts.verbose) {
			console.log(
				`  [A] ${fe.id} "${fe.groundTruthFact}" — ${recallHit(fe.groundTruthFact, recalled) ? "HIT" : "MISS"}`,
			);
		}
	}
	const recallAtK = finalEntries.length > 0 ? matched / finalEntries.length : 0;

	// Axes B + C — inspect supersede metadata.
	const allFacts = await hooks.listFacts();

	// Axis B — for each contradiction-tagged entry, was the prior fact marked superseded?
	let correctlySuperseded = 0;
	for (const ce of contradictionEntries) {
		const supId = ce.contradiction!.supersedes;
		const supEntry = ledger.entries.find((e) => e.id === supId);
		if (!supEntry) continue;
		// A fact in the store is "the prior fact" if its content matches the
		// supersede target's groundTruthFact (loose keyword match).
		const priorFact = allFacts.find((f) =>
			recallHit(supEntry.groundTruthFact, [f.content]),
		);
		const isSuperseded = priorFact
			? priorFact.status === "superseded" ||
				!!priorFact.supersededBy ||
				!!priorFact.supersededAt
			: false;
		if (isSuperseded) correctlySuperseded++;
		if (opts.verbose) {
			console.log(
				`  [B] ${ce.id} → ${supId} "${supEntry.groundTruthFact}" — ${priorFact ? (isSuperseded ? "SUPERSEDED" : "STORE_NOT_MARKED") : "STORE_MISSING"}`,
			);
		}
	}
	const supersedePrecision =
		contradictionEntries.length > 0
			? correctlySuperseded / contradictionEntries.length
			: 0;

	// Axis C — incorrect supersede on non-contradiction entries.
	// Heuristic: count facts in the store that are marked superseded BUT do
	// NOT correspond to any contradiction-tagged entry's supersede target.
	const legitimatelySupersededIds = new Set(
		contradictionEntries.map((ce) => ce.contradiction!.supersedes),
	);
	const legitimatelySupersededFacts = new Set(
		ledger.entries
			.filter((e) => legitimatelySupersededIds.has(e.id))
			.map((e) => e.groundTruthFact),
	);
	let incorrectSupersedes = 0;
	for (const f of allFacts) {
		const isSuperseded =
			f.status === "superseded" || !!f.supersededBy || !!f.supersededAt;
		if (!isSuperseded) continue;
		// Is this fact one we *expected* to be superseded?
		const matchesExpected = [...legitimatelySupersededFacts].some((expected) =>
			recallHit(expected, [f.content]),
		);
		if (!matchesExpected) incorrectSupersedes++;
	}
	const fpRate =
		nonContradictionEntries.length > 0
			? incorrectSupersedes / nonContradictionEntries.length
			: 0;

	const passA = recallAtK >= tA;
	const passB = supersedePrecision >= tB;
	const passC = fpRate <= tC;

	return {
		adapter: "scored",
		totalEntries: ledger.entries.length,
		contradictionEntries: contradictionEntries.length,
		axisA: {
			activeFactsAtEnd: finalEntries.length,
			matched,
			recallAtK,
			topK,
		},
		axisB: {
			totalContradictions: contradictionEntries.length,
			correctlySuperseded,
			precision: supersedePrecision,
		},
		axisC: {
			nonContradictionEntries: nonContradictionEntries.length,
			incorrectSupersedes,
			falsePositiveRate: fpRate,
		},
		pass: { axisA: passA, axisB: passB, axisC: passC, overall: passA && passB && passC },
	};
}
