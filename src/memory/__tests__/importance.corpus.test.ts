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

	// ── D.3 collateral: high-signal cases no longer stored (IM-12 coincidence
	//    gone). These become NEW GAPs — expected stays true; fix deferred to
	//    D.5 (LLM/entity extractor). See phase-d-3-outline.md §2.
	// ──────────────────────────────────────────────────────────────────────
	{
		label: "[NEW GAP D.5] technical decision — no marker detection",
		content: "we are using Postgres now",
		expected: true,
		current: false,
		notes:
			"D.3 removed IM-12 coincidence → no longer stores. D.5 must detect " +
			"entity+state ('using Postgres') without keyword markers.",
	},
	{
		label: "[NEW GAP D.5] explicit store request — no marker",
		content: "remember this",
		expected: true,
		current: false,
		notes: "'remember' not in markers. D.5 intent classifier needed.",
	},
	{
		label: "[NEW GAP D.5] Korean explicit request — 기억해",
		content: "이거 기억해줘",
		expected: true,
		current: false,
		notes: "Korean '기억해' not in markers. D.5 scope.",
	},
	{
		label: "[NEW GAP D.5] emotion contextual — negation inside positive",
		content: "don't hate to say I love this",
		expected: true,
		current: false,
		notes:
			"'hate' hits NEGATIVE_EMOTION, 'love' hits POSITIVE_EMOTION → emotion=0.5, " +
			"arousal=0, utility=0.15 → no longer stores post-D.3. D.5 sentiment ctx.",
	},

	// ── Old GAPs resolved by D.3 (kept as regular passes — current now matches expected) ──
	{
		label: "conversational noise — correctly dropped post-D.3",
		content: "the weather is nice today",
		expected: false,
		current: false,
	},
	{
		label: "one-word ack — correctly dropped post-D.3",
		content: "ok",
		expected: false,
		current: false,
	},
	{
		label: "minimal greeting — correctly dropped post-D.3",
		content: "hi",
		expected: false,
		current: false,
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
	it("GAP count tracks Phase D.5+ behavioural scope", () => {
		const gaps = corpus.filter((c) => c.expected !== c.current);
		// Post-D.3: old 3 GAPs resolved (weather/ok/hi correctly drop); 4 new
		// GAPs surfaced (technical decision / remember / 기억해 / don't hate)
		// that require D.5 intent+entity extractor to satisfy.
		expect(gaps.length).toBe(4);
	});
});
