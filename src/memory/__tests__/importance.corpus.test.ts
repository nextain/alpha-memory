import { describe, expect, it } from "vitest";
import { scoreImportance, shouldStore } from "../importance.js";
import type { MemoryInput } from "../types.js";

/**
 * Phase A.3 — behavioural corpus (R7 Q6 recommendation).
 *
 * Hand-labelled scenarios that matter for real conversational memory.
 * Complements `importance.test.ts` (which pins mechanics) with a small
 * deterministic corpus (each case is a concrete assertion — no
 * statistical pass-rate).
 *
 * Observation surfaced by this corpus: IM-12 makes every user-role
 * marker-free message store at exactly utility=0.15. Many cases thus
 * "work" by coincidence. The GAPs are where this coincidence produces
 * a clearly wrong outcome (noise stored when it should be dropped),
 * AND where a proper Phase D scorer would differentiate.
 *
 * Each case pins the current shouldStore outcome. Cases where the
 * expected (Phase D contract) differs from current are paired with
 * an `it.fails` — they flip when Phase D lands.
 */

function input(content: string, role: MemoryInput["role"] = "user"): MemoryInput {
	return { content, role, timestamp: 0, encodingContext: {} };
}

interface CorpusCase {
	label: string;
	content: string;
	role?: MemoryInput["role"];
	expected: boolean; // intended (Phase D contract)
	current: boolean; // what the current heuristic returns
	notes?: string;
}

const corpus: CorpusCase[] = [
	// ── High-signal with explicit markers (currently + always stored) ───
	{
		label: "IMPORTANCE marker — always remember",
		content: "always remember to check the logs",
		expected: true,
		current: true,
	},
	{
		label: "IMPORTANCE marker — password",
		content: "my password is hunter2",
		expected: true,
		current: true,
	},
	{
		label: "SURPRISE — unexpected behaviour",
		content: "unexpected result from the API today",
		expected: true,
		current: true,
	},
	{
		label: "Korean IMPORTANCE — 중요",
		content: "중요한 결정이야",
		expected: true,
		current: true,
	},
	{
		label: "Korean IMPORTANCE — 항상",
		content: "항상 기억해둬",
		expected: true,
		current: true,
	},

	// ── Accidentally stored via IM-12 (high-signal but no matching marker)
	// ── These ARE high-signal (expected true). Current stores them, but for
	//    the wrong reason (boundary coincidence). Not a GAP on outcome.
	// ──────────────────────────────────────────────────────────────────────
	{
		label: "technical decision (no marker, stored by IM-12)",
		content: "we are using Postgres now",
		expected: true,
		current: true,
		notes:
			"No IMPORTANCE marker matches 'using'/'now'. Stores via IM-12 boundary. " +
			"Phase D should store this with high signal, not boundary luck.",
	},
	{
		label: "explicit store request (no marker, stored by IM-12)",
		content: "remember this",
		expected: true,
		current: true,
		notes:
			"Canonical request. 'remember' is NOT in IMPORTANCE_MARKERS. Stores " +
			"via IM-12 for wrong reason. Phase D contract: detect 'remember'/'save'/" +
			"'write down' explicitly.",
	},
	{
		label: "Korean explicit request — 기억해",
		content: "이거 기억해줘",
		expected: true,
		current: true,
		notes: "Korean '기억해' not in markers. Same IM-12 coincidence.",
	},
	{
		label: "emotion contextual — negation inside positive",
		content: "don't hate to say I love this",
		expected: true,
		current: true,
		notes:
			"'hate' hits NEGATIVE_EMOTION, 'love' hits POSITIVE_EMOTION → emotion=0.5, " +
			"arousal=0. Current stores via IM-12. Phase D should detect overall " +
			"positive sentiment (1 pos in negated 'don't hate').",
	},

	// ── GAPS: noise stored that should be dropped ───────────────────────
	{
		label: "GAP — conversational noise stored by IM-12",
		content: "the weather is nice today",
		expected: false,
		current: true,
	},
	{
		label: "GAP — one-word ack stored by IM-12",
		content: "ok",
		expected: false,
		current: true,
	},
	{
		label: "GAP — minimal greeting stored by IM-12",
		content: "hi",
		expected: false,
		current: true,
	},

	// ── Correctly dropped (low role weight + no markers) ─────────────────
	{
		label: "tool output correctly dropped",
		content: "Result: ok",
		role: "tool",
		expected: false,
		current: false,
	},
	{
		label: "assistant filler correctly dropped",
		content: "I'm here to help you",
		role: "assistant",
		expected: false,
		current: false,
	},
	{
		label: "assistant marker-less response",
		content: "Sure, I can do that.",
		role: "assistant",
		expected: false,
		current: false,
		notes:
			"Assistant role (0.1 weight) × 0.5 = 0.05 < 0.15 threshold → dropped. " +
			"Correct behaviour.",
	},
];

describe("scoreImportance — behavioural corpus (R7, real-world scenarios)", () => {
	for (const c of corpus) {
		const marker = c.expected === c.current ? "current OK" : "GAP";
		const label = `[${marker}] ${c.label}`;

		it(`${label} — current: shouldStore === ${c.current}`, () => {
			const s = scoreImportance(input(c.content, c.role ?? "user"));
			expect(shouldStore(s)).toBe(c.current);
		});

		if (c.expected !== c.current) {
			it.fails(
				`${label} — Phase D contract: shouldStore === ${c.expected}`,
				() => {
					const s = scoreImportance(input(c.content, c.role ?? "user"));
					expect(shouldStore(s)).toBe(c.expected);
				},
			);
		}
	}
});

describe("corpus summary (informational)", () => {
	it("GAP count tracks Phase D behavioural scope", () => {
		const gaps = corpus.filter((c) => c.expected !== c.current);
		// Current state: 3 GAPs (weather-noise, "ok", "hi"). All are
		// IM-12-induced false positives — user-role marker-free content
		// storing at the 0.15 coincidence.
		expect(gaps.length).toBe(3);
	});
});
