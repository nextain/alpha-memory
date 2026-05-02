/**
 * Pre-processing pipeline (Layer 1).
 * Stateless: Episode → EnrichedEpisode.
 */

import type { Episode, EnrichedEpisode, PreProcessFn } from "../types.js";
import { tokenize } from "./ko-normalizer.js";
import {
	compositeScore,
	scoreEmotion,
	scoreImportance,
	scoreSurprise,
} from "./importance-scorer.js";

export const preprocessEpisode: PreProcessFn = (e, ctx) => {
	const tokens = tokenize(e.content);
	const importance = scoreImportance(e.content);
	const emotion = scoreEmotion(e.content);
	const surprise = scoreSurprise(e.content);
	return {
		...e,
		importance,
		emotion,
		surprise,
		tokens,
		encodingContext: {
			project: ctx.userId,
			userId: ctx.userId,
			composite: compositeScore(importance, emotion, surprise),
		},
	};
};
