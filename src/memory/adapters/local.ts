/**
 * LocalAdapter — JSON file-backed MemoryAdapter implementation.
 *
 * Always functional, no external dependencies.
 * Uses atomic write (write-to-temp + rename) for crash safety.
 * Suitable for desktop companion use — the data volume is manageable in JSON.
 *
 * Future: can be swapped to SQLite (better-sqlite3) if query performance
 * becomes a bottleneck. For now, simplicity wins (ChatGPT Memory approach).
 */

import {
	createCipheriv,
	createDecipheriv,
	pbkdf2,
	randomBytes,
	randomUUID,
} from "node:crypto";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { calculateStrength, shouldPrune } from "../decay.js";
import type { EmbeddingProvider } from "../embeddings.js";
import { tokenize as koTokenize } from "../ko-normalize.js";
import {
	type KGState,
	KnowledgeGraph,
	emptyKGState,
} from "../knowledge-graph.js";
import type {
	BackupCapable,
	ConsolidationResult,
	Episode,
	Fact,
	MemoryAdapter,
	RecallContext,
	Reflection,
	Skill,
} from "../types.js";

const pbkdf2Async = promisify(pbkdf2);

/** On-disk schema for JSON persistence */
interface MemoryStore {
	version: 1;
	episodes: Episode[];
	facts: Fact[];
	skills: Skill[];
	reflections: Reflection[];
	/** Hebbian association weights: "entityA::entityB" → weight */
	associations: Record<string, number>;
	/** Knowledge graph state (Phase 2) */
	knowledgeGraph?: KGState;
	/** Vector embeddings: id → float[] (optional, populated when EmbeddingProvider is set) */
	factEmbeddings?: Record<string, number[]>;
	episodeEmbeddings?: Record<string, number[]>;
}

function emptyStore(): MemoryStore {
	return {
		version: 1,
		episodes: [],
		facts: [],
		skills: [],
		reflections: [],
		associations: {},
		factEmbeddings: {},
		episodeEmbeddings: {},
	};
}

/** Cosine similarity between two equal-length vectors.
 * Returns 0 for degenerate inputs (zero vectors, NaN, mismatched dims).
 */
function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB);
	if (!isFinite(denom) || denom === 0) return 0;
	const sim = dot / denom;
	return isNaN(sim) ? 0 : sim;
}

/** LocalAdapter constructor options */
export interface LocalAdapterOptions {
	/** Path to the JSON store file (default: ~/.naia/memory/naia-memory.json) */
	storePath?: string;
	/** Optional embedding provider for vector search.
	 *  When set, facts and episodes are embedded on write and retrieved by cosine similarity.
	 *  When absent, falls back to keyword search. */
	embeddingProvider?: EmbeddingProvider;
	/** Cosine similarity threshold for filtering noise (default: 0.7).
	 *  Higher values reduce hallucinations but may skip relevant context. */
	similarityThreshold?: number;
}

/** Normalize association key (alphabetical order for consistency) */
function assocKey(a: string, b: string): string {
	const sorted = [a.toLowerCase(), b.toLowerCase()].sort();
	return `${sorted[0]}::${sorted[1]}`;
}

/** KO-aware tokenizer — uses ko-normalize for Korean text, simple split for non-Korean */
function tokenize(text: string): string[] {
	const hasKorean = /[가-힣]/.test(text);
	if (hasKorean) return koTokenize(text);
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.filter((t) => t.length > 1);
}

class BM25 {
	private k1 = 1.2;
	private b = 0.75;
	private docTokens: Map<string, string[]> = new Map();
	private avgDl = 0;
	private N = 0;
	private df: Map<string, number> = new Map();

	index(docs: Map<string, string>): void {
		this.docTokens.clear();
		this.df.clear();
		this.N = docs.size;
		let totalLen = 0;

		for (const [id, text] of docs) {
			const tokens = tokenize(text);
			this.docTokens.set(id, tokens);
			totalLen += tokens.length;
			const seen = new Set<string>();
			for (const t of tokens) {
				if (!seen.has(t)) {
					seen.add(t);
					this.df.set(t, (this.df.get(t) ?? 0) + 1);
				}
			}
		}
		this.avgDl = this.N > 0 ? totalLen / this.N : 1;
	}

