/**
 * Phase B-α — R2.5 contradiction filter framework types.
 *
 * Ledger entry = 1 conversation turn that naia memory should process. Each
 * entry has a `groundTruthFact` (what should be extracted) + optional
 * `contradiction` marker (when this turn supersedes a prior fact).
 *
 * Naturally-occurring contradictions are <1% in the AI Hub 141 dataset
 * (persona-prefab structure), so R2.5 verification requires an *intentional*
 * dataset with controlled supersede density (~30/80 = 37.5%).
 */

export interface LedgerEntry {
	/** Stable ID like "L001". Referenced by `contradiction.supersedes`. */
	id: string;
	/** 1-based turn order. Plays back in this order during measurement. */
	turn: number;
	/** ISO timestamp (KST). Ledger uses ~daily spacing for natural decay. */
	timestamp: string;
	/** Speaker. Default "user" — these are user-side facts only. */
	role: "user" | "assistant";
	/** The natural-language turn text. naia encodes this via memory.encode(). */
	utterance: string;
	/**
	 * The fact that *should* be extracted by naia's LLM fact extractor and
	 * survive recall at the end. Used as ground truth for axis A (recall).
	 */
	groundTruthFact: string;
	/**
	 * If set, this entry intentionally contradicts a prior entry (the one
	 * with id = `supersedes`). naia's R2.5 must mark the prior fact as
	 * superseded.
	 *
	 * `attributeKey` lets the scorer group same-attribute facts (e.g.
	 * "사용자 직업" pairs the old/new occupation facts).
	 */
	contradiction?: {
		type: "update" | "replace";
		supersedes: string; // entry id
		attributeKey: string; // e.g. "사용자 직업"
	};
	/**
	 * Optional category for slicing (직업 / 거주지 / 취향 / 가족 / 기타).
	 * Generator-assigned, used in scorer breakdown.
	 */
	category?: string;
}

export interface Ledger {
	meta: {
		schemaVersion: 1;
		createdAt: string;
		generator: "synthetic-llm" | "user-authored" | "hybrid";
		notes?: string;
	};
	entries: LedgerEntry[];
}

/**
 * 3-axis scoring result for an adapter on the ledger.
 *
 * - A. **Recall** — at the end of all turns, recall query for each
 *   final-state fact. Score = matched_count / total_active_facts.
 * - B. **Supersede precision** — among `contradiction`-tagged entries, did
 *   the prior fact get marked superseded? Score = correctly_superseded /
 *   total_contradiction_entries.
 * - C. **False positive** — among non-`contradiction` entries, how many
 *   incorrectly triggered a supersede? Score = incorrect_supersede / total
 *   non_contradiction_entries.
 *
 * Pass criteria (per devil's advocate cross-review):
 * - A ≥ 70% (recall@10)
 * - B ≥ 80%
 * - C ≤ 5%
 */
export interface PhaseBScoring {
	adapter: string;
	totalEntries: number;
	contradictionEntries: number;
	axisA: {
		activeFactsAtEnd: number; // total ground truth that should be recalled
		matched: number;
		recallAtK: number;
		topK: number;
	};
	axisB: {
		totalContradictions: number;
		correctlySuperseded: number;
		precision: number;
	};
	axisC: {
		nonContradictionEntries: number;
		incorrectSupersedes: number;
		falsePositiveRate: number;
	};
	pass: { axisA: boolean; axisB: boolean; axisC: boolean; overall: boolean };
}
