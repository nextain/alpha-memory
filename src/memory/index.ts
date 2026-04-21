/**
 * MemorySystem — Orchestrator for Alpha's memory architecture.
 *
 * Coordinates the 4-store memory system:
 * - Working Memory: managed by ContextManager (#65)
 * - Episodic Memory: timestamped events via MemoryAdapter
 * - Semantic Memory: facts/knowledge via MemoryAdapter
 * - Procedural Memory: skills/reflections via MemoryAdapter
 *
 * This class handles:
 * - Memory encoding (with importance gating)
 * - Memory retrieval (with context-dependent recall)
 * - Consolidation scheduling (sleep cycle analog)
 */

import crypto, { randomUUID } from "node:crypto";
import { LocalAdapter } from "./adapters/local.js";
import { QdrantAdapter } from "./adapters/qdrant.js";
import type { EmbeddingProvider } from "./embeddings.js";
import { scoreImportance, shouldStore } from "./importance.js";
import { findContradictions } from "./reconsolidation.js";
import type {
	BackupCapable,
	ConsolidationResult,
	EncodingContext,
	Episode,
	Fact,
	MemoryAdapter,
	MemoryInput,
	RecallContext,
	Reflection,
} from "./types.js";

// Re-exports for package consumers
export type { EmbeddingProvider };
export {
	OfflineEmbeddingProvider,
	OpenAICompatEmbeddingProvider,
	NaiaGatewayEmbeddingProvider,
} from "./embeddings.js";
export { LocalAdapter } from "./adapters/local.js";
export { QdrantAdapter } from "./adapters/qdrant.js";
export type {
	BackupCapable,
	MemoryAdapter,
	Episode,
	Fact,
	Reflection,
	Skill,
	MemoryInput,
	RecallContext,
	EncodingContext,
	ImportanceScore,
	ConsolidationResult,
} from "./types.js";

// Import A/B test algorithm interfaces and implementations
import type { MemoryAlgorithm } from "./algorithms/base.js";
import { AlgorithmVariantA } from "./algorithms/variantA.js";
import { AlgorithmVariantB } from "./algorithms/variantB.js";


/**
 * Callback for extracting facts from episodes.
 * In production, this would call an LLM. For testing, a simple heuristic.
 */
export type FactExtractor = (episodes: Episode[]) => Promise<ExtractedFact[]>;

/** A fact extracted from episodes (before insertion) */
export interface ExtractedFact {
	content: string;
	entities: string[];
	topics: string[];
	importance: number;
	sourceEpisodeIds: string[];
}

export interface MemorySystemOptions {
	/** Pre-built adapter. If omitted and qdrantOptions is not set, defaults to LocalAdapter. */
	adapter?: MemoryAdapter;
	/**
	 * Embedding provider for vector search.
	 * - Required when adapter = 'qdrant'
	 * - Used by LocalAdapter for vector similarity search when provided.
	 *   Falls back to keyword-only search when omitted.
	 */
	embeddingProvider?: EmbeddingProvider;
	/** Consolidation interval in ms (default: 30 minutes) */
	consolidationIntervalMs?: number;
	/** Custom fact extractor (default: heuristic). Inject LLM-based extractor in production. */
	factExtractor?: FactExtractor;
	/** Optional LLM summarizer for `compact()`. When omitted, compact()
	 *  uses a deterministic recap. When provided, the summarizer polishes
	 *  the recap (fallback to deterministic on failure). */
	summarizer?: CompactionSummarizer;
	/** Qdrant-specific options. When set, QdrantAdapter is used; embeddingProvider is required. */
	qdrantOptions?: {
		url: string;
		/** Qdrant cloud API key (optional for local Qdrant) */
		apiKey?: string;
		collectionPrefix?: string;
	};
}

// Placeholder for heuristicFactExtractor and related functions
// In a real scenario, these would be properly implemented or replaced by LLM calls.
let _heuristicWarnOnce = false;
async function heuristicFactExtractor(
	episodes: Episode[],
): Promise<ExtractedFact[]> {
	if (!_heuristicWarnOnce) {
		console.warn(
			"[MemorySystem] Using heuristic fact extractor (no LLM). Inject factExtractor option for production.",
		);
		_heuristicWarnOnce = true;
	}
	return episodes.map((ep) => ({
		content: ep.content,
		entities: [],
		topics: ep.encodingContext.project ? [ep.encodingContext.project] : [],
		importance: ep.importance.utility,
		sourceEpisodeIds: [ep.id],
	}));
}
function contentTokens(text: string): Set<string> {
	return new Set();
}
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
	return 0;
}
const TEMPORAL_GROUP_WINDOW_MS = 30 * 60 * 1000;
const MAX_EPISODES_PER_CYCLE = 200;
function mergeRelatedFacts(
	facts: ExtractedFact[],
	sourceEpisodes?: Episode[],
): ExtractedFact[] {
	return facts;
}

