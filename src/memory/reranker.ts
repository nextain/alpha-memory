/**
 * #27 Step 3 — Cross-encoder re-ranker interface.
 *
 * Phase B-γ + #27 sweep 측정 결과: naia 의 base retrieval (cosine + BM25 +
 * RRF + KG + MMR + threshold) 모두 noise band ±2pp. *real ranking 강화* =
 * cross-encoder.
 *
 * Pattern: caller (naia-agent) 가 인스턴스 주입. naia-memory LLM/모델 호출 X
 * (책임 분리, anchor §A08). LocalAdapter 가 search 결과 받은 후 reranker
 * 적용 (option).
 *
 * 권장 모델:
 * - BGE-reranker-v2-m3 (multilingual, 한국어 OK, ~570MB)
 * - Cohere reranker (cloud, 영어 우선)
 * - cross-encoder/ms-marco-MiniLM-L-6-v2 (영어 small)
 *
 * Future implementations:
 * - `OfflineRerankerProvider` (transformers.js, BGE-reranker-v2-m3)
 * - `OpenAICompatRerankerProvider` (Voyage / Jina cross-encoder API)
 * - `VllmRerankerProvider` (사용자 GPU 의 BGE-reranker)
 */

export interface RerankerProvider {
	/** Provider name for logging/debugging */
	readonly name: string;
	/**
	 * Re-score candidate results against the query.
	 * Returns same items in (potentially) new order with updated scores.
	 *
	 * @param query - the user query
	 * @param candidates - retrieval results (cosine + BM25 fused). Each
	 *   candidate has `content` (string) + optional `metadata`.
	 * @param topK - max items to return (after re-rank)
	 */
	rerank<T extends { content: string }>(
		query: string,
		candidates: T[],
		topK: number,
	): Promise<Array<T & { rerankScore: number }>>;
}

/**
 * No-op reranker — returns input unchanged. Default when no reranker configured.
 * Useful for testing + backward compat.
 */
export class IdentityReranker implements RerankerProvider {
	readonly name = "identity";

	async rerank<T extends { content: string }>(
		_query: string,
		candidates: T[],
		topK: number,
	): Promise<Array<T & { rerankScore: number }>> {
		return candidates.slice(0, topK).map((c, i) => ({
			...c,
			rerankScore: 1 - i / Math.max(1, candidates.length),
		}));
	}
}
