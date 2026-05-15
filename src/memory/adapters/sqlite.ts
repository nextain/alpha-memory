import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { dirname, join } from "node:path";
import { mkdirSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import {
    createCipheriv,
    createDecipheriv,
    pbkdf2,
    randomBytes,
} from "node:crypto";
import { promisify } from "node:util";
import { calculateStrength } from "../decay.js";
import type { EmbeddingProvider } from "../embeddings.js";
import { tokenize, normalize } from "../ko-normalize.js";
import { KnowledgeGraph, emptyKGState } from "../knowledge-graph.js";
import type {
    BackupCapable,
    ConsolidationResult,
    Episode,
    Fact,
    MemoryAdapter,
    RecallContext,
    Reflection,
    Skill,
    Epoch,
} from "../types.js";

const pbkdf2Async = promisify(pbkdf2);

export interface SqliteAdapterOptions {
    dbPath: string;
    embeddingProvider?: EmbeddingProvider | null;
}

export class SqliteAdapter implements MemoryAdapter, BackupCapable {
    private readonly db: Database.Database;
    private readonly embedder: EmbeddingProvider | null;

    constructor(options: SqliteAdapterOptions) {
        const dir = dirname(options.dbPath);
        if (dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });

        this.db = new Database(options.dbPath);
        this.embedder = options.embeddingProvider ?? null;
        
        sqliteVec.load(this.db);
        this.initSchema();
    }

    private initSchema() {
        this.db.exec(`
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS episodes (
                id TEXT PRIMARY KEY, content TEXT NOT NULL, timestamp INTEGER NOT NULL,
                role TEXT NOT NULL, consolidated BOOLEAN DEFAULT 0,
                importance_utility REAL, importance_emotion REAL, encoding_context TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
            CREATE TABLE IF NOT EXISTS facts (
                id TEXT PRIMARY KEY, base_id TEXT NOT NULL, content TEXT NOT NULL,
                entities TEXT, topics TEXT, importance REAL, max_emotion REAL, strength REAL,
                status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
                last_accessed INTEGER NOT NULL, recall_count INTEGER DEFAULT 0,
                valid_from INTEGER NOT NULL, valid_to INTEGER, successor_id TEXT,
                supersedes TEXT, encoding_context TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_facts_base_id ON facts(base_id);
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_time_idx USING rtree(id, min_ts, max_ts);
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts USING vec0(
                fact_id TEXT PRIMARY KEY, embedding float[${this.embedder?.dims ?? 3072}]
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(content, entities, topics);
            CREATE TABLE IF NOT EXISTS epochs (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
                start_time INTEGER NOT NULL, end_time INTEGER, source_episode_id TEXT
            );
            CREATE TABLE IF NOT EXISTS kg_nodes (name TEXT PRIMARY KEY, frequency INTEGER DEFAULT 1, last_seen INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS kg_edges (source TEXT NOT NULL, target TEXT NOT NULL, weight REAL DEFAULT 0.05, last_strengthened INTEGER NOT NULL, PRIMARY KEY (source, target));
            CREATE TABLE IF NOT EXISTS skills (name TEXT PRIMARY KEY, description TEXT, usage_count INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0, last_used INTEGER);
            CREATE TABLE IF NOT EXISTS reflections (id TEXT PRIMARY KEY, content TEXT NOT NULL, timestamp INTEGER NOT NULL, importance REAL);
        `);
    }

    episode = {
        store: async (event: Episode): Promise<void> => {
            this.db.prepare(`
                INSERT INTO episodes (id, content, timestamp, role, consolidated, importance_utility, importance_emotion, encoding_context)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(event.id, event.content, event.timestamp, event.role, event.consolidated ? 1 : 0, event.importance?.utility, event.importance?.emotion, JSON.stringify(event.encodingContext));
        },
        recall: async (query: string, context: RecallContext): Promise<Episode[]> => {
            const rows = this.db.prepare("SELECT * FROM episodes WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?").all(`%${query}%`, context.topK ?? 10) as any[];
            return rows.map(r => this.rowToEpisode(r));
        },
        getRecent: async (n: number): Promise<Episode[]> => {
            const rows = this.db.prepare("SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?").all(n) as any[];
            return rows.map(r => this.rowToEpisode(r));
        },
        getUnconsolidated: async (): Promise<Episode[]> => {
            const rows = this.db.prepare("SELECT * FROM episodes WHERE consolidated = 0 ORDER BY timestamp ASC").all() as any[];
            return rows.map(r => this.rowToEpisode(r));
        },
        markConsolidated: async (ids: string[]): Promise<void> => {
            const stmt = this.db.prepare("UPDATE episodes SET consolidated = 1 WHERE id = ?");
            this.db.transaction(() => { for (const id of ids) stmt.run(id); })();
        }
    };

    semantic = {
        upsert: async (fact: Fact): Promise<void> => {
            const now = Date.now();
            const baseId = fact.id.replace(/(-v\d+)+$/, "");
            this.db.transaction(() => {
                const info = this.db.prepare(`
                    INSERT OR REPLACE INTO facts (id, base_id, content, entities, topics, importance, max_emotion, strength, status, created_at, updated_at, last_accessed, recall_count, valid_from, valid_to, successor_id, supersedes, encoding_context)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(fact.id, baseId, fact.content, JSON.stringify(fact.entities), JSON.stringify(fact.topics), fact.importance, fact.maxEmotion, fact.strength, fact.status, fact.createdAt, fact.updatedAt, fact.lastAccessed, fact.recallCount, fact.validFrom ?? fact.createdAt, fact.validTo, fact.successorId, fact.supersedes, JSON.stringify(fact.encodingContext));
                const rowid = info.lastInsertRowid;
                const vFrom = fact.validFrom ?? fact.createdAt;
                const vTo = fact.validTo ?? 253402300799000;
                this.db.prepare("INSERT OR REPLACE INTO facts_time_idx (id, min_ts, max_ts) VALUES (?, ?, ?)").run(rowid, Math.min(vFrom, vTo), Math.max(vFrom, vTo));
                this.db.prepare("DELETE FROM facts_fts WHERE rowid = ?").run(rowid);
                this.db.prepare("INSERT INTO facts_fts (rowid, content, entities, topics) VALUES (?, ?, ?, ?)").run(rowid, fact.content, fact.entities.join(" "), fact.topics.join(" "));
                
                // KG Update with normalization
                for (const ent of fact.entities) {
                    const k = normalize(ent);
                    this.db.prepare("INSERT INTO kg_nodes (name, last_seen) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET frequency = frequency + 1, last_seen = ?").run(k, now, now);
                }
                for (let i = 0; i < fact.entities.length; i++) {
                    for (let j = i + 1; j < fact.entities.length; j++) {
                        const a = normalize(fact.entities[i]);
                        const b = normalize(fact.entities[j]);
                        this.db.prepare("INSERT INTO kg_edges (source, target, weight, last_strengthened) VALUES (?, ?, ?, ?) ON CONFLICT(source, target) DO UPDATE SET weight = MIN(1.0, weight + 0.05), last_strengthened = ?").run(a, b, 0.05, now, now);
                    }
                }
            })();
            if (this.embedder) {
                const vector = await this.embedder.embed(fact.content);
                if (vector) this.db.prepare("INSERT OR REPLACE INTO vec_facts (fact_id, embedding) VALUES (?, ?)").run(fact.id, Buffer.from(new Float32Array(vector).buffer));
            }
        },
        search: async (query: string, topK: number, deepRecall = false, context?: RecallContext): Promise<Fact[]> => {
            const now = Date.now();
            let epochRange: { start: number; end: number | null } | null = null;
            if (context?.epochAnchor) {
                const m = this.db.prepare("SELECT * FROM epochs WHERE name LIKE ? LIMIT 1").get(`%${context.epochAnchor}%`) as any;
                if (m) epochRange = { start: m.start_time, end: m.end_time };
            }
            let baseFactsQuery = `SELECT rowid as fid, * FROM facts`;
            const queryParams: any[] = [];
            if (epochRange) {
                baseFactsQuery = `SELECT f.rowid as fid, f.* FROM facts f JOIN facts_time_idx idx ON f.rowid = idx.id WHERE idx.min_ts <= ? AND idx.max_ts >= ?`;
                queryParams.push(epochRange.end ?? now, epochRange.start);
            } else if (context?.atTimestamp !== undefined) {
                baseFactsQuery = `SELECT rowid as fid, * FROM facts WHERE valid_from <= ? AND (valid_to IS NULL OR valid_to > ?)`;
                queryParams.push(context.atTimestamp, context.atTimestamp);
            }
            const cleanQuery = query.replace(/[^\w\uAC00-\uD7A3\s]/g, " ").trim();
            const tokens = cleanQuery.split(/\s+/).filter(t => t.length > 0);
            const ftsQuery = tokens.length > 0 ? tokens.map(t => `${t}*`).join(" OR ") : "*";
            const queryVec = this.embedder ? await this.embedder.embed(query) : null;
            const hasVector = !!queryVec;
            let sql: string;
            const finalParams = [...queryParams, ftsQuery];
            if (hasVector) {
                sql = `WITH candidates AS (${baseFactsQuery}), fts_results AS (SELECT rowid as fts_fid, ROW_NUMBER() OVER (ORDER BY bm25(facts_fts)) as rnk FROM facts_fts WHERE facts_fts MATCH ?), vec_results AS (SELECT fact_id, ROW_NUMBER() OVER (ORDER BY distance) as rnk FROM vec_facts WHERE embedding MATCH ? LIMIT ?), combined AS (SELECT c.*, CAST(COALESCE(1.0 / (60 + fts.rnk), 0) AS REAL) as fts_rrf, CAST(COALESCE(1.0 / (60 + vec.rnk), 0) AS REAL) as vec_rrf FROM candidates c LEFT JOIN fts_results fts ON c.fid = fts.fts_fid LEFT JOIN vec_results vec ON c.id = vec.fact_id) SELECT *, (fts_rrf + vec_rrf) as relevance_score FROM combined ORDER BY (max_emotion >= 0.8) DESC, relevance_score DESC LIMIT ?`;
                finalParams.push(Buffer.from(new Float32Array(queryVec!).buffer), topK * 2, topK * 2);
            } else {
                sql = `WITH candidates AS (${baseFactsQuery}), fts_results AS (SELECT rowid as fts_fid, ROW_NUMBER() OVER (ORDER BY bm25(facts_fts)) as rnk FROM facts_fts WHERE facts_fts MATCH ?), combined AS (SELECT c.*, CAST(COALESCE(1.0 / (60 + fts.rnk), 0) AS REAL) as fts_rrf FROM candidates c LEFT JOIN fts_results fts ON c.fid = fts.fts_fid) SELECT *, fts_rrf as relevance_score FROM combined ORDER BY (max_emotion >= 0.8) DESC, relevance_score DESC LIMIT ?`;
                finalParams.push(topK * 2);
            }
            const rows = this.db.prepare(sql).all(...finalParams) as any[];
            const includeSuperseded = context?.mode === "history" || deepRecall || epochRange !== null;
            const kgState = await this.getKGState();
            const kg = new KnowledgeGraph(kgState);
            const activations = kg.spreadingActivation(tokenize(query), 2, 0.8);
            const actMap = new Map(activations.map(a => [a.entity.toLowerCase(), a.activation]));
            return rows.map(r => {
                const fact = this.rowToFact(r, r.relevance_score);
                let kgBonus = 0;
                for (const ent of fact.entities) {
                    const a = actMap.get(normalize(ent));
                    if (a) kgBonus += a * 2.0;
                }
                fact.relevanceScore = (fact.relevanceScore || 0) + kgBonus;
                return fact;
            }).filter(f => {
                const isFlashbulb = (f.maxEmotion ?? 0) >= 0.8;
                const hasRelevance = (f.relevanceScore ?? 0) > 0 || includeSuperseded;
                return (includeSuperseded || f.status === "active") && (hasRelevance || isFlashbulb);
            }).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)).slice(0, topK);
        },
        decay: async (now: number): Promise<number> => {
            const res = this.db.prepare("UPDATE facts SET strength = strength * 0.95 WHERE status = 'active'").run();
            return res.changes;
        },
        associate: async (entityA: string, entityB: string, weight = 0.05): Promise<void> => {
            const now = Date.now();
            const a = normalize(entityA);
            const b = normalize(entityB);
            this.db.transaction(() => {
                const q = "INSERT INTO kg_nodes (name, last_seen) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET frequency = frequency + 1, last_seen = ?";
                this.db.prepare(q).run(a, now, now);
                this.db.prepare(q).run(b, now, now);
                this.db.prepare("INSERT INTO kg_edges (source, target, weight, last_strengthened) VALUES (?, ?, ?, ?) ON CONFLICT(source, target) DO UPDATE SET weight = MIN(1.0, weight + ?), last_strengthened = ?").run(a, b, weight, now, weight, now);
            })();
        },
        getAll: async (): Promise<Fact[]> => {
            return (this.db.prepare("SELECT * FROM facts").all() as any[]).map(r => this.rowToFact(r));
        },
        delete: async (id: string): Promise<boolean> => {
            return this.db.prepare("DELETE FROM facts WHERE id = ?").run(id).changes > 0;
        }
    };

    procedural = {
        getSkill: async (name: string): Promise<Skill | null> => {
            const r = this.db.prepare("SELECT * FROM skills WHERE name = ?").get(name) as any;
            return r ? { name: r.name, description: r.description, usageCount: r.usage_count, successCount: r.success_count, lastUsed: r.last_used } : null;
        },
        recordOutcome: async (name: string, success: boolean): Promise<void> => {
            this.db.prepare("INSERT INTO skills (name, usage_count, success_count, last_used) VALUES (?, 1, ?, ?) ON CONFLICT(name) DO UPDATE SET usage_count = usage_count + 1, success_count = success_count + ?, last_used = ?").run(name, success ? 1 : 0, Date.now(), success ? 1 : 0, Date.now());
        },
        learnFromFailure: async (reflection: Reflection): Promise<void> => {
            this.db.prepare("INSERT INTO reflections (id, content, timestamp, importance) VALUES (?, ?, ?, ?)").run(reflection.id, reflection.content, reflection.timestamp, reflection.importance);
        },
        getReflections: async (task: string, topK: number): Promise<Reflection[]> => {
            return (this.db.prepare("SELECT * FROM reflections WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?").all(`%${task}%`, topK) as any[]).map(r => ({ id: r.id, content: r.content, timestamp: r.timestamp, importance: r.importance }));
        }
    };

    async upsertEpoch(epoch: Epoch): Promise<void> {
        this.db.prepare("INSERT INTO epochs (id, name, description, start_time, end_time, source_episode_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, start_time=excluded.start_time, end_time=excluded.end_time").run(epoch.id, epoch.name, epoch.description, epoch.start, epoch.end, epoch.sourceEpisodeId);
    }
    async getEpochs(): Promise<Epoch[]> {
        return (this.db.prepare("SELECT * FROM epochs").all() as any[]).map(r => ({ id: r.id, name: r.name, description: r.description, start: r.start_time, end: r.end_time, source_episode_id: r.source_episode_id }));
    }
    async getHubs(): Promise<Record<string, { frequency: number }>> {
        const rows = this.db.prepare("SELECT name, frequency FROM kg_nodes ORDER BY frequency DESC LIMIT 50").all() as any[];
        const hubs: Record<string, { frequency: number }> = {};
        for (const r of rows) hubs[r.name] = { frequency: r.frequency };
        return hubs;
    }
    async getKGState(): Promise<any> {
        const nodes = this.db.prepare("SELECT * FROM kg_nodes").all() as any[];
        const edges = this.db.prepare("SELECT * FROM kg_edges").all() as any[];
        const state = emptyKGState();
        for (const n of nodes) state.nodes[n.name] = { name: n.name, frequency: n.frequency, lastSeen: n.last_seen };
        for (const e of edges) state.edges[`${e.source}::${e.target}`] = { from: e.source, to: e.target, weight: e.weight, lastStrengthened: e.last_strengthened };
        return state;
    }
    async consolidate(): Promise<ConsolidationResult> { return { episodesProcessed: 0, factsCreated: 0, factsUpdated: 0, memoriesPruned: 0, associationsUpdated: 0 }; }
    async export(password: string): Promise<Uint8Array> { return new Uint8Array(0); }
    async import(blob: Uint8Array, password: string): Promise<void> {}
    async close(): Promise<void> { this.db.close(); }

    private rowToEpisode(r: any): Episode {
        return { id: r.id, content: r.content, timestamp: r.timestamp, role: r.role as any, consolidated: !!r.consolidated, importance: { utility: r.importance_utility, emotion: r.importance_emotion }, encodingContext: JSON.parse(r.encoding_context || "{}") };
    }
    private rowToFact(r: any, score?: number): Fact {
        return { id: r.id, content: r.content, entities: JSON.parse(r.entities || "[]"), topics: JSON.parse(r.topics || "[]"), importance: r.importance, maxEmotion: r.max_emotion, strength: r.strength, status: r.status as any, createdAt: r.created_at, updatedAt: r.updated_at, lastAccessed: r.last_accessed, recallCount: r.recall_count, validFrom: r.valid_from, valid_to: r.valid_to, successorId: r.successor_id, supersedes: r.supersedes, encodingContext: JSON.parse(r.encoding_context || "{}"), relevanceScore: score };
    }
}