// Factory function to get the correct memory algorithm variant
function getMemoryAlgorithm(variant: string): MemoryAlgorithm {
	switch (variant) {
		case "control":
			return new AlgorithmVariantA();
		case "treatment":
			return new AlgorithmVariantB();
		default:
			console.warn(
				`Unknown memory algorithm variant: ${variant}. Defaulting to 'control'.`,
			);
			return new AlgorithmVariantA(); // Default to control
	}
}

export class MemorySystem {
	private readonly adapter: MemoryAdapter;
	private readonly _initPromise: Promise<void>;
	private consolidationTimer: ReturnType<typeof setInterval> | null = null;
	private readonly consolidationIntervalMs: number;
	private readonly factExtractor: FactExtractor;
	private _isConsolidating = false;

	constructor(options: MemorySystemOptions) {
		this.consolidationIntervalMs =
			options.consolidationIntervalMs ?? 30 * 60 * 1000;
		this.factExtractor = options.factExtractor ?? heuristicFactExtractor;
		if (options.summarizer) this.summarizer = options.summarizer;

		if (options.qdrantOptions) {
			if (!options.embeddingProvider) {
				throw new Error(
					"Qdrant adapter requires an embeddingProvider in MemorySystemOptions",
				);
			}
			const qdrantAdapter = new QdrantAdapter({
				...options.qdrantOptions,
				embeddingProvider: options.embeddingProvider,
			});
			this.adapter = qdrantAdapter;
			this._initPromise = qdrantAdapter.initialize();
		} else if (options.adapter) {
			this.adapter = options.adapter;
			this._initPromise = Promise.resolve();
		} else {
			const localAdapter = new LocalAdapter({
				embeddingProvider: options.embeddingProvider,
			});
			this.adapter = localAdapter;
			this._initPromise = Promise.resolve();
		}
	}

	/** Asynchronously initializes the MemorySystem. Must be called after constructor. */
	async init(): Promise<void> {
		await this._initPromise;
	}

	/** Whether a consolidation cycle is currently running */
	get isConsolidating(): boolean {
		return this._isConsolidating;
	}

	// ─── Memory Encoding ──────────────────────────────────────────────────

	/**
	 * Encode a new memory from a conversation turn.
	 * Applies importance gating (amygdala analog) — low-utility inputs are dropped.
	 * Checks for contradictions with existing facts (reconsolidation).
	 *
	 * @returns The episode if stored, null if gated out
	 */
	async encode(
		input: MemoryInput,
		context: EncodingContext,
	): Promise<Episode | null> {
		const score = scoreImportance(input);

		if (!shouldStore(score)) {
			return null; // Gated out — not worth storing
		}

		const now = input.timestamp ?? Date.now();
		const episode: Episode = {
			id: randomUUID(),
			content: input.content,
			role: input.role,
			summary: input.content.slice(0, 200),
			timestamp: now,
			importance: score,
			encodingContext: context,
			consolidated: false,
			recallCount: 0,
			lastAccessed: now,
			strength: score.utility,
		};

		await this.adapter.episode.store(episode);

		// Reconsolidation: check if new info contradicts existing facts
		// Runs for all stored messages — contradiction detection is cheap
		await this.checkAndReconsolidate(
			input.content,
			episode.id,
			score.utility,
			now,
		);

		// Strengthen associations between entities in the encoding context
		if (context.project && context.activeFile) {
			await this.adapter.semantic.associate(
				context.project,
				context.activeFile,
			);
		}

		return episode;
	}

