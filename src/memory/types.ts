/**
 * Naia Memory System — Type definitions
 *
 * 4-store architecture inspired by Tulving's memory taxonomy + CLS theory:
 * - Episodic (Hippocampus): timestamped events with context
 * - Semantic (Neocortex): facts, entities, relationships
 * - Procedural (Basal Ganglia): skills, learned strategies
 * - Working Memory managed by ContextManager (#65)
 */

// ─── Importance Scoring (Amygdala) ───────────────────────────────────────────

/** 3-axis importance score inspired by CraniMem (2025) */
export interface ImportanceScore {
	/** How relevant to user's current goals (0.0–1.0) */
	importance: number;
	/** How unexpected/novel this information is (0.0–1.0) */
	surprise: number;
	/** User's emotional valence detected (0.0–1.0, where 0.5 = neutral) */
	emotion: number;
	/** Combined utility score */
	utility: number;
}

/** Input to the importance scoring function */
export interface MemoryInput {
	content: string;
	role: "user" | "assistant" | "tool";
	/** Current conversation context for scoring */
	context?: string;
	/** Optional override for timestamp (used in benchmarks) */
	timestamp?: number;
}

// ─── Episodic Memory (Hippocampus) ───────────────────────────────────────────

/** A single episode — a timestamped event with full context */
export interface Episode extends Record<string, unknown> {
	id: string;
	/** The content of the episode */
	content: string;
	/** Speaker role */
	role?: "user" | "assistant" | "tool";
	/** Summary for retrieval (shorter than content) */
	summary: string;
	/** When this happened */
	timestamp: number;
	/** Importance score at time of encoding */
	importance: ImportanceScore;
	/** Context at encoding (for encoding specificity principle) */
	encodingContext: EncodingContext;
	/** Has this episode been consolidated into semantic memory? */
	consolidated: boolean;
	/** Number of times this episode has been recalled */
	recallCount: number;
	/** Last time this episode was accessed */
	lastAccessed: number;
	/** Current memory strength (Ebbinghaus decay applied) */
	strength: number;
	/** Lifecycle status — R3 보존 우선 (사용자 directive 2026-05-08).
	 *  decay 가 strength 약화 시 'archived' 로 변경, splice X.
	 *  default search 에서 hide. */
	status?: "active" | "archived";
}

/** Context captured at the time of memory encoding (Tulving's encoding specificity) */
export interface EncodingContext {
	/** What project/workspace was active */
	project?: string;
	/** What file was being discussed */
	activeFile?: string;
	/** What task was being worked on */
	taskDescription?: string;
	/** Session identifier */
	sessionId?: string;
}

/** Context used when recalling episodes */
export interface RecallContext {
	/** Current project for context-dependent retrieval */
	project?: string;
	/** Current file being discussed */
	activeFile?: string;
	/** Max number of episodes to return */
	topK?: number;
	/** Minimum strength threshold */
	minStrength?: number;
	/**
	 * Deep recall mode — search long-term memory ignoring decay.
	 * Triggered when user explicitly asks about forgotten memories
	 * ("왜 잊었어?", "예전에 뭐라고 했었지?").
	 * Uses pure vector similarity without strength weighting.
	 */
	deepRecall?: boolean;
	/**
	 * R2.5 v2 — recall mode for chain + bi-temporal facts.
	 *  - 'latest' (default): only currently active facts (status==='active'
	 *    and validTo===null/undefined). Backward compat with R2.5 v1.
	 *  - 'history': include superseded chain (active + superseded). Caller
	 *    can traverse `supersedes` / `successorId` for chain order.
	 *  - 'at-time': fact versions valid at `atTimestamp` — pre-existing
	 *    bi-temporal recall (uses `factsValidAtTime`).
	 *
	 * 사용자 directive (2026-05-08): 시간 연관 회상 + 장기기억 보존.
	 * latest 가 default — 자연어 의도 파악 ("history 보여줘") 은 naia-agent.
	 */
	mode?: "latest" | "history" | "at-time";
	/** Bi-temporal anchor for `mode: 'at-time'`. ms unix timestamp. */
	atTimestamp?: number;
}

// ─── Semantic Memory (Neocortex) ─────────────────────────────────────────────

/** A semantic fact — general knowledge extracted from episodes */
export interface Fact extends Record<string, unknown> {
	id: string;
	/** The fact content */
	content: string;
	/** Extracted entities (people, tools, concepts) */
	entities: string[];
	/** Topic categories */
	topics: string[];
	/** When first created */
	createdAt: number;
	/** When last updated (reconsolidation) */
	updatedAt: number;
	/** Base importance (set at creation, modifiable) */
	importance: number;
	/** Number of times retrieved */
	recallCount: number;
	/** Last accessed timestamp */
	lastAccessed: number;
	/** Current strength (Ebbinghaus decay) */
	strength: number;
	/** Lifecycle status — superseded facts are hidden from default search */
	status: "active" | "superseded" | "archived";
	/** R2.5 v2 chain — predecessor fact id (chain backward).
	 *  Set when this fact replaces an older one on the same attribute.
	 *  Older fact's `successorId` should point back here. */
	supersedes?: string | null;
	/** R2.5 v2 chain — successor fact id (chain forward).
	 *  Set when a newer fact has replaced this one. Allows
	 *  history-mode recall to traverse the chain. */
	successorId?: string | null;
	/** R2.5 v2 — bi-temporal validity start (defaults to createdAt).
	 *  Fact is "active" between validFrom and validTo. */
	validFrom?: number;
	/** R2.5 v2 — bi-temporal validity end. `null` means currently active.
	 *  Set to the supersede timestamp when a successor takes over.
	 *  *Data preservation guarantee*: validTo replaces hard delete; the
	 *  fact record itself is never spliced from the store. */
	validTo?: number | null;
	/** Source episode IDs that contributed to this fact */
	sourceEpisodes: string[];
	/** Cosine similarity score from vector search (0.0–1.0, optional) */
	relevanceScore?: number;
	/** Encoding context inherited from source episodes — used for project-scoped retrieval */
	encodingContext?: EncodingContext;
}

