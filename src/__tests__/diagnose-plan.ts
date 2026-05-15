import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { join } from "node:path";
import { homedir } from "node:os";

const dbPath = join(homedir(), ".naia", "memory", "stress-test-100k.db");
const db = new Database(dbPath);
sqliteVec.load(db);

const query = "topic-500";
const topK = 20;
const ftsQuery = "topic* OR 500*";
const queryVec = new Float32Array(3072).fill(0); // Dummy

console.log("--- Query Plan for Surgical Hybrid Search ---");
const sql = `
    EXPLAIN QUERY PLAN
    WITH fts_results AS (
        SELECT rowid as fid, bm25(facts_fts) as score 
        FROM facts_fts WHERE facts_fts MATCH ? 
        ORDER BY bm25(facts_fts) LIMIT ?
    ),
    vec_results AS (
        SELECT fact_id as vid, distance 
        FROM vec_facts WHERE embedding MATCH ? AND k = ?
    ),
    candidates AS (
        SELECT fid, NULL as vid FROM fts_results
        UNION ALL
        SELECT f.rowid as fid, vid FROM vec_results v JOIN facts f ON f.id = v.vid
    )
    SELECT f.*,
           CASE WHEN fts.fid IS NULL THEN 0 ELSE 1.0 / (60 + (SELECT count(*) FROM fts_results f2 WHERE f2.score < fts.score) + 1) END as fts_rrf,
           CASE WHEN vec.vid IS NULL THEN 0 ELSE 1.0 / (60 + (SELECT count(*) FROM vec_results v2 WHERE v2.distance < vec.distance) + 1) END as vec_rrf
    FROM candidates c
    JOIN facts f ON f.rowid = c.fid
    LEFT JOIN fts_results fts ON fts.fid = c.fid
    LEFT JOIN vec_results vec ON vec.vid = f.id
    WHERE 1=1
    ORDER BY (f.max_emotion >= 0.8) DESC, (fts_rrf + vec_rrf) DESC LIMIT ?
`;

try {
    const plan = db.prepare(sql).all(ftsQuery, topK * 10, Buffer.from(queryVec.buffer), topK * 10, topK * 2);
    console.table(plan);
} catch (e) {
    console.error(e);
}

db.close();