	/**
	 * Check new information against existing facts for contradictions.
	 * Automatically updates facts when contradictions are detected (reconsolidation).
	 *
	 * Uses vector search instead of getAll() — O(topK) instead of O(N).
	 */
	private async checkAndReconsolidate(
		newInfo: string,
		episodeId: string,
		importance: number,
		now: number,
	): Promise<void> {
		// Search for semantically similar facts instead of loading all
		const candidates = await this.adapter.semantic.search(newInfo, 10);
		const contradictions = findContradictions(candidates, newInfo);

		// Update ALL contradicted facts to prevent stale contradictory data
		// (Partial resolution bug #4 fixed)
		for (const { fact, result } of contradictions) {
			if (result.action === "update" && result.updatedContent) {
				const newImportance = Math.max(fact.importance, importance, 0.7);
				await this.adapter.semantic.upsert({
					...fact,
					content: result.updatedContent,
					updatedAt: now,
					lastAccessed: now, // Strengthening on reactivation
					importance: newImportance,
					strength: newImportance,
					sourceEpisodes: [...new Set([...fact.sourceEpisodes, episodeId])],
				});
			}
		}
	}

	// ─── Memory Retrieval ─────────────────────────────────────────────────

	/**
	 * Recall relevant memories for a query.
	 * Combines episodic recall + semantic search + procedural reflections.
	 * Implements Tulving's encoding specificity — context at retrieval matters.
	 */
	async recall(
		query: string,
		context: RecallContext,
	): Promise<{
		episodes: Episode[];
		facts: Fact[];
		reflections: Reflection[];
	}> {
		const topK = context.topK ?? 20;

		const [episodes, facts, reflections] = await Promise.all([
			this.adapter.episode.recall(query, { ...context, topK }),
			this.adapter.semantic.search(query, topK, context.deepRecall),
			this.adapter.procedural.getReflections(query, topK),
		]);

		return { episodes, facts, reflections };
	}

	/**
	 * A/B Test enabled search method for memory algorithms.
	 * Uses the selected variant of the memory algorithm to perform the search.
	 */
	async search(
		query: string,
		variant = "control",
		options?: any,
	): Promise<any[]> {
		console.log(`[MemorySystem] Performing search with variant: ${variant}`);
		const algorithm = getMemoryAlgorithm(variant);
		// Log start time
		const startTime = process.hrtime.bigint();
		const results = await algorithm.retrieve(query, options);
		// Log end time and duration
		const endTime = process.hrtime.bigint();
		const durationMs = Number(endTime - startTime) / 1_000_000;
		console.log(
			`Experiment: memory_algorithm_experiment, Variant: ${variant}, Query: "${query}", Results Count: ${results.length}, Duration: ${durationMs.toFixed(2)}ms`,
		);
		return results;
	}

	/**
	 * Auto-recall for session init (L6 analog).
	 * Retrieves relevant context before first LLM call of a new session.
	 */
	async sessionRecall(
		firstMessage: string,
		context: RecallContext,
	): Promise<string> {
		const { episodes, facts, reflections } = await this.recall(firstMessage, {
			...context,
			topK: 10,
		});

		if (facts.length === 0 && reflections.length === 0 && episodes.length === 0)
			return "";

		const parts: string[] = [];

		if (facts.length > 0) {
			parts.push("## 관련 기억");
			for (const fact of facts) {
				parts.push(`- ${fact.content}`);
			}
		}

		// Surface recent episodes alongside facts, or as sole context when no facts exist yet.
		// Episodes capture conversations not yet consolidated into facts (consolidation runs
		// on a background timer — episodes may be more up-to-date than the fact store).
		if (episodes.length > 0) {
			parts.push("## 이전 대화에서");
			for (const ep of episodes) {
				// ep.role can be any string at runtime (JSON deserialization from older stores)
				const roleStr: string | undefined = ep.role;
				let prefix: string;
				if (roleStr === "user") {
					prefix = "사용자";
				} else if (roleStr === "assistant") {
					prefix = "Naia";
				} else if (roleStr === "tool") {
					prefix = "도구";
				} else if (roleStr === undefined) {
					prefix = "기록";
				} else {
					// Unexpected role value (e.g., corrupted stored data) — log for observability
					console.warn(
						`[MemorySystem] sessionRecall: unexpected episode role: ${roleStr}`,
					);
					prefix = "기록";
				}
				parts.push(`- ${prefix}: ${ep.content}`);
			}
		}

		if (reflections.length > 0) {
			parts.push("## 과거 경험에서 배운 것");
			for (const ref of reflections) {
				parts.push(`- ${ref.task}: ${ref.correction}`);
			}
		}

		return parts.join("\n");
	}

	// ─── Procedural Learning ──────────────────────────────────────────────

