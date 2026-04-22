import { describe, expect, it } from "vitest";
import {
	checkContradiction,
	findContradictions,
} from "../reconsolidation.js";
import type { Fact } from "../types.js";

/**
 * Phase A.5 — `reconsolidation.ts` unit tests.
 *
 * Specs mirror `phase-a-test-plan.md` v3 §3 A.5 (RC-01..RC-18).
 * Round 4 cross-review (analysis profile) drove the effect-based rewrite
 * of RC-08/RC-13 and added RC-14..RC-18.
 *
 * Known B-BUG: RC-04 (value-replacement without negation) is pinned as
 * `describe.fails` holding the 6 Phase-D-contract invariants, paired with
 * a "current state" regression alarm that goes red the instant Phase D
 * ships, forcing coordinated test cleanup.
 */

function makeFact(overrides: Partial<Fact> = {}): Fact {
	return {
		id: "fact-1",
		content: "test fact",
		entities: [],
		topics: [],
		createdAt: 0,
		updatedAt: 0,
		importance: 0.5,
		recallCount: 0,
		lastAccessed: 0,
		strength: 0.5,
		sourceEpisodes: [],
		...overrides,
	};
}

// ─── RC-01 (C-GUARD) identity ───────────────────────────────────────────

describe("checkContradiction — identity / C-GUARD", () => {
	it("RC-01 identical content returns keep", () => {
		const fact = makeFact({
			content: "Luke prefers TypeScript",
			entities: ["Luke"],
		});
		const result = checkContradiction(fact, fact.content);
		expect(result.action).toBe("keep");
	});
});

// ─── RC-02 unrelated facts ──────────────────────────────────────────────

describe("checkContradiction — unrelated facts", () => {
	it("RC-02 disjoint entities and tokens return keep with 'unrelated' reason", () => {
		const fact = makeFact({
			content: "Luke prefers TypeScript",
			entities: ["Luke"],
		});
		const result = checkContradiction(fact, "penguins are flightless birds");
		expect(result.action).toBe("keep");
		expect(result.reason.toLowerCase()).toContain("unrelated");
	});
});

// ─── RC-03 direct negation ──────────────────────────────────────────────

describe("checkContradiction — direct negation", () => {
	it("RC-03 negation with shared entity triggers update", () => {
		const fact = makeFact({
			content: "Luke uses Vim editor",
			entities: ["Luke"],
		});
		const result = checkContradiction(
			fact,
			"Luke does not use Vim anymore, switched to Cursor",
		);
		expect(result.action).toBe("update");
		expect(result.updatedContent).toBe(
			"Luke does not use Vim anymore, switched to Cursor",
		);
	});
});

// ─── RC-04 + RC-05 — B-BUG: value-replacement without negation ──────────
// Phase D contract encoded as describe.fails (6 invariants). Paired "pin"
// describe records current behaviour (keep) so it goes red when Phase D
// flips the semantic behaviour, forcing both blocks to be cleaned up.

describe("RC-04 Phase D contract (6 invariants) — all .fails until Phase D", () => {
	const factSeoul = makeFact({
		content: "Luke lives in Seoul",
		entities: ["Luke"],
	});

	it.fails("invariant 1 — value replacement returns update", () => {
		const r = checkContradiction(factSeoul, "Luke lives in Tokyo");
		expect(r.action).toBe("update");
	});

	it.fails(
		"invariant 2 — updatedContent is the new info verbatim (new value wins, no merge)",
		() => {
			const r = checkContradiction(factSeoul, "Luke lives in Tokyo");
			expect(r.updatedContent).toBe("Luke lives in Tokyo");
		},
	);

	// Invariant 3 removed: "reason vocabulary" contract is too loose to pin
	// with a regex (R4 reviewer suggested keeping but our current "No
	// contradiction detected" accidentally matches any `contradict`-family
	// regex, making .fails non-deterministic). Phase D can define its own
	// reason string; the behavioural invariants 1, 2, 4, 6 are sufficient.

	it.fails(
		"invariant 4 — findContradictions reports exactly 1 match (symmetric)",
		() => {
			const matches = findContradictions([factSeoul], "Luke lives in Tokyo");
			expect(matches).toHaveLength(1);
		},
	);

	// Invariants 5/6 already hold in current source — not .fails. But group
	// them here so Phase D fix can see the full contract in one place.
	it("invariant 5 — different entity does NOT contradict (no over-correction)", () => {
		const r = checkContradiction(factSeoul, "Anna lives in Tokyo");
		// Currently returns "keep" (negative case already correct).
		expect(r.action).toBe("keep");
	});

	it.fails(
		"invariant 6 — entity preserved in downstream linking (fails today: findContradictions returns empty)",
		() => {
			const matches = findContradictions([factSeoul], "Luke lives in Tokyo");
			expect(matches[0]?.fact.entities).toContain("Luke");
		},
	);
});

