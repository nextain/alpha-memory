import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";

async function runVectorPoC() {
    console.log("--- SQLite Native Vector Search PoC ---");
    const db = new Database(":memory:");
    sqliteVec.load(db);

    // 1. Create Vector Table
    db.exec(`
        CREATE VIRTUAL TABLE vec_facts USING vec0(
            fact_id TEXT PRIMARY KEY,
            embedding float[1536]
        );
    `);

    // 2. Insert Sample Data
    const insert = db.prepare("INSERT INTO vec_facts(fact_id, embedding) VALUES (?, ?)");
    const mockVec = new Float32Array(1536).fill(0.1);
    mockVec[0] = 0.5; // Distinguish it

    console.log("Inserting vector...");
    insert.run("fact-1", mockVec);

    // 3. Search (L2 Distance or Cosine)
    console.log("Querying vector...");
    const queryVec = new Float32Array(1536).fill(0.1);
    queryVec[0] = 0.49;

    const results = db.prepare(`
        SELECT fact_id, distance
        FROM vec_facts
        WHERE embedding MATCH ?
        ORDER BY distance
        LIMIT 5
    `).all(queryVec);

    console.log("Results:", results);
    console.log("--- PoC Conclusion ---");
    if (results.length > 0) {
        console.log("VERDICT: sqlite-vec provides native vector search capability in SQLite.");
    }
}

runVectorPoC().catch(console.error);
