/**
 * Abstention judge (Layer 5).
 *
 * Decides whether the system should abstain from answering.
 * Abstention = "no relevant memory found" → don't hallucinate.
 *
 * Heuristic + threshold-based; LLM fallback for borderline cases.
 */

import type {
	AbstentionCheckFn,
	AbstentionDecision,
	RankedMemory,
} from "../types.js";

export interface AbstentionOptions {
	scoreThreshold?: number; // top finalScore < this → abstain
	minTopK?: number; // require at least this many memories above threshold
}

const DEFAULTS: Required<AbstentionOptions> = {
	scoreThreshold: 0.4,
	minTopK: 1,
};

export const checkAbstention: AbstentionCheckFn = (q, ranked) => {
	return checkAbstentionWith(q.query, ranked, {});
};

export function checkAbstentionWith(
	query: string,
	ranked: RankedMemory[],
	opts: AbstentionOptions,
): AbstentionDecision {
	const o = { ...DEFAULTS, ...opts };
	if (ranked.length === 0) {
		return {
			abstain: true,
			confidence: 1.0,
			reason: "empty_retrieval",
		};
	}
	const topScore = ranked[0]!.finalScore;
	const aboveCount = ranked.filter((r) => r.finalScore >= o.scoreThreshold).length;
	if (aboveCount < o.minTopK) {
		return {
			abstain: true,
			confidence: 1.0 - topScore,
			reason: `top_score_${topScore.toFixed(2)}_below_threshold`,
		};
	}
	return {
		abstain: false,
		confidence: topScore,
		reason: `top_score_${topScore.toFixed(2)}_ok`,
	};
}