describe("RC-04 pin — current (buggy) behaviour", () => {
	const factSeoul = makeFact({
		content: "Luke lives in Seoul",
		entities: ["Luke"],
	});

	it("[B-BUG RC-04 pin] currently returns keep — remove when Phase D fix lands", () => {
		const r = checkContradiction(factSeoul, "Luke lives in Tokyo");
		expect(r.action).toBe("keep");
	});

	it("[B-BUG RC-05 pin] temporal variant — currently keep (same root cause as RC-04)", () => {
		const factPast = makeFact({
			content: "Luke lived in Seoul in 2020",
			entities: ["Luke"],
		});
		const r = checkContradiction(factPast, "Luke lives in Tokyo now");
		// R5 reviewer: this must pin the concrete current value, not a
		// "either-or" tautology. Verified at runtime: current returns "keep".
		expect(r.action).toBe("keep");
	});
});

// ─── RC-06 findContradictions shape ─────────────────────────────────────

describe("findContradictions — shape", () => {
	it("RC-06 returns {fact, result}[] filtered by action !== keep, preserves input order", () => {
		const factA = makeFact({
			id: "a",
			content: "Luke uses Vim",
			entities: ["Luke"],
		});
		const factB = makeFact({
			id: "b",
			content: "sky is blue",
			entities: [],
		});
		const factC = makeFact({
			id: "c",
			content: "Anna prefers Python",
			entities: ["Anna"],
		});
		const matches = findContradictions(
			[factA, factB, factC],
			"Luke does not use Vim anymore",
		);
		// Only factA is a contradiction
		expect(matches).toHaveLength(1);
		expect(matches[0]?.fact.id).toBe("a");
		expect(matches[0]?.result.action).not.toBe("keep");
		expect(matches[0]?.result).toHaveProperty("reason");
	});

	it("RC-07 empty facts → empty array", () => {
		expect(findContradictions([], "anything at all")).toEqual([]);
	});
});

// ─── RC-08 Korean negation (effect-based, R4 rewrite) ───────────────────

describe("checkContradiction — Korean negation (effect-based)", () => {
	it("RC-08a Korean fact + new info with 않 pattern → update", () => {
		// Note: Q2#3 discovery — "vim"(3 chars) vs "neovim"(6) fails the 60%
		// substring rule (3/6 = 0.5 < 0.6). Using entity match activates the
		// sharedEntities path directly, so this test exercises the Korean
		// negation path (not the token-substring path).
		const fact = makeFact({
			content: "Vim 에디터 사용",
			entities: ["Vim"],
			topics: ["editor"],
		});
		const r = checkContradiction(fact, "이제 Vim 쓰지 않아요");
		expect(r.action).toBe("update");
	});

	it("RC-08b Korean 바꿨 pattern with content overlap → update", () => {
		const fact = makeFact({
			content: "Luke는 Neovim 에디터를 사용해",
			entities: ["Luke"],
		});
		const r = checkContradiction(fact, "Luke는 에디터를 Cursor로 바꿨어");
		expect(r.action).toBe("update");
	});

	it.fails(
		"[B-BUG RC-08c] Korean standalone 안 negator is NOT in NEGATION_PATTERNS — currently undetected",
		() => {
			// "안" (standalone, not "않") is a common Korean negator but not
			// listed at reconsolidation.ts:44-51. Phase D should extend the
			// pattern list to include 안 (as /\s안\s/ or similar to avoid
			// collision with entity names containing "안").
			const fact = makeFact({
				content: "Neovim 에디터 사용",
				entities: [],
			});
			const r = checkContradiction(fact, "이제 Vim 안 써요");
			expect(r.action).toBe("update");
		},
	);

	it("[B-BUG RC-08c pin] current behaviour: 안 negator yields keep", () => {
		const fact = makeFact({
			content: "Neovim 에디터 사용",
			entities: [],
		});
		const r = checkContradiction(fact, "이제 Vim 안 써요");
		expect(r.action).toBe("keep");
	});
});

