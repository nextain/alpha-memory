import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemorySystem } from "../index.js";
import { SqliteAdapter } from "../adapters/sqlite.js";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

describe("SqliteAdapter Smoke Test", () => {
    let memory: MemorySystem;
    let adapter: SqliteAdapter;
    let dbPath: string;

    beforeEach(async () => {
        dbPath = join(homedir(), ".naia", "memory", `test-smoke-${randomUUID()}.db`);
        adapter = new SqliteAdapter({ dbPath });
        memory = new MemorySystem({ adapter });
        await memory.init();
    });

    afterEach(async () => {
        await memory.close();
        if (existsSync(dbPath)) {
            try { unlinkSync(dbPath); } catch {}
        }
    });

    it("should store and recall a fact from SQLite", async () => {
        const fact = {
            id: randomUUID(),
            content: "SQLite is better than JSON for scaling.",
            entities: ["SQLite", "JSON"],
            topics: ["database"],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            importance: 0.8,
            recallCount: 0,
            lastAccessed: Date.now(),
            strength: 0.8,
            status: "active" as const,
            sourceEpisodes: []
        };

        await adapter.semantic.upsert(fact);

        const result = await memory.recall("database scaling", { topK: 5 });
        expect(result.facts.length).toBeGreaterThan(0);
        expect(result.facts[0].content).toContain("SQLite");
    });

    it("should support epoch-based filtering in SQLite", async () => {
        const now = Date.now();
        await adapter.upsertEpoch({
            id: "epoch-1",
            name: "Test Era",
            start: now - 10000,
            end: now + 10000
        });

        const fact = {
            id: randomUUID(),
            content: "This was true during Test Era.",
            entities: [],
            topics: ["test"],
            createdAt: now,
            updatedAt: now,
            importance: 0.5,
            recallCount: 0,
            lastAccessed: now,
            strength: 0.5,
            status: "active" as const,
            sourceEpisodes: [],
            validFrom: now - 5000,
            validTo: now + 5000
        };
        await adapter.semantic.upsert(fact);

        const result = await memory.recall("test", { 
            mode: "at-time",
            epochAnchor: "Test Era" 
        } as any);

        expect(result.facts.length).toBeGreaterThan(0);
        expect(result.facts[0].content).toContain("Test Era");
    });
});
