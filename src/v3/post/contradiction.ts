/**
 * Contradiction detection.
 *
 * Active mode: when a NEW episode is added, check against existing memories
 * for potential conflicts. Flag, don't delete.
 *
 * Heuristic: same entity/topic + opposite preference markers.
 */

import type {
	Candidate,
	ContradictionDetectFn,
	ContradictionFlag,
	EnrichedEpisode,
} from "../types.js";

const PREFERENCE_PAIRS: [RegExp, RegExp][] = [
	[/좋아한다|좋아해|선호한다|즐긴다/, /싫어한다|싫어해|기피한다|꺼린다/],
	[/사랑한다|사랑해/, /미워한다|미워해/],
	[/한다|이다/, /안 한다|아니다|않는다/],
	[/있다|있어/, /없다|없어/],
];

function tokenSet(text: string): Set<string> {
	const cleaned = text.toLowerCase().replace(/[^가-힣a-z0-9 ]/g, " ");
	return new Set(
		cleaned.split(/\s+/).filter((w) => w.length >= 2),
	);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	let inter = 0;
	for (const x of a) if (b.has(x)) inter++;
	const union = a.size + b.size - inter;
	return union === 0 ? 0 : inter / union;
}

export const detectContradiction: ContradictionDetectFn = (newEp, existing) => {
	const newTokens = tokenSet(newEp.content);
	const conflicting: string[] = [];
	for (const ex of existing) {
		const exTokens = tokenSet(String(ex.memory));
		const sim = jaccard(newTokens, exTokens);
		if (sim < 0.2) continue; // unrelated topic
		// Check if one expresses positive preference and other negative
		for (const [posPat, negPat] of PREFERENCE_PAIRS) {
			const newPos = posPat.test(newEp.content);
			const newNeg = negPat.test(newEp.content);
			const exPos = posPat.test(String(ex.memory));
			const exNeg = negPat.test(String(ex.memory));
			if ((newPos && exNeg) || (newNeg && exPos)) {
				conflicting.push(ex.id);
				break;
			}
		}
	}
	if (conflicting.length === 0) return null;
	return {
		conflictingFactIds: conflicting,
		conflictType: "direct" as const,
	};
};