// ─── Procedural Memory (Basal Ganglia / Cerebellum) ──────────────────────────

/** A learned skill/strategy from experience */
export interface Skill extends Record<string, unknown> {
	id: string;
	/** Skill name / identifier */
	name: string;
	/** What this skill does */
	description: string;
	/** When was the strategy learned */
	learnedAt: number;
	/** How many times successfully applied */
	successCount: number;
	/** How many times it failed */
	failureCount: number;
	/** Current confidence (success / (success + failure)) */
	confidence: number;
}

/** A self-reflection from a failure (Reflexion pattern) */
export interface Reflection extends Record<string, unknown> {
	/** What task was attempted */
	task: string;
	/** What went wrong */
	failure: string;
	/** Self-critique: why it failed */
	analysis: string;
	/** What to do differently next time */
	correction: string;
	/** When this reflection was created */
	timestamp: number;
}

// ─── Consolidation ──────────────────────────────────────────────────────────

/** Result of a consolidation cycle (sleep cycle analog) */
export interface ConsolidationResult {
	/** Number of episodes processed */
	episodesProcessed: number;
	/** Number of new facts extracted */
	factsCreated: number;
	/** Number of existing facts updated (reconsolidated) */
	factsUpdated: number;
	/** Number of weak memories pruned (below decay threshold) */
	memoriesPruned: number;
	/** Associations strengthened */
	associationsUpdated: number;
}

// ─── Memory Adapter Interface ───────────────────────────────────────────────

/**
 * Abstract memory adapter — gateway-independent.
 *
 * LocalAdapter (JSON file) is always functional.
 * Future adapters (cloud, distributed) can be added without changing consumers.
 */
export interface MemoryAdapter {
	/** Episodic memory operations (Hippocampus) */
	episode: {
		/** Store a new episode */
		store(event: Episode): Promise<void>;
		/** Recall episodes matching query + context (encoding specificity) */
		recall(query: string, context: RecallContext): Promise<Episode[]>;
		/** Get N most recent episodes */
		getRecent(n: number): Promise<Episode[]>;
		/** Get unconsolidated episodes for background processing */
		getUnconsolidated(): Promise<Episode[]>;
		/** Mark episodes as consolidated */
		markConsolidated(ids: string[]): Promise<void>;
	};

	/** Semantic memory operations (Neocortex) */
	semantic: {
		/** Insert or update a fact (includes reconsolidation logic) */
		upsert(fact: Fact): Promise<void>;
		/** Search facts by query string. deepRecall ignores decay for long-term retrieval.
		 *  context.atTimestamp (optional, ms): bi-temporal recall — only fact versions valid
		 *  at the given timestamp are considered. Adapters without bi-temporal support may
		 *  ignore this option (degrades to standard search). */
		search(query: string, topK: number, deepRecall?: boolean, context?: { project?: string; atTimestamp?: number; mode?: "latest" | "history" | "at-time" }): Promise<Fact[]>;
		/** Run Ebbinghaus decay sweep, returns number of pruned memories */
		decay(now: number): Promise<number>;
		/** Strengthen association between two entities (Hebbian) */
		associate(entityA: string, entityB: string, weight?: number): Promise<void>;
		/** Get all facts (for full consolidation) */
		getAll(): Promise<Fact[]>;
		/** Delete a fact by ID. Returns true if found and deleted. */
		delete(id: string): Promise<boolean>;
	};

	/** Procedural memory operations (Basal Ganglia) */
	procedural: {
		/** Get a learned skill by name */
		getSkill(name: string): Promise<Skill | null>;
		/** Record a skill usage result */
		recordOutcome(name: string, success: boolean): Promise<void>;
		/** Store a self-reflection from a failure (Reflexion pattern) */
		learnFromFailure(reflection: Reflection): Promise<void>;
		/** Get reflections relevant to a task */
		getReflections(task: string, topK: number): Promise<Reflection[]>;
	};

	/** Run a full consolidation cycle (sleep cycle analog) */
	consolidate(): Promise<ConsolidationResult>;

	/** Close the adapter and release resources */
	close(): Promise<void>;
}

// ─── Backup ──────────────────────────────────────────────────────────────────

/**
 * BackupCapable — implemented by adapters that support AES-256-GCM export/import.
 *
 * Blob layout (49-byte fixed header):
 *   4 bytes  magic    "NAIA"
 *   1 byte   version  0x01
 *   16 bytes salt     (PBKDF2 input)
 *   12 bytes iv       (AES-GCM nonce)
 *   16 bytes authTag  (AES-GCM authentication tag)
 *   N bytes  ciphertext
 *
 * Key derivation: PBKDF2-SHA256, 200_000 iterations, 32-byte key.
 */
export interface BackupCapable {
	/**
	 * Export all memory as an AES-256-GCM encrypted blob.
	 * @param password  User-supplied passphrase (never stored)
	 * @returns         Encrypted blob as Uint8Array
	 */
	export(password: string): Promise<Uint8Array>;

	/**
	 * Import memory from an encrypted blob created by export().
	 * Replaces current memory entirely after successful decryption.
	 * @param blob      Encrypted blob from export()
	 * @param password  User-supplied passphrase
	 * @throws          If decryption fails, JSON is invalid, or schema mismatch
	 */
	import(blob: Uint8Array, password: string): Promise<void>;
}
