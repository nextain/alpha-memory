/**
 * Phase D shared Korean tokenization fixture.
 *
 * Consumed by BOTH `contentTokens` (consolidation dedup in index.ts)
 * AND `tokenizeSimple` (reconsolidation substring overlap) so that
 * particle-stripping behaviour cannot silently diverge between the two.
 *
 * Authored during D.0.5 pre-flight per phase-d plan §2 + R12 Q6.
 *
 * Each fixture row: [rawInput, expectedTokens]
 * - rawInput: raw content as a user or LLM would write it
 * - expectedTokens: the token set after particle stripping + short-filter
 *
 * Common Korean particles stripped: 을/를/은/는/이/가/로/에/에서/의/과/와/도/만/까지/부터/에게/한테
 * Short-token filter: length < 3 dropped (matching current reconsolidation.ts :99)
 */

export interface TokenizationFixture {
	input: string;
	expected: string[];
	note?: string;
}

export const KOREAN_TOKENIZATION_FIXTURES: TokenizationFixture[] = [
	// ── Bare nouns (no particle) ─────────────────────────────────────────
	{
		input: "Neovim 에디터 사용",
		expected: ["neovim", "에디터"],
		note: "baseline: no particles. '사용' (len 2) dropped by < 3 short-filter",
	},

	// ── Particle-attached forms — same stem, different particle ──────────
	{
		input: "에디터를 사용해",
		expected: ["에디터", "사용해"],
		note: "을/를 particle stripped; '사용해' is a verb form, kept",
	},
	{
		input: "에디터로 바꿨어",
		expected: ["에디터", "바꿨어"],
		note: "로 particle stripped; '바꿨어' kept (also a negation marker)",
	},
	{
		input: "Neovim과 Vim",
		expected: ["neovim", "vim"],
		note: "과 particle stripped",
	},

	// ── Cross-fixture overlap test (matches RC-16c) ──────────────────────
	{
		input: "Luke는 Neovim 에디터를 사용해",
		expected: ["luke", "neovim", "에디터", "사용해"],
		note: "는 and 를 stripped; Latin letters lowercased",
	},

	// ── Short-token filter (< 3 chars dropped) ───────────────────────────
	{
		input: "이 또한 지나가리",
		expected: ["지나가리"],
		note: "'이'(1) and '또한'(2) both drop under < 3 filter; '지나가리'(4) kept",
	},

	// ── Mixed Latin + Korean ─────────────────────────────────────────────
	{
		input: "TypeScript를 배운다",
		expected: ["typescript", "배운다"],
		note: "Latin lowered; 를 stripped",
	},

	// ── Preserve tokens that END with non-particle syllables ─────────────
	{
		input: "사용자",
		expected: ["사용자"],
		note: "'자' is a suffix, not a particle — not stripped",
	},
	{
		input: "프로그래머",
		expected: ["프로그래머"],
		note: "no particles to strip; kept whole",
	},

	// ── Punctuation / mixed whitespace ───────────────────────────────────
	{
		input: "안녕, 세상!",
		expected: [],
		note: "punctuation stripped via \\p{L}\\p{N} regex; both tokens < 3 chars, all dropped",
	},
];

/**
 * Expected contract (pin as a test when primitives land):
 *
 * 1. Lowercase all Latin.
 * 2. Replace non-letter/non-number/non-space with spaces.
 * 3. Strip trailing Korean particles from each token IF the stripped stem
 *    is length >= 2 AND the particle is in the allowed particle list.
 * 4. Filter tokens with final length < 3 (matches current reconsolidation.ts).
 * 5. Return Set (dedup of identical tokens).
 *
 * The current `tokenizeSimple` in `reconsolidation.ts:189-195` does 1+2+4 only.
 * The current `contentTokens` in `index.ts:134-136` returns `new Set()` (stub).
 *
 * Phase D implements step 3 (particle stripping) in BOTH locations OR extracts
 * a shared helper. Either is acceptable; the fixture above pins behaviour
 * regardless of structure.
 */

// Fixture re-exports the production list so tests cannot drift from impl.
export { ALLOWED_KOREAN_PARTICLES } from "../../index.js";