// ─── RC-10 purity ───────────────────────────────────────────────────────

describe("checkContradiction — purity", () => {
	it("RC-10 existingFact is not mutated; deep-freeze invariant", () => {
		const fact = Object.freeze(
			makeFact({
				content: "Luke uses Vim",
				entities: Object.freeze(["Luke"]) as unknown as string[],
				topics: Object.freeze([]) as unknown as string[],
				sourceEpisodes: Object.freeze([]) as unknown as string[],
			}),
		);
		const snapshot = JSON.stringify(fact);
		checkContradiction(fact, "Luke no longer uses Vim");
		expect(JSON.stringify(fact)).toBe(snapshot);
	});
});

// ─── RC-11 flag_contradiction dead code ─────────────────────────────────

describe("ReconsolidationResult — flag_contradiction declared but unreached", () => {
	it("RC-11 (C-GUARD) current source never returns flag_contradiction for a diverse input set", () => {
		const fact = makeFact({
			content: "Luke uses Vim",
			entities: ["Luke"],
		});
		const inputs = [
			"Luke uses Vim",
			"Luke does not use Vim",
			"Anna uses Vim",
			"unrelated sentence",
			"Luke는 Vim을 안 써",
			"Luke switched to Cursor",
			"Luke lives in Tokyo",
		];
		for (const inp of inputs) {
			const r = checkContradiction(fact, inp);
			expect(r.action).not.toBe("flag_contradiction");
		}
	});
});

// ─── RC-12 empty entities + no overlap ──────────────────────────────────

describe("checkContradiction — no shared context", () => {
	it("RC-12 empty entities + disjoint content → keep", () => {
		const fact = makeFact({
			content: "sky is blue",
			entities: [],
		});
		const r = checkContradiction(fact, "oranges taste citrusy");
		expect(r.action).toBe("keep");
	});
});

// ─── RC-13 state-verb + negation + sub-threshold overlap ────────────────

describe("checkContradiction — state-verb branch (effect-based)", () => {
	it("RC-13 state-verb fact + negation + sub-threshold overlap → update via state-change branch", () => {
		// State-verb "prefer" in existing; new info has negation ("no longer")
		// but HIGH total token count with minimal overlap so overlapRatio ≤ 0.3.
		const fact = makeFact({
			content: "Luke prefers morning routines",
			entities: ["Luke"],
		});
		// 10 new tokens, 1 content overlap ("morning") → ratio ≤ 0.1.
		// But "Luke" entity match triggers sharedEntities path. Negation
		// present. overlapRatio < 0.3 → :147 fails; :155 (state verb + negation) fires.
		const r = checkContradiction(
			fact,
			"Luke no longer wakes up at dawn for early morning activities",
		);
		expect(r.action).toBe("update");
		expect(r.reason).toMatch(/state change/i);
	});
});

// ─── RC-14 numeric-tunable pins (C-GUARD via effect) ───────────────────

