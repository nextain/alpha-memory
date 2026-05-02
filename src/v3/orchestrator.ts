/**
 * Naia v3 orchestrator — composes all 5 layers.
 *
 * Stateless from the caller's view: each method takes input, returns output.
 * Engine handles persistence internally; everything else is pure.
 */

import type {
	AbstentionDecision,
	Candidate,
	ContradictionFlag,
	Episode,
	MemoryEngine,
	QueryContext,
	RankedMemory,
} from "./types.js";
import { preprocessEpisode } from "./pre/preprocess.js";
import { rerank } from "./post/reranker.js";
import { checkAbstention } from "./post/abstention.js";
import { detectContradiction } from "./post/contradiction.js";
import { resolveReferenceDate } from "./temporal/ko-time-parser.js";

export interface QueryResponse {
	memories: RankedMemory[];
	abstention: AbstentionDecision;
	temporalReference: Date | null;
}

export interface AddResponse {
	contradictions: ContradictionFlag | null;
	enrichedId?: string;
}

export class NaiaV3 {
	constructor(private engine: MemoryEngine) {}

	async add(episode: Episode, userId: string): Promise<AddResponse> {
		// Layer 1: pre-process
		const enriched = preprocessEpisode(episode, { userId });

		// Layer 4 (active): check contradiction with existing memories
		// quick search using engine's keyword retrieval
		const existing = await this.engine.search({
			query: episode.content,
			userId,
			topK: 20,
		});
		const conflict = detectContradiction(enriched, existing);

		// Layer 2: store
		await this.engine.add(enriched, userId);

		return {
			contradictions: conflict,
			enrichedId: enriched.id,
		};
	}

	async query(q: QueryContext): Promise<QueryResponse> {
		// Layer 3: temporal reference resolution
		const refDate = resolveReferenceDate(q.query) ?? null;
		const enrichedQuery = { ...q, referenceDate: refDate ?? undefined };

		// Layer 2: engine search (broad recall)
		const candidates = await this.engine.search({
			...enrichedQuery,
			topK: q.topK ? Math.max(q.topK * 4, 50) : 200,
		});

		// Layer 4: post-process rerank
		const ranked = rerank(enrichedQuery, candidates);
		const limited = ranked.slice(0, q.topK ?? 50);

		// Layer 5: abstention decision
		const abstention = checkAbstention(enrichedQuery, limited);

		return {
			memories: limited,
			abstention,
			temporalReference: refDate,
		};
	}

	async forget(factId: string, userId: string): Promise<void> {
		await this.engine.delete(factId, userId);
	}

	async update(
		factId: string,
		userId: string,
		newContent: string,
	): Promise<void> {
		await this.engine.update(factId, userId, newContent);
	}
}
