import { randomUUID } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import { calculateStrength, shouldPrune } from "../decay.js";
import type { EmbeddingProvider } from "../embeddings.js";
import type {
	ConsolidationResult,
	Episode,
	Fact,
	MemoryAdapter,
	RecallContext,
	Reflection,
	Skill,
} from "../types.js";

interface QdrantAdapterOptions {
	url: string;
	/** Qdrant cloud API key (optional for local Qdrant) */
	apiKey?: string;
	/** EmbeddingProvider for vector search. Required u2014 QdrantAdapter cannot operate without embeddings. */
	embeddingProvider: EmbeddingProvider;
	collectionPrefix?: string;
}

export class QdrantAdapter implements MemoryAdapter {
	private client: QdrantClient;
	private options: QdrantAdapterOptions;
	private episodeCollection: string;
	private factCollection: string;
	private skillCollection: string;
	private reflectionCollection: string;

	constructor(options: QdrantAdapterOptions) {
		this.options = options;
		this.client = new QdrantClient({
			url: options.url,
			apiKey: options.apiKey,
		});
		const prefix = options.collectionPrefix
			? `${options.collectionPrefix}-`
			: "";
		this.episodeCollection = `${prefix}episodes`;
		this.factCollection = `${prefix}facts`;
		this.skillCollection = `${prefix}skills`;
		this.reflectionCollection = `${prefix}reflections`;
	}

	async initialize(): Promise<void> {
		const dims = this.options.embeddingProvider.dims;
		await this.ensureCollectionWithVectors(this.factCollection, dims, "Cosine");
		await this.ensureCollectionWithVectors(
			this.episodeCollection,
			dims,
			"Cosine",
		);
		await this.ensureCollectionWithVectors(
			this.skillCollection,
			dims,
			"Cosine",
		);
		await this.ensureCollectionWithVectors(
			this.reflectionCollection,
			dims,
			"Cosine",
		);
	}

	private async ensureCollectionWithVectors(
		collectionName: string,
		vectorSize: number,
		distance: "Cosine" | "Euclid" | "Dot",
	): Promise<void> {
		const { collections } = await this.client.getCollections();
		const exists = collections.some((c) => c.name === collectionName);
		if (!exists) {
			await this.client.createCollection(collectionName, {
				vectors: {
					size: vectorSize,
					distance: distance,
				},
			});
		}
	}

	// ─── Episode Memory ────────────────────────────────────────────────
	episode = {
		store: async (event: Episode): Promise<void> => {
			const embedding = await this.options.embeddingProvider.embed(
				event.content,
			);
			await this.client.upsert(this.episodeCollection, {
				points: [
					{
						id: event.id,
						vector: embedding,
						payload: event,
					},
				],
				wait: true,
			});
		},
		recall: async (
			query: string,
			context: RecallContext,
		): Promise<Episode[]> => {
			const queryEmbedding = await this.options.embeddingProvider.embed(query);
			const searchResult = await this.client.search(this.episodeCollection, {
				vector: queryEmbedding,
				limit: context.topK ?? 10,
			});
			return searchResult.map((point) => point.payload as Episode);
		},
		getRecent: async (n: number): Promise<Episode[]> => {
			const searchResult = await this.client.scroll(this.episodeCollection, {
				limit: n,
				with_payload: true,
				order_by: {
					key: "timestamp",
					direction: "desc",
				},
			});
			return searchResult.points.map((point) => point.payload as Episode);
		},
		getUnconsolidated: async (): Promise<Episode[]> => {
			const searchResult = await this.client.scroll(this.episodeCollection, {
				limit: 1000,
				with_payload: true,
				filter: {
					must: [
						{
							key: "consolidated",
							match: { boolean: false },
						},
					],
				},
			});
			return searchResult.points.map((point) => point.payload as Episode);
		},
		markConsolidated: async (ids: string[]): Promise<void> => {
			// Use setPayload to patch only the consolidated flag — avoids overwriting
			// the real embedding vector and other payload fields.
			await this.client.setPayload(this.episodeCollection, {
				payload: { consolidated: true },
				points: ids,
				wait: true,
			});
		},
	};

