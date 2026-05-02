/**
 * Naia v3 — public surface.
 *
 * Layered, stateless architecture:
 *   1. Pre  : Episode → EnrichedEpisode (KO normalize, importance scoring)
 *   2. Engine: storage + retrieval (mem0 OSS+CPU or LocalAdapter)
 *   3. Temporal: KO time parsing + bi-temporal hint (NEW)
 *   4. Post  : reranker + contradiction detection
 *   5. Abstention: threshold + LLM judge
 *   6. Management: delete, update, forgetByQuery
 *
 * Capability vs Policy split (per K-MemBench v2 cross-review consensus):
 *   - Capability = Engine layer (mem0 OSS or LocalAdapter)
 *   - Policy = Pre + Post + Abstention + Management
 */

export * from "./types.js";
export { NaiaV3 } from "./orchestrator.js";
export { preprocessEpisode } from "./pre/preprocess.js";
export { tokenize, normalize, stripParticle } from "./pre/ko-normalizer.js";
export {
	scoreImportance,
	scoreEmotion,
	scoreSurprise,
	compositeScore,
} from "./pre/importance-scorer.js";
export { rerank, rerankWith } from "./post/reranker.js";
export { checkAbstention, checkAbstentionWith } from "./post/abstention.js";
export { detectContradiction } from "./post/contradiction.js";
export {
	parseRelativeKo,
	resolveReferenceDate,
} from "./temporal/ko-time-parser.js";
export {
	isForgetCommand,
	forgetByQuery,
} from "./management/api.js";
