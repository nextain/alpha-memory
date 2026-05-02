/**
 * Naia v3 stateless layered memory system — type definitions.
 *
 * Design principle: every layer is a stateless function.
 * input → output, no side effects (except for engine which manages storage).
 */

export interface Episode {
	id?: string;
	content: string;
	role: "user" | "assistant" | "system";
	timestamp?: number; // Unix seconds
	speaker?: string;
	metadata?: Record<string, unknown>;
}

export interface EnrichedEpisode extends Episode {
	importance: number; // 0..1
	emotion: number; // -1..1
	surprise: number; // 0..1
	tokens: string[]; // KO normalized tokens
	encodingContext?: {
		project?: string;
		userId?: string;
		[k: string]: unknown;
	};
}

export interface Candidate {
	memory: string;
	score: number; // engine raw score
	id: string;
	createdAt?: number;
	metadata?: Record<string, unknown>;
}

export interface RankedMemory extends Candidate {
	finalScore: number;
	signals: {
		engineScore: number;
		recency: number;
		importance: number;
		temporalProximity?: number;
	};
	status: "active" | "superseded" | "archived";
}

export interface QueryContext {
	query: string;
	userId: string;
	referenceDate?: Date; // for KO temporal resolution
	topK?: number;
}

export interface AbstentionDecision {
	abstain: boolean;
	confidence: number;
	reason?: string;
}

export interface ContradictionFlag {
	conflictingFactIds: string[];
	conflictType: "direct" | "indirect" | "temporal";
}

// Layer interfaces (stateless functions)

export type PreProcessFn = (e: Episode, ctx: { userId: string }) => EnrichedEpisode;

export interface MemoryEngine {
	add(e: EnrichedEpisode, userId: string): Promise<void>;
	search(q: QueryContext): Promise<Candidate[]>;
	delete(factId: string, userId: string): Promise<void>;
	update(factId: string, userId: string, newContent: string): Promise<void>;
}

export type TemporalEnrichFn = (
	q: QueryContext,
	candidates: Candidate[],
) => Candidate[];

export type RerankerFn = (
	q: QueryContext,
	candidates: Candidate[],
) => RankedMemory[];

export type ContradictionDetectFn = (
	newEp: EnrichedEpisode,
	existing: Candidate[],
) => ContradictionFlag | null;

export type AbstentionCheckFn = (
	q: QueryContext,
	ranked: RankedMemory[],
) => AbstentionDecision;