	// ─── Semantic Memory ───────────────────────────────────────────────
	semantic = {
		upsert: async (fact: Fact): Promise<void> => {
			const embedding = await this.options.embeddingProvider.embed(
				fact.content,
			);
			await this.client.upsert(this.factCollection, {
				points: [
					{
						id: fact.id,
						vector: embedding,
						payload: fact,
					},
				],
				wait: true,
			});
		},
		search: async (
			query: string,
			topK: number,
			deepRecall = false,
		): Promise<Fact[]> => {
			const queryEmbedding = await this.options.embeddingProvider.embed(query);
			const searchResult = await this.client.search(this.factCollection, {
				vector: queryEmbedding,
				limit: topK,
			});
			return searchResult.map((point) => ({
				...(point.payload as Fact),
				relevanceScore: point.score,
			}));
		},
		decay: async (now: number): Promise<number> => {
			let prunedCount = 0;
			let offset: string | number | undefined = undefined;
			const limit = 1000;

			while (true) {
				const allFactsResponse = await this.client.scroll(this.factCollection, {
					limit: limit,
					with_payload: true,
					offset: offset,
				});

				const factsToPrune: string[] = [];
				const factsToUpdate: { id: string; payload: Fact }[] = [];

				for (const record of allFactsResponse.points) {
					const fact = record.payload as Fact;
					const strength = calculateStrength(
						fact.importance,
						fact.createdAt,
						fact.recallCount,
						fact.lastAccessed,
						now,
					);
					fact.strength = strength;

					if (shouldPrune(strength)) {
						factsToPrune.push(fact.id);
					} else {
						factsToUpdate.push({ id: fact.id, payload: fact });
					}
				}

				if (factsToPrune.length > 0) {
					await this.client.delete(this.factCollection, {
						points: factsToPrune,
						wait: true,
					});
					prunedCount += factsToPrune.length;
				}

				if (factsToUpdate.length > 0) {
					// Use setPayload to update strength/metadata without overwriting
					// the real embedding vector (upsert would corrupt it with zeros).
					await Promise.all(
						factsToUpdate.map((f) =>
							this.client.setPayload(this.factCollection, {
								payload: f.payload as Record<string, unknown>,
								points: [f.id],
								wait: false,
							}),
						),
					);
				}

				if (!allFactsResponse.next_page_offset) {
					break;
				}
				if (
					typeof allFactsResponse.next_page_offset === "string" ||
					typeof allFactsResponse.next_page_offset === "number"
				) {
					offset = allFactsResponse.next_page_offset;
				} else {
					offset = undefined;
				}
			}

			return prunedCount;
		},
		associate: async (
			entityA: string,
			entityB: string,
			weight?: number,
		): Promise<void> => {
			// Associations are managed by the in-memory KnowledgeGraph in MemorySystem.
			return Promise.resolve();
		},
		getAll: async (): Promise<Fact[]> => {
			const allFacts: Fact[] = [];
			let offset: string | number | undefined = undefined;
			const limit = 100;

			while (true) {
				const response = await this.client.scroll(this.factCollection, {
					limit: limit,
					offset: offset,
					with_payload: true,
				});
				for (const point of response.points) {
					allFacts.push(point.payload as Fact);
				}
				if (!response.next_page_offset) {
					break;
				}
				if (
					typeof response.next_page_offset === "string" ||
					typeof response.next_page_offset === "number"
				) {
					offset = response.next_page_offset;
				} else {
					offset = undefined;
				}
			}
			return allFacts;
		},
		delete: async (id: string): Promise<boolean> => {
			const response = await this.client.delete(this.factCollection, {
				points: [id],
				wait: true,
			});
			return response.status === "acknowledged";
		},
	};

	// ─── Procedural Memory ─────────────────────────────────────────────
	procedural = {
		getSkill: async (name: string): Promise<Skill | null> => {
			const searchResult = await this.client.scroll(this.skillCollection, {
				limit: 1,
				with_payload: true,
				filter: {
					must: [
						{
							key: "name",
							match: { value: name },
						},
					],
				},
			});
			return searchResult.points.length > 0
				? (searchResult.points[0].payload as Skill)
				: null;
		},
		recordOutcome: async (name: string, success: boolean): Promise<void> => {
			const existingSkill = await this.procedural.getSkill(name);
			let skill: Skill;
			if (existingSkill) {
				skill = { ...existingSkill };
				if (success) skill.successCount++;
				else skill.failureCount++;
				skill.confidence =
					skill.successCount / (skill.successCount + skill.failureCount);
			} else {
				skill = {
					id: randomUUID(),
					name,
					description: "",
					learnedAt: Date.now(),
					successCount: success ? 1 : 0,
					failureCount: success ? 0 : 1,
					confidence: success ? 1.0 : 0.0,
				};
			}
			const embedding = await this.options.embeddingProvider.embed(
				`${skill.name} ${skill.description}`,
			);
			await this.client.upsert(this.skillCollection, {
				points: [{ id: skill.id, vector: embedding, payload: skill }],
				wait: true,
			});
		},
		learnFromFailure: async (reflection: Reflection): Promise<void> => {
			const id = randomUUID();
			const embedding = await this.options.embeddingProvider.embed(
				`${reflection.task} ${reflection.failure} ${reflection.analysis} ${reflection.correction}`,
			);
			await this.client.upsert(this.reflectionCollection, {
				points: [{ id: id, vector: embedding, payload: reflection }],
				wait: true,
			});
		},
		getReflections: async (
			task: string,
			topK: number,
		): Promise<Reflection[]> => {
			const queryEmbedding = await this.options.embeddingProvider.embed(task);
			const searchResult = await this.client.search(this.reflectionCollection, {
				vector: queryEmbedding,
				limit: topK,
			});
			return searchResult.map((point) => point.payload as Reflection);
		},
	};

	async consolidate(): Promise<ConsolidationResult> {
		const now = Date.now();
		const memoriesPruned = await this.semantic.decay(now);
		return {
			episodesProcessed: 0,
			factsCreated: 0,
			factsUpdated: 0,
			memoriesPruned: memoriesPruned,
			associationsUpdated: 0,
		};
	}

	async close(): Promise<void> {
		// No explicit teardown needed for Qdrant REST client.
	}
}
