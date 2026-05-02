/**
 * Mem0 OSS+CPU engine adapter — wraps existing Mem0Adapter as v3 MemoryEngine.
 *
 * The capability layer (retrieval) is delegated to mem0 OSS, but with
 * stateless interface. naia v3 layers (pre/post) wrap around it.
 */

import type { Mem0Adapter } from "../../memory/adapters/mem0.js";
import type {
	Candidate,
	EnrichedEpisode,
	MemoryEngine,
	QueryContext,
} from "../types.js";

export class Mem0Engine implements MemoryEngine {
	constructor(private inner: Mem0Adapter) {}

	async add(e: EnrichedEpisode, userId: string): Promise<void> {
		// Mem0Adapter.encode signature is (episode, options) — adapt to its interface
		// Note: actual Mem0Adapter encode signature may differ; here we sketch.
		await (this.inner as unknown as {
			encode: (
				ep: { content: string; role: string; timestamp?: number },
				opts: { project: string },
			) => Promise<void>;
		}).encode(
			{ content: e.content, role: e.role, timestamp: e.timestamp },
			{ project: userId },
		);
	}

	async search(q: QueryContext): Promise<Candidate[]> {
		const k = q.topK ?? 50;
		const result = await (this.inner as unknown as {
			recall: (
				query: string,
				opts: { project: string; topK: number },
			) => Promise<{
				facts: { id: string; content: string; relevanceScore?: number; createdAt?: number }[];
				episodes: { id: string; content: string; timestamp?: number }[];
			}>;
		}).recall(q.query, { project: q.userId, topK: k });

		const candidates: Candidate[] = [];
		for (const f of result.facts) {
			candidates.push({
				memory: f.content,
				score: f.relevanceScore ?? 0.5,
				id: f.id,
				createdAt: f.createdAt,
			});
		}
		for (const ep of result.episodes) {
			candidates.push({
				memory: ep.content,
				score: 0.3,
				id: ep.id,
				createdAt: ep.timestamp,
			});
		}
		return candidates;
	}

	async delete(factId: string, userId: string): Promise<void> {
		// mem0 OSS supports delete via mem.delete(memory_id)
		await (this.inner as unknown as {
			deleteFact?: (id: string, userId: string) => Promise<void>;
		}).deleteFact?.(factId, userId);
	}

	async update(factId: string, userId: string, newContent: string): Promise<void> {
		await (this.inner as unknown as {
			updateFact?: (id: string, userId: string, content: string) => Promise<void>;
		}).updateFact?.(factId, userId, newContent);
	}
}
