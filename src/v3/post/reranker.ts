/**
 * Multi-signal reranker (Layer 4).
 * Stateless: candidates → ranked memories.
 *
 * Signals:
 *   - engineScore: from underlying retrieval (mem0 / vector / BM25)
 *   - recency: time decay (Ebbinghaus-inspired but simplified)
 *   - importance: from pre-processing
 *   - temporalProximity: optional (set by temporal layer)
 */

import type {
	Candidate,
	RankedMemory,
	RerankerFn,
} from "../types.js";

interface RerankerOptions {
	now?: number; // unix ms
	weights?: {
		engineScore: number;
		recency: number;
		importance: number;
		temporal: number;
	};
}

const DEFAULT_WEIGHTS = {
	engineScore: 0.6,
	recency: 0.15,
	importance: 0.15,
	temporal: 0.1,
};

function recencyScore(createdAtMs: number | undefined, nowMs: number): number {
	if (!createdAtMs) return 0.5;
	const ageMs = Math.max(0, nowMs - createdAtMs);
	const ageDays = ageMs / (24 * 60 * 60 * 1000);
	// Ebbinghaus: e^(-t/T) with T = 7 days half-life
	return Math.exp(-ageDays / 7);
}

export const rerank: RerankerFn = (q, candidates) => {
	return rerankWith(q, candidates, {});
};

export function rerankWith(
	q: { query: string },
	candidates: Candidate[],
	opts: RerankerOptions,
): RankedMemory[] {
	const nowMs = opts.now ?? Date.now();
	const w = { ...DEFAULT_WEIGHTS, ...(opts.weights ?? {}) };
	const ranked = candidates.map((c) => {
		const importance = (c.metadata?.importance as number) ?? 0;
		const recency = recencyScore(c.createdAt, nowMs);
		const temporal = (c.metadata?.temporalProximity as number) ?? 0.5;
		const finalScore =
			w.engineScore * c.score +
			w.recency * recency +
			w.importance * importance +
			w.temporal * temporal;
		const status = ((c.metadata?.status as string) ?? "active") as
			| "active"
			| "superseded"
			| "archived";
		return {
			...c,
			finalScore,
			signals: {
				engineScore: c.score,
				recency,
				importance,
				temporalProximity: temporal,
			},
			status,
		} as RankedMemory;
	});

	// status filter: superseded/archived 은 finalScore × 0.3 으로 페널티
	for (const r of ranked) {
		if (r.status !== "active") {
			r.finalScore *= 0.3;
		}
	}

	ranked.sort((a, b) => b.finalScore - a.finalScore);
	return ranked;
}