	score(query: string, docId: string): number {
		const queryTokens = tokenize(query);
		const docTokens = this.docTokens.get(docId);
		if (!docTokens || queryTokens.length === 0) return 0;

		const dl = docTokens.length;
		const tfMap = new Map<string, number>();
		for (const t of docTokens) {
			tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
		}

		let total = 0;
		const docLower = docTokens.join(" ");

		for (const qt of queryTokens) {
			let tf = tfMap.get(qt) ?? 0;
			if (tf === 0) {
				const idx = docLower.indexOf(qt);
				if (idx !== -1) tf = 0.8;
			}
			if (tf === 0) continue;

			const dfVal = this.df.get(qt) ?? 0;
			const idf = Math.log(1 + (this.N - dfVal + 0.5) / (dfVal + 0.5));
			const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * dl / this.avgDl));
			total += idf * tfNorm;
		}
		return total;
	}
}

/**
 * Score relevance of a document to a query.
 * Uses substring matching as fallback for Korean particles (e.g., "TypeScript로")
 * and partial matches that exact tokenization misses.
 */
function keywordScore(query: string, document: string): number {
	const queryTokens = tokenize(query);
	const docLower = document.toLowerCase();
	const docTokens = new Set(tokenize(document));
	if (queryTokens.length === 0) return 0;

	let hits = 0;
	for (const qt of queryTokens) {
		if (docTokens.has(qt)) {
			hits++;
		} else if (docLower.includes(qt)) {
			// Substring match — handles Korean particles (TypeScript로, Cursor로)
			hits += 0.8;
		}
	}
	return hits / queryTokens.length;
}

export class LocalAdapter implements MemoryAdapter, BackupCapable {
	private store: MemoryStore;
	private readonly storePath: string;
	private dirty = false;
	private saveTimer: NodeJS.Timeout | null = null;
	private readonly SAVE_DEBOUNCE_MS = 2000;
	private kg: KnowledgeGraph;
	/** Optional vector embedding provider (null = keyword-only mode) */
	private readonly embedder: EmbeddingProvider | null;
	/**
	 * In-memory embedding cache — avoids duplicate API calls for the same text.
	 * Key: text content. Value: embedding vector.
	 * Cache is intentionally unbounded (benchmark: ~1000 unique texts).
	 */
	private readonly embedCache = new Map<string, number[]>();

	constructor(options?: string | LocalAdapterOptions) {
		const storePath =
			typeof options === "string" ? options : options?.storePath;
		this.embedder =
			typeof options === "object" ? (options.embeddingProvider ?? null) : null;
		this.storePath =
			storePath ?? join(homedir(), ".naia", "memory", "naia-memory.json");
		this.store = this.load();
		// Initialize knowledge graph from persisted state
		if (!this.store.knowledgeGraph) {
			this.store.knowledgeGraph = emptyKGState();
		}
		// Initialize embedding maps if missing (backward-compat with old store files)
		if (!this.store.factEmbeddings) this.store.factEmbeddings = {};
		if (!this.store.episodeEmbeddings) this.store.episodeEmbeddings = {};
		this.kg = new KnowledgeGraph(this.store.knowledgeGraph);
	}

	// ─── Persistence ──────────────────────────────────────────────────────

	private load(): MemoryStore {
		try {
			if (existsSync(this.storePath)) {
				const raw = readFileSync(this.storePath, "utf-8");
				const parsed = JSON.parse(raw) as MemoryStore;
				if (parsed.version === 1) {
					for (const f of parsed.facts) {
						if (!f.status) f.status = "active";
					}
					return parsed;
				}
			}
		} catch {
			// Corrupted file — start fresh
		}
		return emptyStore();
	}

	private save(): void {
		if (!this.dirty) return;
		// Throttle pattern — first dirty mark schedules a flush in SAVE_DEBOUNCE_MS.
		// Subsequent calls within that window do NOT reset the timer, so we get a
		// guaranteed flush at most every SAVE_DEBOUNCE_MS even under sustained writes.
		if (this.saveTimer) return;
		this.saveTimer = setTimeout(() => {
			this.saveImmediate();
		}, this.SAVE_DEBOUNCE_MS);
	}

