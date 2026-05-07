/**
 * AI Hub 141 R2.3 multi-session recall scorer.
 *
 * For each conversation:
 *   for nthSession in 1..N:
 *     if nthSession >= 2:
 *       query naia for "what do I know about user"
 *       recall topK facts
 *       match against session.prevAggregatedpersonaSummary.speaker1
 *     encode session.dialog turns into naia
 *     consolidate
 *
 * Matching: substring on key tokens (조사 제외) — robust for KO.
 * Optional: embedding cosine fallback when keyword misses.
 */

import type {
	AIHub141Conversation,
	AIHub141RecallResult,
} from "./types.js";

export interface ScoringHooks {
	/** Reset memory state to clean slate (called at start of each conv). */
	reset(): Promise<void>;
	/** Encode a single dialog turn as an episode. */
	encode(input: { content: string; timestampMs: number }): Promise<void>;
	/** Force consolidation (encode → fact pipeline). */
	consolidate(): Promise<void>;
	/** Recall topK facts about the user. Returns fact contents (strings). */
	recallUserFacts(query: string, topK: number): Promise<string[]>;
}

export interface ScoringOptions {
	topK?: number; // default 20
	/** When true, log per-session detail to console. Default: false. */
	verbose?: boolean;
}

/**
 * Extract substring-matchable tokens from a Korean sentence.
 * Splits on common 조사 / particles and filters short tokens.
 */
export function extractKeyTokens(text: string): string[] {
	// strip leading "나는 / 내가 / 사용자는 " etc.
	const stripped = text
		.replace(/^(나는|내가|나|사용자는|사용자가|사용자|User|user)\s*/, "")
		.replace(/[.!?~]+$/g, "");
	// split on whitespace, common 조사, punctuation
	const raw = stripped.split(
		/[\s,;]+|(?:은|는|이|가|을|를|에서|에게|으로|로|의|와|과|이다|다|있다|있어|이야|야|이고|고)\s*/,
	);
	const out: string[] = [];
	for (const t of raw) {
		const tok = t?.trim();
		if (!tok) continue;
		if (tok.length < 2) continue;
		if (/^(나|내|것|점|중|및|또|또는|그리고|하지만)$/.test(tok)) continue;
		out.push(tok);
	}
	return out;
}

/** Substring match: any keyword of `gt` appears anywhere in any `recalled` fact. */
export function keywordMatch(gt: string, recalled: string[]): boolean {
	const tokens = extractKeyTokens(gt);
	if (tokens.length === 0) return false;
	for (const r of recalled) {
		// hit if at least 1 sufficiently-discriminative token (length >= 2) appears
		for (const tok of tokens) {
			if (r.includes(tok)) return true;
		}
	}
	return false;
}

/** Detect Korean negation markers ("안", "못", "없", "않", "X지 않", "싫"). */
export function hasNegation(text: string): boolean {
	return /(?:안\s|못\s|없|않|싫|아니|지\s*않|지않)/.test(text);
}

/**
 * Polarity-aware keyword match: same as keywordMatch but requires
 * negation polarity to agree between GT and the matched recalled fact.
 * Eliminates false positives like:
 *   GT: "나는 샤인머스캣을 먹지 않는다" ↔ recalled: "사용자 선호 과일: 샤인머스캣"
 */
export function polarityAwareMatch(gt: string, recalled: string[]): boolean {
	const tokens = extractKeyTokens(gt);
	if (tokens.length === 0) return false;
	const gtNeg = hasNegation(gt);
	for (const r of recalled) {
		if (hasNegation(r) !== gtNeg) continue;
		for (const tok of tokens) {
			if (r.includes(tok)) return true;
		}
	}
	return false;
}

/**
 * Hard match: entire GT phrase (after stripping leading "나는"/"내가" and
 * trailing punctuation) appears as substring in some recalled fact.
 *
 * Bypasses topK ceiling effect — measures whether the *full* fact survived
 * encoding+recall, not just a token of it.
 */
export function hardMatch(gt: string, recalled: string[]): boolean {
	const phrase = gt
		.replace(/^(나는|내가|나|사용자는|사용자가|사용자|User|user)\s*/, "")
		.replace(/[.!?~]+\s*$/g, "")
		.trim();
	if (phrase.length < 4) return false;
	return recalled.some((r) => r.includes(phrase));
}

