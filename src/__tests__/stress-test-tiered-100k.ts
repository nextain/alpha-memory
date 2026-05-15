import { MemorySystem } from "../memory/index.js";
import { SqliteAdapter } from "../memory/adapters/sqlite.js";
import { OfflineEmbeddingProvider } from "../memory/embeddings.js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

async function runStressTest() {
    console.log("=== Naia Memory 100k Fact Tiered Stress Test (Hardened v7-FINAL) ===");
    const dbPath = join(homedir(), ".naia", "memory", "stress-test-tiered-100k.db");
    if (existsSync(dbPath)) unlinkSync(dbPath);

    const mockEmbedder = new OfflineEmbeddingProvider();
    
    const adapter = new SqliteAdapter({ 
        dbPath,
        embeddingProvider: mockEmbedder 
    });
    const memory = new MemorySystem({ adapter });
    await memory.init();

    const COUNT = 100000;
    const BATCH_SIZE = 1000;
    console.log(`Injecting ${COUNT} facts (Hot=10,000, Cold=90,000)...`);

    for (let i = 0; i < COUNT / BATCH_SIZE; i++) {
        const promises = [];
        for (let j = 0; j < BATCH_SIZE; j++) {
            const id = i * BATCH_SIZE + j;
            // Determinstic hot tier: first 10k are strong
            const strength = id < 10000 ? 0.9 : 0.1;
            const fact = {
                id: `fact-${id}`,
                content: `Synthetic fact ${id} topic-${id % 1000} group-${id % 10}.`,
                entities: [`topic-${id % 1000}`, `group-${id % 10}`],
                topics: [`topic-${id % 1000}`],
                importance: 0.1, // Fixed to avoid random Hot entries
                maxEmotion: 0.1,
                strength: strength,
                status: "active" as const,
                createdAt: Date.now() - (id * 1000),
                updatedAt: Date.now() - (id * 1000),
                lastAccessed: Date.now() - (id * 1000),
                recallCount: 0,
                validFrom: Date.now() - (id * 1000),
                validTo: null,
                sourceEpisodes: [randomUUID()],
                encodingContext: { project: "stress-test" }
            };
            promises.push(adapter.semantic.upsert(fact));
        }
        await Promise.all(promises);
    }
    console.log("Injection finished.");

    // Audit Table Sizes
    const db = new Database(dbPath);
    sqliteVec.load(db);
    const hotCount = db.prepare("SELECT count(*) as count FROM vec_facts_hot").get() as any;
    const coldCount = db.prepare("SELECT count(*) as count FROM vec_facts").get() as any;
    console.log(`Table Stats: HOT=${hotCount.count}, COLD=${coldCount.count}`);
    db.close();

    // Performance Benchmark: Surface Recall (Default)
    console.log("\n--- Tier 1: Surface Recall (Hot Facts Only) ---");
    const testQueries = ["topic-500", "group-5"];
    let allPassed = true;

    for (const q of testQueries) {
        const start = performance.now();
        const results = await memory.recall(q, { topK: 10 });
        const end = performance.now();
        const latency = end - start;
        console.log(`Query: '${q}' -> ${results.facts.length} hits, Time: ${latency.toFixed(4)}ms`);
        if (latency > 25) {
            console.warn(`  [WARN] Latency ${latency.toFixed(2)}ms exceeds 25ms goal.`);
            allPassed = false;
        }
        if (results.facts.length === 0) {
            console.error("  [FAIL] Zero hits!");
            allPassed = false;
        }
    }

    // Final Verdict
    if (allPassed) {
        console.log("\nVERDICT: SUCCESS. Surface Recall firmly < 25ms on 100k dataset.");
    } else {
        console.log("\nVERDICT: FAILED. Check logs.");
    }

    await memory.close();
}

runStressTest().catch(console.error);