	/**
	 * Record a task failure with self-reflection (Reflexion pattern).
	 */
	async reflectOnFailure(
		task: string,
		failure: string,
		analysis: string,
		correction: string,
	): Promise<void> {
		const reflection: Reflection = {
			task,
			failure,
			analysis,
			correction,
			timestamp: Date.now(),
		};
		await this.adapter.procedural.learnFromFailure(reflection);
	}

	// ─── Consolidation (Sleep Cycle) ──────────────────────────────────────

	/**
	 * Start the background consolidation timer.
	 * Runs periodically during idle time, like sleep-cycle memory consolidation.
	 *
	 * Neuroscience basis: during slow-wave sleep, the hippocampus replays
	 * recent experiences and transfers patterns to the neocortex.
	 */
	startConsolidation(): void {
		if (this.consolidationTimer) return;
		this.consolidationTimer = setInterval(async () => {
			try {
				await this.consolidateNow();
			} catch (err) {
				// Non-critical — log and continue
				console.error("[MemorySystem] consolidation error:", err);
			}
		}, this.consolidationIntervalMs);
	}

	/** Stop the consolidation timer */
	stopConsolidation(): void {
		if (this.consolidationTimer) {
			clearInterval(this.consolidationTimer);
			this.consolidationTimer = null;
		}
	}