function parseDateTimeMs(date: string, time: string): number {
	// AI Hub 141 timestamps: "2022-09-06" + "14:16:45" — KST. Use plain ISO.
	const iso = `${date}T${time}+09:00`;
	const t = Date.parse(iso);
	return Number.isFinite(t) ? t : Date.now();
}

/**
 * Score a single conversation. Caller's `hooks` must be configured for naia or
 * any other adapter. `reset()` is called once at the start so state is clean.
 */
export async function scoreConversation(
	conv: AIHub141Conversation,
	hooks: ScoringHooks,
	opts: ScoringOptions = {},
): Promise<AIHub141RecallResult> {
	const topK = opts.topK ?? 20;
	const verbose = opts.verbose ?? false;
	const sessionResults: AIHub141RecallResult["sessionResults"] = [];

	await hooks.reset();

	for (let i = 0; i < conv.sessions.length; i++) {
		const session = conv.sessions[i];
		const nth = Number.parseInt(session.nthSession, 10) || i + 1;

		// Measure recall *before* encoding this session (only sessions 2+).
		if (nth >= 2) {
			const groundTruth = session.prevAggregatedpersonaSummary.speaker1 ?? [];
			let matchedCount = 0;
			let recalled: string[] = [];

			if (groundTruth.length > 0) {
				recalled = await hooks.recallUserFacts(
					"사용자에 대해 알고 있는 모든 사실",
					topK,
				);
				for (const gt of groundTruth) {
					if (keywordMatch(gt, recalled)) matchedCount++;
				}
			}

			const recallAtK =
				groundTruth.length > 0 ? matchedCount / groundTruth.length : 0;
			sessionResults.push({
				nthSession: nth,
				groundTruthFacts: groundTruth,
				recalledFacts: recalled,
				matchedCount,
				recallAtK,
			});

			if (verbose) {
				console.log(
					`  [${conv.multisessionID}] S${nth}: ${matchedCount}/${groundTruth.length} (${(recallAtK * 100).toFixed(0)}%)`,
				);
			}
		}

		// Encode session dialog (speaker1 = User, speaker2 = Other).
		for (const turn of session.dialog) {
			const role = turn.speaker === "speaker1" ? "User" : "Other";
			const content = `${role}: ${turn.utterance}`;
			const ts = parseDateTimeMs(turn.date, turn.time);
			await hooks.encode({ content, timestampMs: ts });
		}

		// Force consolidate so facts are extractable on the next session's recall.
		await hooks.consolidate();
	}

	return {
		multisessionID: conv.multisessionID,
		topicType: conv.topicType,
		sessionResults,
	};
}

/** Aggregate recall@k across multiple conversations. */
export function aggregateResults(
	results: AIHub141RecallResult[],
): {
	totalSessions: number;
	totalGroundTruth: number;
	totalMatched: number;
	microRecallAtK: number; // matched / groundTruth (per-fact)
	macroRecallAtK: number; // mean of per-session recall@k
	bySession: Record<number, { sessions: number; recallAtK: number }>;
} {
	let totalGT = 0;
	let totalM = 0;
	let totalSessions = 0;
	let macroSum = 0;
	const bySession: Record<number, { sessions: number; recallAtKSum: number }> = {};

	for (const r of results) {
		for (const s of r.sessionResults) {
			totalSessions++;
			totalGT += s.groundTruthFacts.length;
			totalM += s.matchedCount;
			macroSum += s.recallAtK;
			const bucket = bySession[s.nthSession] ?? { sessions: 0, recallAtKSum: 0 };
			bucket.sessions++;
			bucket.recallAtKSum += s.recallAtK;
			bySession[s.nthSession] = bucket;
		}
	}

	const bySessionOut: Record<number, { sessions: number; recallAtK: number }> =
		{};
	for (const [k, v] of Object.entries(bySession)) {
		bySessionOut[Number(k)] = {
			sessions: v.sessions,
			recallAtK: v.sessions > 0 ? v.recallAtKSum / v.sessions : 0,
		};
	}

	return {
		totalSessions,
		totalGroundTruth: totalGT,
		totalMatched: totalM,
		microRecallAtK: totalGT > 0 ? totalM / totalGT : 0,
		macroRecallAtK: totalSessions > 0 ? macroSum / totalSessions : 0,
		bySession: bySessionOut,
	};
}
