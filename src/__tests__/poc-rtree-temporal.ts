import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

async function runPoC() {
    console.log("--- SQLite R-Tree Temporal Search PoC ---");
    const db = new Database(":memory:");
    
    // 1. Create Tables
    db.exec(`
        CREATE TABLE facts (
            id TEXT PRIMARY KEY,
            content TEXT,
            valid_from INTEGER,
            valid_to INTEGER
        );
        
        -- R-Tree index for temporal range
        -- rowid (mapped to rowid of facts)
        -- x0, x1 (mapped to valid_from, valid_to)
        CREATE VIRTUAL TABLE facts_time_idx USING rtree(
            id,              -- rowid
            min_ts, max_ts   -- time range
        );
    `);

    // 2. Prepare Data (10,000 synthetic facts)
    console.log("Preparing 10,000 facts...");
    const insertFact = db.prepare("INSERT INTO facts (id, content, valid_from, valid_to) VALUES (?, ?, ?, ?)");
    const insertIdx = db.prepare("INSERT INTO facts_time_idx (id, min_ts, max_ts) VALUES (?, ?, ?)");
    
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    
    db.transaction(() => {
        for (let i = 0; i < 10000; i++) {
            const id = i + 1; // SQLite rtree uses INTEGER rowid as primary key
            const start = now - (i * dayMs);
            const end = start + (30 * dayMs);
            insertFact.run(`uuid-${i}`, `Fact content ${i}`, start, end);
            insertIdx.run(id, start, end);
        }
    })();

    // 3. Benchmark Range Query
    const targetStart = now - (100 * dayMs);
    const targetEnd = now - (90 * dayMs);

    console.log(`Querying range: ${new Date(targetStart).toISOString()} to ${new Date(targetEnd).toISOString()}`);

    // Standard B-Tree approach (Simulated via non-rtree query)
    const startBtree = performance.now();
    const btreeResults = db.prepare(`
        SELECT * FROM facts 
        WHERE valid_from <= ? AND valid_to >= ?
    `).all(targetEnd, targetStart);
    const endBtree = performance.now();
    console.log(`B-Tree Search: ${btreeResults.length} hits, ${(endBtree - startBtree).toFixed(4)}ms`);

    // R-Tree approach
    const startRtree = performance.now();
    const rtreeResults = db.prepare(`
        SELECT f.* FROM facts f
        JOIN facts_time_idx idx ON f.rowid = idx.id
        WHERE idx.min_ts <= ? AND idx.max_ts >= ?
    `).all(targetEnd, targetStart);
    const endRtree = performance.now();
    console.log(`R-Tree Search: ${rtreeResults.length} hits, ${(endRtree - startRtree).toFixed(4)}ms`);

    console.log("--- PoC Conclusion ---");
    if (endRtree - startRtree <= endBtree - startBtree) {
        console.log("VERDICT: R-Tree provides efficient spatial-temporal overlap lookup.");
    }
}

runPoC().catch(console.error);
