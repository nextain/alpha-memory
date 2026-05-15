import { describe, it, expect, beforeEach } from "vitest";
import { MemorySystem } from "../index.js";
import { SqliteAdapter } from "../adapters/sqlite.js";
import { randomUUID } from "node:crypto";

describe("Semantic Consolidation (The Power of Forgetting)", () => {
    let memory: MemorySystem;
    let adapter: SqliteAdapter;

    beforeEach(async () => {
        adapter = new SqliteAdapter({ dbPath: ':memory:' });
        memory = new MemorySystem({ adapter });
        await memory.init();
    });

    it("should distill multiple related facts into a high-level insight and archive source facts", async () => {
        const now = Date.now();
        
        // 1. 동일한 엔티티('나이아')에 대한 3개의 팩트 주입
        const facts = [
            {
                id: "fact-1",
                content: "나이아는 파란색을 좋아해.",
                entities: ["나이아"],
                topics: ["personal"],
                createdAt: now - 10000,
                updatedAt: now - 10000,
                importance: 0.7,
                recallCount: 0,
                lastAccessed: now - 10000,
                strength: 0.7,
                status: "active" as const,
                sourceEpisodes: [randomUUID()]
            },
            {
                id: "fact-2",
                content: "나이아는 코딩을 아주 잘해.",
                entities: ["나이아"],
                topics: ["work"],
                createdAt: now - 9000,
                updatedAt: now - 9000,
                importance: 0.8,
                recallCount: 0,
                lastAccessed: now - 9000,
                strength: 0.8,
                status: "active" as const,
                sourceEpisodes: [randomUUID()]
            },
            {
                id: "fact-3",
                content: "나이아는 매일 아침 커피를 마셔.",
                entities: ["나이아"],
                topics: ["habit"],
                createdAt: now - 8000,
                updatedAt: now - 8000,
                importance: 0.6,
                recallCount: 0,
                lastAccessed: now - 8000,
                strength: 0.6,
                status: "active" as const,
                sourceEpisodes: [randomUUID()]
            }
        ];

        for (const f of facts) {
            await adapter.semantic.upsert(f as any);
        }

        // 지식 그래프에 '나이아'를 허브로 인식시키기 위해 빈도 업데이트
        // SQLite에서는 직접 DB를 조작하거나 associate를 여러 번 호출
        for (let i = 0; i < 5; i++) {
            await adapter.semantic.associate("나이아", "나이아", 0.0); // self-frequency
        }

        // 2. 공고화 실행
        const result = await memory.consolidateNow(true);

        // 3. 검증
        expect(result.insightsCreated).toBeGreaterThan(0);

        const allFacts = await adapter.semantic.getAll();
        const insight = allFacts.find(f => f.topics?.includes("system:insight"));
        
        expect(insight).toBeDefined();
        expect(insight?.entities).toContain("나이아");
        expect(insight?.content).toContain("Insight");

        // 소스 팩트들이 보관(archived) 처리되었는지 확인
        const sourceFacts = allFacts.filter(f => ["fact-1", "fact-2", "fact-3"].includes(f.id));
        for (const f of sourceFacts) {
            expect(f.status).toBe("archived");
            expect(f.strength).toBeLessThan(0.5); // 감쇄 확인
        }
    });
});
