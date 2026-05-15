import { describe, it, expect, beforeEach } from "vitest";
import { MemorySystem } from "../index.js";
import { SqliteAdapter } from "../adapters/sqlite.js";
import { randomUUID } from "node:crypto";

describe("Flashbulb Memory (Non-linear Gating)", () => {
    let memory: MemorySystem;
    let adapter: SqliteAdapter;

    beforeEach(async () => {
        adapter = new SqliteAdapter({ dbPath: ':memory:' });
        memory = new MemorySystem({ adapter });
        await memory.init();
    });

    it("should recall high-emotion memory even with low vector similarity", async () => {
        const now = Date.now();
        
        // 1. 아주 감정적인 기억 저장 (유사도 낮을 만한 내용)
        // '슈퍼마켓에서 산 사과가 너무 맛없어서 울었다' (감정 0.9)
        await memory.encode(
            { 
                content: "슈퍼마켓에서 산 사과가 너무 맛없어서 정말 슬펐어.", 
                role: "user",
                timestamp: now - 1000 
            },
            { project: "personal" }
        );

        // consolidate를 강제로 실행하여 Fact로 변환 (heuristic 추출기 사용)
        // Note: importance scoring은 실제 점수 측정 로직에 의존하므로 
        // 테스트 환경에서 emotion 점수가 0.8 이상 나오도록 유도해야 함.
        // 여기서는 직접 adapter에 emotion이 높은 팩트를 주입하여 검색 로직만 테스트하거나,
        // scoreImportance를 모킹해야 하지만, 간단히 하기 위해 팩트를 직접 생성해 주입하겠습니다.
        
        const flashbulbFact = {
            id: randomUUID(),
            content: "평생 잊지 못할 만큼 맛없는 사과 사건",
            entities: ["사과", "슈퍼마켓"],
            topics: ["personal"],
            createdAt: now - 500,
            updatedAt: now - 500,
            importance: 0.9,
            maxEmotion: 0.9, // Flashbulb threshold 0.8 초과
            recallCount: 0,
            lastAccessed: now - 500,
            strength: 0.9,
            status: "active" as const,
            sourceEpisodes: [],
            encodingContext: { project: "personal" }
        };
        
        await adapter.semantic.upsert(flashbulbFact);

        // 2. 사과와는 전혀 상관없는 쿼리 (하지만 감정적인 상태를 암시하거나 무관한 쿼리)
        // 벡터 유사도가 낮게 나올 법한 쿼리
        const query = "오늘 기분이 좀 별로네.";
        const result = await memory.recall(query, { project: "personal", topK: 5 });

        // 3. 검증: 유사도가 낮음에도 불구하고 감정 0.9인 사과 팩트가 나와야 함
        const found = result.facts.find(f => f.content.includes("사과"));
        expect(found).toBeDefined();
        expect(found?.maxEmotion).toBeGreaterThanOrEqual(0.8);
    });

    it("should NOT recall low-emotion irrelevant memory", async () => {
        const now = Date.now();
        
        // 평범한 기억 (감정 0.4)
        const boringFact = {
            id: randomUUID(),
            content: "어제는 날씨가 맑았다.",
            entities: [],
            topics: ["personal"],
            createdAt: now - 500,
            updatedAt: now - 500,
            importance: 0.5,
            maxEmotion: 0.4, // Flashbulb threshold 미달
            recallCount: 0,
            lastAccessed: now - 500,
            strength: 0.5,
            status: "active" as const,
            sourceEpisodes: [],
            encodingContext: { project: "personal" }
        };
        
        await adapter.semantic.upsert(boringFact);

        const query = "내일 점심 메뉴 추천해줘.";
        const result = await memory.recall(query, { project: "personal", topK: 5 });

        // 검증: 유사도도 낮고 감정도 낮으므로 인출되지 않아야 함
        const found = result.facts.find(f => f.content.includes("날씨"));
        expect(found).toBeUndefined();
    });
});