describe("reconsolidation — numeric tunable guards (RC-14 C-GUARD)", () => {
	// These tests fail if the four literals at :108, :115, :114, :147 drift.

	it("RC-14a overlap threshold 0.3 (with negation): ratio ≤ 0.3 → keep; ratio > 0.3 → update", () => {
		// R5 reviewer: previous version did not isolate the 0.3 literal because
		// it had no negation — branch :147 was unreachable. Now use negation in
		// both inputs so the 0.3 comparison is the only variable.
		const fact = makeFact({
			content: "alpha beta gamma delta epsilon zeta",
			entities: [],
		});

		// ratio = 2/8 = 0.25 (strictly below 0.3). hasNegation=true via "not".
		// Expected: :147 (hasNegation && overlapRatio > 0.3) is false; no state
		// verb → default keep.
		const low = checkContradiction(
			fact,
			"alpha beta not foo bar baz qux quux",
		);
		expect(low.action).toBe("keep");

		// ratio = 3/8 = 0.375 (above 0.3). hasNegation=true → :147 fires.
		const high = checkContradiction(
			fact,
			"alpha beta gamma not foo bar baz qux",
		);
		expect(high.action).toBe("update");
	});

	it("RC-14b substring ratio 0.6: token 'port' NOT counted as match for 'important' (short/long ratio 4/9 ≈ 0.44 < 0.6)", () => {
		const fact = makeFact({ content: "this is important note", entities: [] });
		// "port" is 4 chars, "important" is 9 chars → 4/9 ≈ 0.44 < 0.6 → no match
		const r = checkContradiction(fact, "port harbor ship dock");
		expect(r.action).toBe("keep");
	});

	it("RC-14c minOverlap fraction 0.15: at n=14, 1 overlap is BELOW minOverlap(=2) → unrelated (not update)", () => {
		// R5 reviewer: the previous version was insensitive to the 0.15 literal
		// because at n=6 the minOverlap was always 1. Use n=14 where floor(14*0.15)=2:
		// if the literal drifts to 0.10, minOverlap becomes max(1, min(2, floor(14*0.10)=1))=1,
		// and a 1-overlap new info would then cross minOverlap — changing the
		// test outcome. That's the sensitivity we want.
		const fact = makeFact({
			content:
				"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi",
			entities: [],
		});
		// 14-token new info, 1 content overlap ("alpha"). With 0.15 literal:
		// minOverlap=2, so 1 overlap is insufficient → contentOverlap=false →
		// "unrelated" path.
		const r = checkContradiction(
			fact,
			"alpha foo bar baz qux quux corge grault garply waldo fred plugh xyzzy thud",
		);
		expect(r.action).toBe("keep");
		expect(r.reason.toLowerCase()).toContain("unrelated");
		// If 0.15 drifts to 0.10: minOverlap=1, reason changes; test goes red.
	});

	it("RC-14d minOverlap upper bound 2: at n=14 tokens, min(2, floor(14*0.15=2)) = 2", () => {
		// At n=14: floor(14*0.15) = 2, so minOverlap = max(1, min(2, 2)) = 2.
		// 1 overlap is insufficient — triggers "unrelated" path.
		const fact = makeFact({
			content: "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi",
			entities: [],
		});
		// 14 tokens, 1 overlap ("alpha"):
		const r = checkContradiction(
			fact,
			"alpha foo bar baz qux quux corge grault garply waldo fred plugh xyzzy thud",
		);
		expect(r.action).toBe("keep");
		expect(r.reason.toLowerCase()).toContain("unrelated");
	});
});

// ─── RC-15 short-content false positive ─────────────────────────────────

describe("checkContradiction — short-content FP guard (RC-15)", () => {
	// R5 reviewer: plan promised n ∈ {1, 6, 7, 14}. Sweep all four.
	const fact = makeFact({
		content:
			"alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi",
		entities: [],
	});

	it("RC-15a n=1 new token, 1 overlap (only entity-level content) → keep (no negation, no state verb)", () => {
		const r = checkContradiction(fact, "alpha");
		// 1 new token, overlap=1, minOverlap=max(1,min(2,floor(1*0.15)=0))=1.
		// hasContentOverlap=true → bypasses "unrelated". No negation/state verb → keep.
		expect(r.action).toBe("keep");
	});

	it("RC-15b n=6 new tokens, 1 overlap → keep (minOverlap=1, content matches)", () => {
		const r = checkContradiction(fact, "alpha foo bar baz qux quux");
		expect(r.action).toBe("keep");
	});

	it("RC-15c n=7 new tokens, 1 overlap → keep (minOverlap still 1 at n=7)", () => {
		const r = checkContradiction(
			fact,
			"alpha foo bar baz qux quux corge",
		);
		expect(r.action).toBe("keep");
	});

	it("RC-15d n=14 new tokens, 1 overlap → keep + 'unrelated' (minOverlap=2, 1 insufficient)", () => {
		const r = checkContradiction(
			fact,
			"alpha foo bar baz qux quux corge grault garply waldo fred plugh xyzzy thud",
		);
		expect(r.action).toBe("keep");
		expect(r.reason.toLowerCase()).toContain("unrelated");
	});
});

