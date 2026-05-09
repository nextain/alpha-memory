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

/**
 * OfflineRerankerProvider — transformers.js 의 cross-encoder 사용.
 *
 * 권장 모델: BGE-reranker-v2-m3 (multilingual, 한국어 OK, ~570MB).
 * 첫 사용 시 ~/.cache/huggingface/hub/ 에 download. 이후 cached.
 *
 * GPU 권장 (FP16 ~600MB), CPU 도 작동 (느림 ~200ms/pair).
 *
 * 사용 예:
 *   const reranker = new OfflineRerankerProvider("bge-reranker-v2-m3");
 *   const memory = new MemorySystem({ reranker, ... });
 */
export class OfflineRerankerProvider implements RerankerProvider {
	readonly name = "offline-reranker";
	private pipeline: any = null;
	private readonly modelName: string;
	private initPromise: Promise<void> | null = null;

	constructor(
		model:
			| "bge-reranker-v2-m3"
			| "bge-reranker-base"
			| "ms-marco-MiniLM-L-6-v2" = "bge-reranker-v2-m3",
	) {
		this.modelName = model;
	}

	private init(): Promise<void> {
		if (!this.initPromise) {
			this.initPromise = (async () => {
				let pipelineFn: typeof import("@huggingface/transformers")["pipeline"];
				try {
					({ pipeline: pipelineFn } = await import(
						"@huggingface/transformers"
					));
				} catch {
					throw new Error(
						"@huggingface/transformers is required. Run: pnpm add @huggingface/transformers",
					);
				}
				// HF Xenova mirror — transformers.js compatible.
				const hfModel = `Xenova/${this.modelName}`;
				this.pipeline = await pipelineFn("text-classification", hfModel);
			})();
		}
		return this.initPromise;
	}

	async rerank<T extends { content: string }>(
		query: string,
		candidates: T[],
		topK: number,
	): Promise<Array<T & { rerankScore: number }>> {
		if (candidates.length === 0) return [];
		await this.init();

		// Cross-encoder receives [query, passage] pairs. transformers.js
		// pipeline expects {text, text_pair} format for sentence-pair tasks.
		const scored: Array<T & { rerankScore: number }> = [];
		for (const c of candidates) {
			try {
				const result = await this.pipeline({
					text: query,
					text_pair: c.content,
				});
				// result = [{label: "LABEL_0", score: 0.85}] or scalar
				const score = Array.isArray(result)
					? (result[0]?.score ?? 0)
					: ((result as any)?.score ?? 0);
				scored.push({ ...c, rerankScore: score });
			} catch (e: any) {
				console.warn(
					`[OfflineRerankerProvider] rerank failed for "${c.content.slice(0, 50)}": ${e.message}`,
				);
				scored.push({ ...c, rerankScore: 0 });
			}
		}

		return scored.sort((a, b) => b.rerankScore - a.rerankScore).slice(0, topK);
	}
}
