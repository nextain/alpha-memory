/**
 * AI Hub 141 (한국어 멀티세션 대화) types.
 *
 * Source schema: `participantsInfo`, `personaInfo`, `topicInfo`, `sessionInfo[]`.
 * Each conversation file = one multisession (S2/S3/S4 = number of sessions).
 *
 * License: AI Hub (NIA) — raw json **redistribution prohibited**.
 *          Loader-only commit; raw data via `AIHUB_141_PATH` env var.
 */

export interface AIHub141PersonaInfo {
	personaID: string;
	personaFeatures: string[]; // 5 facts (sometimes 6-7)
	speakerType: "speaker1" | "speaker2";
}

export interface AIHub141Turn {
	speaker: "speaker1" | "speaker2";
	personaID: string;
	participantID: string;
	utterance: string;
	summary: string; // utterance distillation; "" for filler turns
	date: string; // YYYY-MM-DD
	time: string; // HH:MM:SS
	terminate: "true" | "false";
}

export interface AIHub141Session {
	prevSessionID: string | null;
	prevTimeInfo: { timeNum: string | null; timeUnit: string | null };
	nthSession: string; // "1", "2", "3", "4"
	numberOfUtterances: string;
	numberOfTurns: string;
	sessionID: string; // e.g. "2-00006-1"
	dialog: AIHub141Turn[];
	sessionPersonaSummary: { speaker1: string[]; speaker2: string[] };
	prevAggregatedpersonaSummary: { speaker1: string[]; speaker2: string[] };
}

export interface AIHub141Conversation {
	multisessionID: string;
	topicType: string; // "교육", "직업" 등
	topicTitle: string;
	speaker1Persona: AIHub141PersonaInfo;
	speaker2Persona: AIHub141PersonaInfo;
	sessions: AIHub141Session[]; // length = 2/3/4 depending on session level
	sourceFile: string; // K{n}-{multisessionID}-...-S{n}.json
}

/**
 * Per-conversation recall measurement result.
 *
 * For each session N >= 2, we measure recall of the *prior* aggregated persona
 * summary (`session[N].prevAggregatedpersonaSummary`) given that sessions
 * 1..N-1 have been encoded.
 */
export interface AIHub141RecallResult {
	multisessionID: string;
	topicType: string;
	sessionResults: Array<{
		nthSession: number; // 2, 3, 4
		groundTruthFacts: string[]; // prevAggregatedpersonaSummary.speaker1
		recalledFacts: string[]; // top-K naia recall
		matchedCount: number; // ground truth facts hit by recall
		recallAtK: number; // matchedCount / groundTruthFacts.length
	}>;
}