	saveImmediate(): void {
		if (this.saveTimer) {
			clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		if (!this.dirty) return;
		const dir = dirname(this.storePath);
		mkdirSync(dir, { recursive: true });
		const tmpPath = `${this.storePath}.tmp`;
		writeFileSync(tmpPath, JSON.stringify(this.store, null, "\t"), "utf-8");
		renameSync(tmpPath, this.storePath);
		this.dirty = false;
	}

	/** Embed text with in-memory cache to avoid redundant API calls. */
	private async embedWithCache(text: string): Promise<number[] | null> {
		if (!this.embedder) return null;
		const cached = this.embedCache.get(text);
		if (cached) return cached;
		try {
			const vec = await this.embedder.embed(text);
			this.embedCache.set(text, vec);
			return vec;
		} catch {
			return null; // Non-fatal — keyword fallback still works
		}
	}

	private markDirty(): void {
		this.dirty = true;
	}

	// ─── Episodic Memory ──────────────────────────────────────────────────

	episode = {
		store: async (event: Episode): Promise<void> => {
			this.store.episodes.push(event);
			// Embed content if provider is available (cached to avoid redundant API calls)
			const epVec = await this.embedWithCache(event.content);
			if (epVec) this.store.episodeEmbeddings![event.id] = epVec;
			this.markDirty();
			this.save();
		},

		recall: async (
			query: string,
			context: RecallContext,
		): Promise<Episode[]> => {
			const now = Date.now();
			const topK = context.topK ?? 5;
			const minStrength = context.minStrength ?? 0.05;
			const deepRecall = context.deepRecall ?? false;

			// Vector search path: embed query and use cosine similarity
			// Vector search path: embed query and use cosine similarity
			const queryVec = await this.embedWithCache(query);

			const scored = this.store.episodes
				.map((ep) => {
					// Recalculate strength with current time
					const strength = calculateStrength(
						ep.importance.utility,
						ep.timestamp,
						ep.recallCount,
						ep.lastAccessed,
						now,
					);

					// deepRecall: skip strength filter to retrieve old memories
					if (!deepRecall && strength < minStrength) return null;

					// Relevance: vector similarity when available, else keyword
					const epVec = queryVec ? this.store.episodeEmbeddings?.[ep.id] : null;
					const textScore =
						epVec && queryVec
							? cosineSimilarity(queryVec, epVec)
							: keywordScore(query, `${ep.content} ${ep.summary}`);

					// Context bonus (encoding specificity)
					let contextBonus = 0;
					if (
						context.project &&
						ep.encodingContext.project === context.project
					) {
						contextBonus += 0.2;
					}
					if (
						context.activeFile &&
						ep.encodingContext.activeFile === context.activeFile
					) {
						contextBonus += 0.1;
					}

					// deepRecall: ignore decay in scoring
					const finalScore = deepRecall
						? textScore + contextBonus
						: textScore * strength + contextBonus;
					return { episode: ep, score: finalScore, strength };
				})
				.filter((x): x is NonNullable<typeof x> => x !== null && x.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, topK);

			// Update recall counts (reconsolidation: retrieval strengthens memory)
			for (const { episode } of scored) {
				episode.recallCount++;
				episode.lastAccessed = now;
				episode.strength = calculateStrength(
					episode.importance.utility,
					episode.timestamp,
					episode.recallCount,
					episode.lastAccessed,
					now,
				);
			}
			if (scored.length > 0) {
				this.markDirty();
				this.save();
			}

			return scored.map((s) => s.episode);
		},

		getRecent: async (n: number): Promise<Episode[]> => {
			return this.store.episodes
				.slice()
				.sort((a, b) => b.timestamp - a.timestamp)
				.slice(0, n);
		},

		getUnconsolidated: async (): Promise<Episode[]> => {
			return this.store.episodes.filter((ep) => !ep.consolidated);
		},

		markConsolidated: async (ids: string[]): Promise<void> => {
			const idSet = new Set(ids);
			for (const ep of this.store.episodes) {
				if (idSet.has(ep.id)) {
					ep.consolidated = true;
				}
			}
			this.markDirty();
			this.save();
		},
	};

	// ─── Semantic Memory ──────────────────────────────────────────────────

	semantic = {
		upsert: async (fact: Fact): Promise<void> => {
			const now = Date.now();
			const existing = this.store.facts.find((f) => f.id === fact.id);
			const contentChanged = !existing || existing.content !== fact.content;
			if (existing) {
				existing.content = fact.content;
				existing.entities = [
					...new Set([...existing.entities, ...fact.entities]),
				];
				existing.topics = [...new Set([...existing.topics, ...fact.topics])];
				existing.updatedAt = fact.updatedAt;
				existing.importance = Math.max(existing.importance, fact.importance);
				existing.sourceEpisodes = [
					...new Set([...existing.sourceEpisodes, ...fact.sourceEpisodes]),
				];
				existing.status = fact.status ?? existing.status;
			} else {
				this.store.facts.push(fact);
			}

			// Register entities in knowledge graph and strengthen co-occurrence edges
			const entities = existing?.entities ?? fact.entities;
			for (const entity of entities) {
				this.kg.touchNode(entity, now);
			}
			// Strengthen edges between all entity pairs in this fact (Hebbian)
			for (let i = 0; i < entities.length; i++) {
				for (let j = i + 1; j < entities.length; j++) {
					this.kg.strengthen(entities[i], entities[j], 0.05, now);
				}
			}

			// Embed fact content for vector search (only if content changed or new fact)
			// Embed fact content for vector search (only if content changed or new fact)
			if (contentChanged) {
				const fVec = await this.embedWithCache(fact.content);
				if (fVec) this.store.factEmbeddings![fact.id] = fVec;
			}

			this.markDirty();
			this.save();
		},

 		search: async (
 			query: string,
 			topK: number,
 			deepRecall = false,
 			context?: { project?: string },
 		): Promise<Fact[]> => {
			const now = Date.now();
			const BROAD_FACTOR = 3;
			const searchMode = process.env.NAIA_SEARCH_MODE ?? "vector-only";

			const queryVec = await this.embedWithCache(query);

			const queryTokens = tokenize(query);
			const activatedEntities = this.kg.spreadingActivation(
				queryTokens,
				2,
				0.5,
			);
			const activationMap = new Map<string, number>();
			for (const { entity, activation } of activatedEntities) {
				activationMap.set(entity, activation);
			}

			const broadK = topK * BROAD_FACTOR;
			const RRF_K = 60;
			const useBM25 = searchMode !== "vector-only";

			const proj = context?.project;
			const allFacts = proj
				? this.store.facts.filter(
						(f) =>
							f.encodingContext?.project === proj ||
							(f.topics?.includes(proj) ?? false),
					)
				: this.store.facts;
			const vectorScores: Map<string, number> = new Map();
			const bm25Scores: Map<string, number> = new Map();
			const entityBonuses: Map<string, number> = new Map();

			let bm25Instance: InstanceType<typeof BM25> | null = null;
			if (useBM25) {
				bm25Instance = new BM25();
				const docMap = new Map<string, string>();
				for (const f of this.store.facts) {
					docMap.set(f.id, [f.content, ...f.entities, ...f.topics].join(" "));
				}
				bm25Instance.index(docMap);
			}

			for (const fact of allFacts) {
				const factVec = this.store.factEmbeddings?.[fact.id];
				const vs = factVec && queryVec ? cosineSimilarity(queryVec, factVec) : 0;
				vectorScores.set(fact.id, vs);

				if (bm25Instance) {
					const bs = bm25Instance.score(query, fact.id);
					bm25Scores.set(fact.id, bs);
				}

				let eb = 0;
				for (const qt of queryTokens) {
					if (fact.entities.some((e) => e.toLowerCase().includes(qt))) {
						eb += 0.3;
					}
				}
				entityBonuses.set(fact.id, eb);
			}

			const byVector = [...allFacts].sort((a, b) => (vectorScores.get(b.id) ?? 0) - (vectorScores.get(a.id) ?? 0));
			const vectorRank = new Map<string, number>();
			for (let i = 0; i < byVector.length; i++) vectorRank.set(byVector[i].id, i + 1);

			let bm25Rank: Map<string, number> | null = null;
			if (useBM25) {
				const byBM25 = [...allFacts].sort((a, b) => (bm25Scores.get(b.id) ?? 0) - (bm25Scores.get(a.id) ?? 0));
				bm25Rank = new Map<string, number>();
				for (let i = 0; i < byBM25.length; i++) bm25Rank.set(byBM25[i].id, i + 1);
			}

			const candidates = allFacts
				.map((fact) => {
					const vs = vectorScores.get(fact.id) ?? 0;
					const bs = bm25Scores.get(fact.id) ?? 0;
					const eb = entityBonuses.get(fact.id) ?? 0;

					const isRelevant = vs >= 0.12 || bs > 0 || eb >= 0.2;
					if (!isRelevant && !deepRecall) return null;

					let relevanceScore: number;
					if (searchMode === "vector-only") {
						relevanceScore = vs + eb;
					} else {
						relevanceScore =
							1 / (RRF_K + (vectorRank.get(fact.id) ?? allFacts.length)) +
							1 / (RRF_K + (bm25Rank!.get(fact.id) ?? allFacts.length));
					}

					return { fact, relevanceScore, vectorScore: vs };
				})
				.filter((x): x is NonNullable<typeof x> => x !== null)
				.sort((a, b) => b.relevanceScore - a.relevanceScore)
				.slice(0, broadK);

			// Stage 2: Re-rank with importance/strength only among candidates
			let scored = candidates
				.map(({ fact, relevanceScore, vectorScore }) => {
					const strength = calculateStrength(
						fact.importance,
						fact.createdAt,
						fact.recallCount,
						fact.lastAccessed,
						now,
					);

					const finalScore = deepRecall
						? relevanceScore
						: relevanceScore * 0.7 + strength * 0.3;

					return { fact, score: finalScore, strength, vectorScore };
				})
				.filter((x) => x.score > 0)
				.sort((a, b) => b.score - a.score);

			if (!deepRecall) {
				scored = scored.filter(f => f.fact.status !== "superseded");
			}

			scored = scored.slice(0, topK);

			// Update recall counts
			for (const { fact } of scored) {
				fact.recallCount++;
				fact.lastAccessed = now;
				fact.strength = calculateStrength(
					fact.importance,
					fact.createdAt,
					fact.recallCount,
					fact.lastAccessed,
					now,
				);
			}
			if (scored.length > 0) {
				this.markDirty();
				this.save();
			}

			return scored.map((s) => {
				s.fact.relevanceScore = s.score;
				return s.fact;
			});
		},

		decay: async (now: number): Promise<number> => {
			const before = this.store.facts.length;
			this.store.facts = this.store.facts.filter((fact) => {
				const strength = calculateStrength(
					fact.importance,
					fact.createdAt,
					fact.recallCount,
					fact.lastAccessed,
					now,
				);
				fact.strength = strength;
				return !shouldPrune(strength);
			});
			const pruned = before - this.store.facts.length;

			// Also decay episodes
			const epBefore = this.store.episodes.length;
			this.store.episodes = this.store.episodes.filter((ep) => {
				const strength = calculateStrength(
					ep.importance.utility,
					ep.timestamp,
					ep.recallCount,
					ep.lastAccessed,
					now,
				);
				ep.strength = strength;
				// Keep consolidated episodes longer (they've contributed to semantic memory)
				return !shouldPrune(strength) || ep.consolidated;
			});
			const totalPruned = pruned + (epBefore - this.store.episodes.length);

			if (totalPruned > 0) {
				this.markDirty();
				this.save();
			}
			return totalPruned;
		},

		associate: async (
			entityA: string,
			entityB: string,
			weight = 0.1,
		): Promise<void> => {
			const key = assocKey(entityA, entityB);
			const current = this.store.associations[key] ?? 0;
			// Hebbian: strengthen on co-access, cap at 1.0
			this.store.associations[key] = Math.min(1.0, current + weight);
			// Also update knowledge graph
			this.kg.strengthen(entityA, entityB, weight);
			this.markDirty();
			this.save();
		},

		getAll: async (): Promise<Fact[]> => {
			return [...this.store.facts];
		},

		delete: async (id: string): Promise<boolean> => {
			const idx = this.store.facts.findIndex((f) => f.id === id);
			if (idx === -1) return false;
			this.store.facts.splice(idx, 1);
			this.markDirty();
			this.save();
			return true;
		},
	};

	// ─── Procedural Memory ────────────────────────────────────────────────

	procedural = {
		getSkill: async (name: string): Promise<Skill | null> => {
			return this.store.skills.find((s) => s.name === name) ?? null;
		},

		recordOutcome: async (name: string, success: boolean): Promise<void> => {
			const skill = this.store.skills.find((s) => s.name === name);
			if (skill) {
				if (success) skill.successCount++;
				else skill.failureCount++;
				skill.confidence =
					skill.successCount / (skill.successCount + skill.failureCount);
			} else {
				this.store.skills.push({
					id: randomUUID(),
					name,
					description: "",
					learnedAt: Date.now(),
					successCount: success ? 1 : 0,
					failureCount: success ? 0 : 1,
					confidence: success ? 1.0 : 0.0,
				});
			}
			this.markDirty();
			this.save();
		},

		learnFromFailure: async (reflection: Reflection): Promise<void> => {
			this.store.reflections.push(reflection);
			this.markDirty();
			this.save();
		},

		getReflections: async (
			task: string,
			topK: number,
		): Promise<Reflection[]> => {
			return this.store.reflections
				.map((r) => ({
					reflection: r,
					score: keywordScore(task, `${r.task} ${r.failure} ${r.analysis}`),
				}))
				.filter((x) => x.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, topK)
				.map((x) => x.reflection);
		},
	};

	// ─── Consolidation ────────────────────────────────────────────────────

	async consolidate(): Promise<ConsolidationResult> {
		const result: ConsolidationResult = {
			episodesProcessed: 0,
			factsCreated: 0,
			factsUpdated: 0,
			memoriesPruned: 0,
			associationsUpdated: 0,
		};

		const now = Date.now();

		// 1. Decay sweep
		result.memoriesPruned = await this.semantic.decay(now);

		// 2. Association decay (Hebbian: unused associations weaken)
		const keysToRemove: string[] = [];
		for (const [key, weight] of Object.entries(this.store.associations)) {
			const decayed = weight * 0.95; // 5% decay per consolidation cycle
			if (decayed < 0.01) {
				keysToRemove.push(key);
			} else {
				this.store.associations[key] = decayed;
				result.associationsUpdated++;
			}
		}
		for (const key of keysToRemove) {
			delete this.store.associations[key];
		}

		// 3. Knowledge graph edge decay
		result.associationsUpdated += this.kg.decayEdges(0.95, 0.01);

		// 4. Mark unconsolidated episodes older than 1 hour as ready for extraction
		// (actual fact extraction requires LLM — done by MemorySystem, not adapter)
		const unconsolidated = this.store.episodes.filter(
			(ep) => !ep.consolidated && now - ep.timestamp > 60 * 60 * 1000,
		);
		result.episodesProcessed = unconsolidated.length;

		this.markDirty();
		this.save();

		return result;
	}

	// ─── Backup / Restore (E2E Encrypted Blob) ───────────────────────────

	/**
	 * Export all memory as an AES-256-GCM encrypted blob.
	 *
	 * Blob layout:
	 *   4 bytes  magic    "NAIA"
	 *   1 byte   version  0x01
	 *   16 bytes salt     (PBKDF2 input)
	 *   12 bytes iv       (AES-GCM nonce)
	 *   16 bytes authTag  (AES-GCM authentication tag)
	 *   N bytes  ciphertext
	 *
	 * Total fixed header: 49 bytes. Integrity is provided by AES-GCM authTag —
	 * a separate SHA-256 over plaintext is not included because GCM already
	 * authenticates the ciphertext under the derived key.
	 *
	 * Key derivation: PBKDF2-SHA256, 200_000 iterations, 32-byte key.
	 * Password never leaves the client. Only the encrypted blob is transported.
	 *
	 * @param password  User-supplied passphrase (never stored)
	 * @returns         Encrypted blob as Uint8Array
	 */
	async export(password: string): Promise<Uint8Array> {
		if (!password) throw new Error("Password must not be empty");
		const plaintext = Buffer.from(JSON.stringify(this.store), "utf-8");
		const salt = randomBytes(16);
		const iv = randomBytes(12);

		// Derive key
		const key = await pbkdf2Async(password, salt, 200_000, 32, "sha256");

		// AES-256-GCM encrypt — authTag provides authenticated integrity
		const cipher = createCipheriv("aes-256-gcm", key, iv, {
			authTagLength: 16,
		});
		const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
		const authTag = cipher.getAuthTag(); // 16 bytes

		// Assemble: magic(4) + version(1) + salt(16) + iv(12) + authTag(16) + ciphertext
		const magic = Buffer.from("NAIA", "ascii");
		const version = Buffer.from([0x01]);
		return new Uint8Array(
			Buffer.concat([magic, version, salt, iv, authTag, encrypted]),
		);
	}

	/**
	 * Import memory from an encrypted blob created by `export()`.
	 * Replaces current memory entirely after successful decryption.
	 * Rolls back in-memory state if the disk write fails (crash safety).
	 *
	 * @param blob      Encrypted blob from export()
	 * @param password  User-supplied passphrase
	 * @throws          If decryption fails, JSON is invalid, or disk write fails
	 */
	async import(blob: Uint8Array, password: string): Promise<void> {
		if (!password) throw new Error("Password must not be empty");
		const buf = Buffer.from(blob);

		// Parse header: magic(4) + version(1) + salt(16) + iv(12) + authTag(16) = 49 bytes
		const HEADER_SIZE = 4 + 1 + 16 + 12 + 16;
		if (buf.length <= HEADER_SIZE) {
			throw new Error("Invalid backup blob: too short");
		}

		const magic = buf.subarray(0, 4).toString("ascii");
		if (magic !== "NAIA") {
			throw new Error("Invalid backup blob: bad magic");
		}

		const blobVersion = buf[4];
		if (blobVersion !== 0x01) {
			throw new Error(`Unsupported backup version: ${blobVersion}`);
		}

		const salt = buf.subarray(5, 21);
		const iv = buf.subarray(21, 33);
		const authTag = buf.subarray(33, 49);
		const ciphertext = buf.subarray(HEADER_SIZE);

		// Derive key
		const key = await pbkdf2Async(password, salt, 200_000, 32, "sha256");

		// AES-256-GCM decrypt — decipher.final() throws if authTag is invalid
		let plaintext: Buffer;
		try {
			const decipher = createDecipheriv("aes-256-gcm", key, iv, {
				authTagLength: 16,
			});
			decipher.setAuthTag(authTag);
			plaintext = Buffer.concat([
				decipher.update(ciphertext),
				decipher.final(),
			]);
		} catch {
			throw new Error("Decryption failed: wrong password or corrupted blob");
		}

		// Parse and validate store
		let parsed: MemoryStore;
		try {
			parsed = JSON.parse(plaintext.toString("utf-8")) as MemoryStore;
		} catch {
			throw new Error("Invalid backup: JSON parse failed");
		}
		if (parsed.version !== 1) {
			throw new Error(`Unsupported store version: ${parsed.version}`);
		}
		// Minimal shape guard — ensures downstream operations don't encounter missing arrays/objects
		if (
			!Array.isArray(parsed.episodes) ||
			!Array.isArray(parsed.facts) ||
			!Array.isArray(parsed.skills) ||
			!Array.isArray(parsed.reflections) ||
			typeof parsed.associations !== "object" ||
			Array.isArray(parsed.associations) ||
			parsed.associations === null
		) {
			throw new Error("Invalid backup: store shape mismatch");
		}

		// Replace memory — roll back in-memory state if disk write fails
		const previousStore = this.store;
		const previousKg = this.kg;
		// Ensure knowledgeGraph is always present before constructing KnowledgeGraph
		const importedKgState = parsed.knowledgeGraph ?? emptyKGState();
		parsed.knowledgeGraph = importedKgState;
		this.store = parsed;
		// Re-point KG to the newly imported state so all subsequent KG operations
		// operate on the imported KGState, not the old one.
		this.kg = new KnowledgeGraph(importedKgState);
		try {
			this.markDirty();
			this.save();
		} catch (err) {
			// Disk write failed — restore both store and KG to avoid divergence
			this.store = previousStore;
			this.kg = previousKg;
			throw err;
		}
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────

	async close(): Promise<void> {
		this.save();
	}

	// ─── Testing Helpers ──────────────────────────────────────────────────

	/** Get raw store for testing/debugging */
	getStore(): Readonly<MemoryStore> {
		return this.store;
	}

	/** Get knowledge graph for direct queries */
	getKnowledgeGraph(): KnowledgeGraph {
		return this.kg;
	}

	/** Reset all memory (testing only) */
	reset(): void {
		this.store = emptyStore();
		this.markDirty();
		this.save();
	}
}