	/**
	 * Run a full consolidation cycle on demand.
	 *
	 * Pipeline:
	 * 1. Extract facts from unconsolidated episodes (hippocampal replay)
	 * 2. Check extracted facts against existing facts (reconsolidation)
	 * 3. Upsert new/updated facts into semantic memory
	 * 4. Mark processed episodes as consolidated
	 * 5. Run adapter-level decay + association cleanup
	 */
	async consolidateNow(force = false): Promise<ConsolidationResult> {
		if (this._isConsolidating) {
			return {
				episodesProcessed: 0,
				factsCreated: 0,
				factsUpdated: 0,
				memoriesPruned: 0,
				associationsUpdated: 0,
			};
		}
		this._isConsolidating = true;

		try {
			const now = Date.now();
			let factsCreated = 0;
			let factsUpdated = 0;

			// 1. Get unconsolidated episodes
			// LocalAdapter returns insertion order (oldest-first); slice preserves that order.
			const unconsolidated = await this.adapter.episode.getUnconsolidated();
			const readyEpisodes = unconsolidated
				.filter((ep) => force || now - ep.timestamp > 5 * 60 * 1000) // 5 min age gate (skip if forced)
				.slice(0, MAX_EPISODES_PER_CYCLE); // Cap batch size — oldest first

			if (readyEpisodes.length > 0) {
				// 2. Extract facts from episodes
				const extracted = await this.factExtractor(readyEpisodes);

				// Dedup entity-pair associations across the entire cycle (not just per-fact)
				const seenPairs = new Set<string>();

				// 3. For each extracted fact, check contradictions and upsert
				for (const ef of extracted) {
					// Search for semantically similar facts instead of getAll() — O(topK) not O(N)
					const existingFacts = await this.adapter.semantic.search(
						ef.content,
						10,
					);

					// Check for exact/near identity to prevent semantic redundancy (#4)
					const duplicate = existingFacts.find((f) => {
						const sim = jaccardSimilarity(
							contentTokens(f.content),
							contentTokens(ef.content),
						);
						return sim > 0.85; // High similarity threshold for identity
					});

					if (duplicate) {
						// Near-duplicate found — update metadata but don't create new entry
						const newImportance = Math.max(
							duplicate.importance,
							ef.importance,
							0.7,
						);
						await this.adapter.semantic.upsert({
							...duplicate,
							updatedAt: now,
							lastAccessed: now, // Strengthening on reactivation
							importance: newImportance,
							strength: newImportance,
							sourceEpisodes: [
								...new Set([
									...duplicate.sourceEpisodes,
									...ef.sourceEpisodeIds,
								]),
							],
						});
						factsUpdated++;
						continue;
					}

					const contradictions = findContradictions(existingFacts, ef.content);

					if (contradictions.length > 0) {
						// Update ALL contradicted facts to prevent stale contradictory data
						// (Partial resolution bug #4 fixed)
						for (const { fact, result } of contradictions) {
							if (result.action === "update" && result.updatedContent) {
								const newImportance = Math.max(
									fact.importance,
									ef.importance,
									0.7,
								);
								await this.adapter.semantic.upsert({
									...fact,
									content: result.updatedContent,
									updatedAt: now,
									lastAccessed: now, // Strengthening on reactivation
									importance: newImportance,
									strength: newImportance,
									sourceEpisodes: [
										...new Set([
											...fact.sourceEpisodes,
											...ef.sourceEpisodeIds,
										]),
									],
								});
								factsUpdated++;
							}
						}
					} else {
						// New fact — create with deterministic UUID for idempotency
						// Prevents duplicates if consolidation is interrupted and re-run.
						// Format: 32 SHA-256 hex chars arranged as UUID (8-4-4-4-12) — accepted by both
						// LocalAdapter (string key) and QdrantAdapter (requires UUID format).
						const hashHex = crypto
							.createHash("sha256")
							.update(ef.content + ef.sourceEpisodeIds.sort().join(","))
							.digest("hex")
							.slice(0, 32);
						const deterministicId = `${hashHex.slice(0, 8)}-${hashHex.slice(8, 12)}-${hashHex.slice(12, 16)}-${hashHex.slice(16, 20)}-${hashHex.slice(20, 32)}`;

						const newImportance = Math.max(ef.importance, 0.7);
						const newFact: Fact = {
							id: deterministicId,
							content: ef.content,
							entities: ef.entities,
							topics: ef.topics,
							createdAt: now,
							updatedAt: now,
							importance: newImportance,
							recallCount: 0,
							lastAccessed: now,
							strength: newImportance,
							sourceEpisodes: ef.sourceEpisodeIds,
						};
						await this.adapter.semantic.upsert(newFact);
						factsCreated++;
					}

					// Strengthen associations between extracted entities (cycle-level dedup)
					for (let i = 0; i < ef.entities.length; i++) {
						for (let j = i + 1; j < ef.entities.length; j++) {
							const a = ef.entities[i].toLowerCase();
							const b = ef.entities[j].toLowerCase();
							const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`;
							if (seenPairs.has(pairKey)) continue;
							seenPairs.add(pairKey);
							await this.adapter.semantic.associate(a, b, 0.05);
						}
					}
				}

				// 4. Mark episodes as consolidated
				await this.adapter.episode.markConsolidated(
					readyEpisodes.map((ep) => ep.id),
				);
			}

			// 5. Run adapter-level decay + cleanup
			const adapterResult = await this.adapter.consolidate();

			return {
				episodesProcessed: readyEpisodes.length,
				factsCreated,
				factsUpdated,
				memoriesPruned: adapterResult.memoriesPruned,
				associationsUpdated: adapterResult.associationsUpdated,
			};
		} finally {
			this._isConsolidating = false;
		}
	}

	// ─── Backup ───────────────────────────────────────────────────────────

	/** Returns true if the current adapter supports encrypted backup. */
	supportsBackup(): boolean {
		return "export" in this.adapter && "import" in this.adapter;
	}

	/**
	 * Export an encrypted backup of the memory store.
	 * Only available when the adapter implements BackupCapable.
	 * @throws Error if the current adapter does not support backup.
	 */
	async exportBackup(password: string): Promise<Uint8Array> {
		if (!this.supportsBackup()) {
			throw new Error("Current memory adapter does not support backup export");
		}
		return (this.adapter as unknown as BackupCapable).export(password);
	}

	/**
	 * Import an encrypted backup, replacing the current memory store.
	 * Only available when the adapter implements BackupCapable.
	 * @throws Error if the current adapter does not support backup.
	 */
	async importBackup(blob: Uint8Array, password: string): Promise<void> {
		if (!this.supportsBackup()) {
			throw new Error("Current memory adapter does not support backup import");
		}
		return (this.adapter as unknown as BackupCapable).import(blob, password);
	}

	// ─── Compaction (naia-agent CompactableCapable) ──────────────────────
	//
	// Implements the shape of @nextain/agent-types `CompactableCapable`
	// structurally — no type-level import of that package is required,
	// keeping alpha-memory's zero-dep guarantee on external ecosystem
	// packages.
	//
	// v0: deterministic summarizer that compresses a message window into a
	// synthetic recap paragraph. No LLM call.
	// **v1 (current)**: optional `summarizer` callback. When provided,
	// MemorySystem asks it to produce a higher-fidelity summary, fallback
	// to v0 recap on failure.
	// v2 (roadmap #6 CompactionMap): rolling summary maintained during
	// encode() so compact() returns an already-built summary instantly.

	/** Optional LLM-backed summarizer. Host injects via
	 *  `MemorySystemOptions.summarizer`. Receives the compaction input and
	 *  a deterministic recap seed; returns the polished summary text. */
	private readonly summarizer?: CompactionSummarizer;

	/**
	 * Produce a summary of the given message window suitable for replacing
	 * the head of a conversation when the LLM context approaches its budget.
	 *
	 * Structural match for `CompactableCapable.compact()`.
	 */
	async compact(input: {
		messages: readonly { role: string; content: string; timestamp?: number }[];
		keepTail: number;
		targetTokens: number;
		sessionId?: string;
	}): Promise<{
		summary: { role: "assistant"; content: string; timestamp?: number };
		droppedCount: number;
		realtime?: boolean;
	}> {
		const msgs = input.messages;
		const recap = buildDeterministicRecap(msgs, input.keepTail);

		let finalContent = recap;
		let realtime = false;
		if (this.summarizer) {
			try {
				const polished = await this.summarizer({
					messages: msgs,
					keepTail: input.keepTail,
					targetTokens: input.targetTokens,
					...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
					seedSummary: recap,
				});
				if (typeof polished === "string") {
					if (polished.trim().length > 0) finalContent = polished.trim();
				} else if (polished && typeof polished.content === "string") {
					if (polished.content.trim().length > 0) {
						finalContent = polished.content.trim();
					}
					if (polished.realtime === true) realtime = true;
				}
			} catch (err) {
				console.warn("[MemorySystem] compaction summarizer failed, using deterministic recap:", err);
			}
		}

		return {
			summary: {
				role: "assistant",
				content: finalContent,
				timestamp: Date.now(),
			},
			droppedCount: msgs.length,
			realtime,
		};
	}

	// ─── Lifecycle ────────────────────────────────────────────────────────

	async close(): Promise<void> {
		this.stopConsolidation();
		await this.adapter.close();
	}
}

function truncateForRecap(s: string, max: number): string {
	const trimmed = s.trim().replace(/\s+/g, " ");
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1)}…`;
}

/**
 * Build the deterministic recap used when no summarizer is injected, and
 * as the fallback seed passed to an injected summarizer.
 */
function buildDeterministicRecap(
	msgs: readonly { role: string; content: string; timestamp?: number }[],
	keepTail: number,
): string {
	let userCount = 0;
	let assistantCount = 0;
	let toolCount = 0;
	const topics = new Set<string>();
	for (const m of msgs) {
		if (m.role === "user") userCount++;
		else if (m.role === "assistant") assistantCount++;
		else if (m.role === "tool") toolCount++;
		for (const match of m.content.matchAll(/\b[A-Z][\w-]{2,}\b/g)) {
			topics.add(match[0]);
			if (topics.size >= 8) break;
		}
	}

	const first = msgs[0];
	const last = msgs[msgs.length - 1];

	const lines: string[] = [
		`[Conversation recap — ${msgs.length} earlier messages compacted]`,
		`Turns: ${userCount} user · ${assistantCount} assistant · ${toolCount} tool`,
	];
	if (topics.size > 0) {
		lines.push(`Topics mentioned: ${Array.from(topics).join(", ")}`);
	}
	if (first) lines.push(`Started with: "${truncateForRecap(first.content, 120)}"`);
	if (last && last !== first) {
		lines.push(`Most recent before recap: "${truncateForRecap(last.content, 120)}"`);
	}
	lines.push(`(Follow-up context continues in the ${keepTail} messages after this recap.)`);

	return lines.join("\n");
}

/** Host-supplied summarizer. Receives the original messages plus the
 *  deterministic recap seed and returns either a plain polished summary
 *  string (simple shape) or a structured result that can additionally
 *  declare `realtime: true` when the summary was already precomputed
 *  (e.g. from a rolling summary maintained during encode()). */
export type CompactionSummarizer = (input: {
	messages: readonly { role: string; content: string; timestamp?: number }[];
	keepTail: number;
	targetTokens: number;
	sessionId?: string;
	seedSummary: string;
	signal?: AbortSignal;
}) => Promise<string | CompactionSummarizerResult>;

export interface CompactionSummarizerResult {
	content: string;
	/** Mark true when the summary was precomputed/cached (no fresh LLM call). */
	realtime?: boolean;
}
