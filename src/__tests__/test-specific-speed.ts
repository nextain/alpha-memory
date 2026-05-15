import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { join } from "node:path";
import { homedir } from "node:os";

const dbPath = join(homedir(), ".naia", "memory", "stress-test-100k.db");
const db = new Database(dbPath);
sqliteVec.load(db);

console.log("--- Performance Test: Specific FTS (Few matches) ---");
const startFTS = performance.now();
const rowsFTS = db.prepare("SELECT rowid, bm25(facts_fts) as score FROM facts_fts WHERE facts_fts MATCH '\"topic-500\"' ORDER BY score LIMIT 200").all();
const endFTS = performance.now();
console.log(`FTS Rank ('topic-500') took: ${(endFTS - startFTS).toFixed(4)}ms (found ${rowsFTS.length} hits)`);

console.log("--- Performance Test: Specific Vector ---");
const queryVec = new Float32Array(384).fill(0);
const startVec = performance.now();
const rowsVec = db.prepare("SELECT fact_id, distance FROM vec_facts WHERE embedding MATCH ? AND k = 20").all(Buffer.from(queryVec.buffer));
const endVec = performance.now();
console.log(`Vector Search took: ${(endVec - startVec).toFixed(4)}ms`);

db.close();
