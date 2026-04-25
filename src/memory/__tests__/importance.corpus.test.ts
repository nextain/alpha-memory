import { describe, expect, it } from "vitest";
import { scoreImportance } from "../importance.js";
import type { MemoryInput } from "../types.js";

function input(content: string, role: MemoryInput["role"] = "user"): MemoryInput {
	return { content, role, timestamp: 0 };
}

describe("scoreImportance — behavioural corpus (P1: gate removed, scoring preserved)", () => {
	const cases: Array<{ label: string; content: string; role?: MemoryInput["role"]; minUtility: number }> = [
		{ label: "IMPORTANCE marker — always", content: "always remember to check the logs", minUtility: 0.15 },
		{ label: "IMPORTANCE marker — password", content: "my password is hunter2", minUtility: 0.15 },
		{ label: "SURPRISE marker", content: "unexpected result from the API today", minUtility: 0.15 },
		{ label: "Korean IMPORTANCE — 중요", content: "중요한 결정이야", minUtility: 0.15 },
		{ label: "Korean IMPORTANCE — 항상", content: "항상 기억해둬", minUtility: 0.15 },
		{ label: "technical decision", content: "we are using Postgres now", minUtility: 0 },
		{ label: "explicit store request", content: "remember this", minUtility: 0 },
		{ label: "Korean explicit request", content: "이거 기억해줘", minUtility: 0 },
		{ label: "conversational noise", content: "the weather is nice today", minUtility: 0 },
		{ label: "one-word ack", content: "ok", minUtility: 0 },
		{ label: "minimal greeting", content: "hi", minUtility: 0 },
	];

	for (const c of cases) {
		it(`${c.label} → utility >= ${c.minUtility}`, () => {
			const s = scoreImportance(input(c.content, c.role));
			expect(s.utility).toBeGreaterThanOrEqual(c.minUtility);
			expect(s.importance).toBeGreaterThanOrEqual(0);
			expect(s.importance).toBeLessThanOrEqual(1);
		});
	}

	it("marker-driven user has higher utility than marker-free", () => {
		const withMarker = scoreImportance(input("always remember"));
		const without = scoreImportance(input("hello"));
		expect(withMarker.utility).toBeGreaterThan(without.utility);
	});

	it("assistant role scores lower than user role (same content)", () => {
		const user = scoreImportance(input("check this", "user"));
		const assistant = scoreImportance(input("check this", "assistant"));
		expect(user.utility).toBeGreaterThan(assistant.utility);
	});
});