// ─── RC-16 Korean particle attachment (load-bearing comment at :91-93) ─

describe("checkContradiction — Korean particle attachment (RC-16)", () => {
	it("RC-16a 'Cursor로 바꿨어' triggers update (via 바꿨 negation — end-to-end smoke)", () => {
		const fact = makeFact({
			content: "Neovim 에디터 사용",
			entities: [],
		});
		const r = checkContradiction(fact, "에디터 Cursor로 바꿨어");
		expect(r.action).toBe("update");
	});

	it(
		"[B-BUG RC-16b pin] particle-different tokens ('를' vs '로') currently NOT overlap-matched — substring rule fails at same-length boundary",
		() => {
			// R5 drove us here: RC-16a actually tested 바꿨 negation, not particle
			// handling. This test isolates particle behaviour. Both tokens are
			// length 4 — source at :106 computes shorter = nt (when et.length
			// is not < nt.length). Then longer.includes(shorter) compares full
			// 4-char strings, which differ only in the particle. → no match.
			// This is the 2nd algorithmic concern raised by R4 Q2#3: "tokenizeSimple
			// leaves Korean particles attached". Phase D should lemmatize particles.
			const fact = makeFact({
				content: "Neovim 에디터를 사용해서 편집",
				entities: [],
			});
			const r = checkContradiction(fact, "에디터로 많은 작업");
			// Current (buggy) behaviour: defaults to "unrelated" because overlap=0.
			expect(r.action).toBe("keep");
			expect(r.reason.toLowerCase()).toContain("unrelated");
		},
	);

	it.fails(
		"[B-BUG RC-16c Phase D contract] particle-different tokens SHOULD be recognized as overlapping via lemmatization",
		() => {
			// When Phase D implements proper particle stripping (or lemmatization),
			// this .fails flips to green. The pin above goes red, signalling cleanup.
			const fact = makeFact({
				content: "Neovim 에디터를 사용해서 편집",
				entities: [],
			});
			const r = checkContradiction(fact, "에디터로 많은 작업");
			expect(r.reason.toLowerCase()).not.toContain("unrelated");
		},
	);
});

// ─── RC-17 branch-order precedence ─────────────────────────────────────

describe("checkContradiction — branch-order precedence (RC-17)", () => {
	it("RC-17 when :147 and :155 both match, :147 wins (reason contains 'Contradiction detected')", () => {
		// State-verb fact + negation + HIGH overlap → both branches match.
		const fact = makeFact({
			content: "Luke prefers Vim editor for work",
			entities: ["Luke"],
		});
		// Negation + high overlap:
		const r = checkContradiction(
			fact,
			"Luke does not prefer Vim editor for work",
		);
		expect(r.action).toBe("update");
		expect(r.reason).toMatch(/Contradiction detected/);
		expect(r.reason).not.toMatch(/State change detected/);
	});
});

// ─── RC-18 entity-only match insufficient ──────────────────────────────

describe("checkContradiction — entity-only match (RC-18)", () => {
	it("RC-18 new info is only the entity name, no negation, no substantive overlap → keep", () => {
		const fact = makeFact({
			content: "Luke prefers the Cursor editor for TypeScript",
			entities: ["Luke"],
		});
		// R5 reviewer: assertion must match the spec ("does NOT trigger update").
		// Tautology pins are actively harmful — they mask spec violations.
		// Verified at runtime: sharedEntities=[Luke], no negation, no state-verb
		// + negation match; defaults to keep.
		const r = checkContradiction(fact, "Luke");
		expect(r.action).toBe("keep");
	});
});
