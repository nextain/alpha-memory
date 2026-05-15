import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";

const dbPath = join(homedir(), ".naia", "memory", "stress-test-tiered-100k.db");
if (!existsSync(dbPath)) {
    console.error("DB not found at " + dbPath);
    process.exit(1);
}
const db = new Database(dbPath);
sqliteVec.load(db);

const topK = 10;
const ftsQuery = "topic*";
const queryVec = new Float32Array(384).fill(0);

console.log("--- Query Plan Analysis (Surgical Tiered) ---");
const sql = `
    EXPLAIN QUERY PLAN
    WITH fts_raw AS (
        SELECT rowid as fid, bm25(facts_fts_hot) as score 
        FROM facts_fts_hot WHERE facts_fts_hot MATCH ? 
        ORDER BY bm25(facts_fts_hot) LIMIT ?
    ),
    fts_ranked AS (SELECT fid, ROW_NUMBER() OVER (ORDER BY score) as rnk FROM fts_raw),
    vec_raw AS (
        SELECT fact_id as vid, distance 
        FROM vec_facts_hot WHERE embedding MATCH ? AND k = ?
    ),
    vec_ranked AS (SELECT vid, ROW_NUMBER() OVER (ORDER BY distance) as rnk FROM vec_raw),
    candidates AS (
        SELECT fid, fts.rnk as fts_rnk, 0 as vec_rnk FROM fts_ranked fts
        UNION ALL
        SELECT f.rowid as fid, 0 as fts_rnk, v.rnk as vec_rnk 
        FROM vec_ranked v JOIN facts f ON f.id = v.vid
    ),
    merged AS (
        SELECT fid, MAX(fts_rnk) as f_rnk, MAX(vec_rnk) as v_rnk
        FROM candidates GROUP BY fid
    )
    SELECT f.*, 
           CASE WHEN m.f_rnk > 0 THEN 1.0 / (60 + m.f_rnk) ELSE 0 END as fts_rrf,
           CASE WHEN m.v_rnk > 0 THEN 1.0 / (60 + m.v_rnk) ELSE 0 END as vec_rrf
    FROM merged m
    JOIN facts f ON f.rowid = m.fid
    ORDER BY (fts_rrf + vec_rrf) DESC LIMIT ?
`;

try {
    const plan = db.prepare(sql).all(ftsQuery, topK * 10, Buffer.from(queryVec.buffer), topK * 10, topK * 2);
    console.table(plan);
} catch (e) {
    console.error(e);
}

db.close();
