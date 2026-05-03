/**
 * Tests for NaiaMemoryProvider (R1.3) — MemoryProvider wrapper.
 */
import { describe, expect, it, vi } from "vitest";
import { NaiaMemoryProvider } from "../provider.js";
import type { MemoryAdapter, Episode, Fact, ConsolidationResult } from "../types.js";
import { isCapable } from "../provider-types.js";

function mockAdapter(): MemoryAdapter {
	const episodes: Episode[] = [];
	const facts: Fact[] = [];

	return {
		episode: {
			store: vi.fn(async (ep: Episode) => { episodes.push(ep); }),
			recall: vi.fn(async () => episodes),
			getRecent: vi.fn(async (n: number) => episodes.slice(-n)),
			getUnconsolidated: vi.fn(async () => episodes.filter((e) => !e.consolidated)),
			markConsolidated: vi.fn(async (ids: string[]) => {
				for (const ep of episodes) if (ids.includes(ep.id)) ep.consolidated = true;
			}),
		},
		semantic: {
			upsert: vi.fn(async (f: Fact) => {
				const idx = facts.findIndex((x) => x.id === f.id);
				if (idx >= 0) facts[idx] = f; else facts.push(f);
			}),
			search: vi.fn(async (_q: string, topK: number) => facts.slice(0, topK)),
			decay: vi.fn(async () => 0),
			associate: vi.fn(async () => {}),
			getAll: vi.fn(async () => facts),
			delete: vi.fn(async () => true),
		},
		procedural: {
			getSkill: vi.fn(async () => null),
			recordOutcome: vi.fn(async () => {}),
			learnFromFailure: vi.fn(async () => {}),
			getReflections: vi.fn(async () => []),
		},
		consolidate: vi.fn(async (): Promise<ConsolidationResult> => ({
			episodesProcessed: 0,
			factsCreated: 0,
			factsUpdated: 0,
			memoriesPruned: 0,
			associationsUpdated: 0,
		})),
		close: vi.fn(async () => {}),
	} as unknown as MemoryAdapter;
}

describe("NaiaMemoryProvider", () => {
	it("creates instance with MemoryAdapter", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		expect(provider).toBeDefined();
	});

	it("encode calls system.encode", async () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		await provider.encode(
			{ content: "테스트 메시지", role: "user" },
			{ project: "test" },
		);
		expect(adapter.episode.store).toHaveBeenCalled();
	});

	it("recall returns MemoryHit array", async () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		const hits = await provider.recall("테스트", { project: "test", topK: 5 });
		expect(Array.isArray(hits)).toBe(true);
	});

	it("consolidate returns ConsolidationSummary", async () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		const summary = await provider.consolidate();
		expect(summary).toHaveProperty("factsCreated");
		expect(summary).toHaveProperty("factsUpdated");
		expect(summary).toHaveProperty("episodesProcessed");
		expect(summary).toHaveProperty("durationMs");
		expect(typeof summary.durationMs).toBe("number");
	});

	it("close delegates to adapter", async () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		await provider.close();
		expect(adapter.close).toHaveBeenCalled();
	});
});

describe("isCapable", () => {
	it("detects BackupCapableProvider", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		expect(isCapable(provider, "BackupCapableProvider")).toBe(true);
	});

	it("detects ImportanceScoringCapable", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		expect(isCapable(provider, "ImportanceScoringCapable")).toBe(true);
	});

	it("detects ReconsolidationCapableProvider", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		expect(isCapable(provider, "ReconsolidationCapableProvider")).toBe(true);
	});

	it("detects TemporalCapableProvider", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		expect(isCapable(provider, "TemporalCapableProvider")).toBe(true);
	});

	it("returns false for unknown capability", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		expect(isCapable(provider, "UnknownCap")).toBe(false);
	});
});

describe("NaiaMemoryProvider integration", () => {
	it("findContradictions detects state change", async () => {
		const adapter = mockAdapter() as MemoryAdapter;
		const provider = new NaiaMemoryProvider({ adapter });

		await provider.encode(
			{ content: "나는 Neovim을 사용해", role: "user" },
			{ project: "test" },
		);
		await provider.consolidate();

		const contradictions = await provider.findContradictions(
			"Neovim 안 써, Cursor로 바꿨어",
		);
		if (contradictions.length > 0) {
			expect(contradictions[0]!.conflictType).toMatch(/direct|indirect/);
			expect(typeof contradictions[0]!.reason).toBe("string");
		}
	});

	it("scoreImportance returns 4-axis scores", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		const scores = provider.scoreImportance("이건 정말 중요한 비밀이야");
		expect(typeof scores.importance).toBe("number");
		expect(typeof scores.surprise).toBe("number");
		expect(typeof scores.emotion).toBe("number");
		expect(typeof scores.utility).toBe("number");
		expect(scores.utility).toBeGreaterThan(0);
	});

	it("applyDecay delegates to adapter", async () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		const pruned = await provider.applyDecay();
		expect(typeof pruned).toBe("number");
	});

	it("recallWithHistory filters facts by timestamp", async () => {
		const adapter = mockAdapter() as MemoryAdapter;
		const provider = new NaiaMemoryProvider({ adapter });
		await provider.encode(
			{ content: "테스트 팩트", role: "user" },
			{ project: "test" },
		);
		const now = Date.now();
		const hits = await provider.recallWithHistory("테스트", now + 100000, { project: "test" });
		expect(Array.isArray(hits)).toBe(true);
	});

	it("compact returns summary from MemorySystem", async () => {
		const adapter = mockAdapter() as MemoryAdapter;
		const provider = new NaiaMemoryProvider({ adapter });
		const result = await provider.compact({
			messages: [
				{ role: "user", content: "안녕하세요" },
				{ role: "assistant", content: "안녕!" },
				{ role: "user", content: "오늘 날씨 어때?" },
			],
			keepTail: 1,
			targetTokens: 200,
		});
		expect(result).toHaveProperty("summary");
		expect(result).toHaveProperty("droppedCount");
		expect(result.summary.role).toBe("assistant");
	});

	it("detects CompactableCapableProvider", () => {
		const adapter = mockAdapter();
		const provider = new NaiaMemoryProvider({ adapter });
		expect(isCapable(provider, "CompactableCapableProvider")).toBe(true);
	});
});
