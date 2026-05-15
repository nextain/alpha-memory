import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { dirname } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
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
    private kgCache: any = null;
    private kgDirty = true;
    
    // Prepared Statements
    private readonly stmtFtsHot: Database.Statement;
    private readonly stmtFtsDeep: Database.Statement;
    private readonly stmtVecHot: Database.Statement;
    private readonly stmtVecDeep: Database.Statement;

    constructor(options: SqliteAdapterOptions) {
        const dir = dirname(options.dbPath);
        if (dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });
        this.db = new Database(options.dbPath);
        this.embedder = options.embeddingProvider ?? null;
        sqliteVec.load(this.db);
        this.initSchema();
        
        this.stmtFtsHot = this.db.prepare("SELECT rowid, bm25(facts_fts_hot) as score FROM facts_fts_hot WHERE facts_fts_hot MATCH ? ORDER BY bm25(facts_fts_hot) LIMIT ?");
        this.stmtFtsDeep = this.db.prepare("SELECT rowid, bm25(facts_fts) as score FROM facts_fts WHERE facts_fts MATCH ? ORDER BY bm25(facts_fts) LIMIT ?");
        this.stmtVecHot = this.db.prepare("SELECT fact_id, distance FROM vec_facts_hot WHERE embedding MATCH ? AND k = ?");
        this.stmtVecDeep = this.db.prepare("SELECT fact_id, distance FROM vec_facts WHERE embedding MATCH ? AND k = ?");
    }

    private initSchema() {
        this.db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA cache_size = -64000;
            CREATE TABLE IF NOT EXISTS episodes (id TEXT PRIMARY KEY, content TEXT NOT NULL, timestamp INTEGER NOT NULL, role TEXT NOT NULL, consolidated BOOLEAN DEFAULT 0, importance_utility REAL, importance_emotion REAL, encoding_context TEXT);
            CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
            CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, base_id TEXT NOT NULL, content TEXT NOT NULL, entities TEXT, topics TEXT, importance REAL, max_emotion REAL, strength REAL, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_accessed INTEGER NOT NULL, recall_count INTEGER DEFAULT 0, valid_from INTEGER NOT NULL, valid_to INTEGER, successor_id TEXT, supersedes TEXT, source_episodes TEXT, encoding_context TEXT);
            CREATE INDEX IF NOT EXISTS idx_facts_base_id ON facts(base_id);
            CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(status);
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_time_idx USING rtree(id, min_ts, max_ts);
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts USING vec0(fact_id TEXT PRIMARY KEY, embedding float[${this.embedder?.dims ?? 3072}]);
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(content, entities, topics);
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts_hot USING vec0(fact_id TEXT PRIMARY KEY, embedding float[${this.embedder?.dims ?? 3072}]);
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts_hot USING fts5(content, entities, topics);
            CREATE TABLE IF NOT EXISTS id_map (fid INTEGER PRIMARY KEY, fact_id TEXT UNIQUE);
            CREATE TABLE IF NOT EXISTS epochs (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, start_time INTEGER NOT NULL, end_time INTEGER, source_episode_id TEXT);
            CREATE TABLE IF NOT EXISTS kg_nodes (name TEXT PRIMARY KEY, frequency INTEGER DEFAULT 1, last_seen INTEGER NOT NULL);
            CREATE TABLE IF NOT EXISTS kg_edges (source TEXT NOT NULL, target TEXT NOT NULL, weight REAL DEFAULT 0.05, last_strengthened INTEGER NOT NULL, PRIMARY KEY (source, target));
            CREATE TABLE IF NOT EXISTS skills (name TEXT PRIMARY KEY, description TEXT, usage_count INTEGER DEFAULT 0, success_count INTEGER DEFAULT 0, last_used INTEGER);
            CREATE TABLE IF NOT EXISTS reflections (id TEXT PRIMARY KEY, content TEXT NOT NULL, timestamp INTEGER NOT NULL, importance REAL);
        `);
    }

    episode = {
        store: async (event: Episode): Promise<void> => {
            this.db.prepare("INSERT INTO episodes (id, content, timestamp, role, consolidated, importance_utility, importance_emotion, encoding_context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(event.id, event.content, event.timestamp, event.role, event.consolidated ? 1 : 0, event.importance?.utility, event.importance?.emotion, JSON.stringify(event.encodingContext));
        },
        recall: async (query: string, context: RecallContext): Promise<Episode[]> => {
            return (this.db.prepare("SELECT * FROM episodes WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?").all(`%${query}%`, context.topK ?? 10) as any[]).map(r => this.rowToEpisode(r));
        },
        getRecent: async (n: number): Promise<Episode[]> => { return (this.db.prepare("SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?").all(n) as any[]).map(r => this.rowToEpisode(r)); },
        getUnconsolidated: async (): Promise<Episode[]> => { return (this.db.prepare("SELECT * FROM episodes WHERE consolidated = 0 ORDER BY timestamp ASC").all() as any[]).map(r => this.rowToEpisode(r)); },
        markConsolidated: async (ids: string[]): Promise<void> => { const stmt = this.db.prepare("UPDATE episodes SET consolidated = 1 WHERE id = ?"); this.db.transaction(() => { for (const id of ids) stmt.run(id); })(); }
    };

    semantic = {
        upsert: async (fact: Fact): Promise<void> => {
            const now = Date.now();
            const baseId = fact.id.replace(/(-v\d+)+$/, "");
            this.db.transaction(() => {
                const existing = this.db.prepare("SELECT rowid FROM facts WHERE id = ?").get(fact.id) as any;
                if (existing) {
                    this.db.prepare("DELETE FROM facts_time_idx WHERE id = ?").run(existing.rowid);
                    this.db.prepare("DELETE FROM facts_fts WHERE rowid = ?").run(existing.rowid);
                    this.db.prepare("DELETE FROM facts_fts_hot WHERE rowid = ?").run(existing.rowid);
                }
                const info = this.db.prepare(`INSERT OR REPLACE INTO facts (id, base_id, content, entities, topics, importance, max_emotion, strength, status, created_at, updated_at, last_accessed, recall_count, valid_from, valid_to, successor_id, supersedes, source_episodes, encoding_context) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(fact.id, baseId, fact.content, JSON.stringify(fact.entities), JSON.stringify(fact.topics), fact.importance, fact.maxEmotion, fact.strength, fact.status, fact.createdAt, fact.updatedAt, fact.lastAccessed, fact.recallCount, fact.validFrom ?? fact.createdAt, fact.validTo, fact.successorId, fact.supersedes, JSON.stringify(fact.sourceEpisodes || []), JSON.stringify(fact.encodingContext));
                const rowid = info.lastInsertRowid;
                this.db.prepare("INSERT OR REPLACE INTO id_map (fid, fact_id) VALUES (?, ?)").run(rowid, fact.id);
                this.db.prepare("INSERT OR REPLACE INTO facts_time_idx (id, min_ts, max_ts) VALUES (?, ?, ?)").run(rowid, Math.min(fact.validFrom ?? fact.createdAt, fact.validTo ?? 253402300799000), Math.max(fact.validFrom ?? fact.createdAt, fact.validTo ?? 253402300799000));
                this.db.prepare("INSERT OR REPLACE INTO facts_fts (rowid, content, entities, topics) VALUES (?, ?, ?, ?)").run(rowid, fact.content, fact.entities.join(" "), fact.topics.join(" "));
                if (fact.strength > 0.6 || fact.importance > 0.8) {
                    this.db.prepare("INSERT OR REPLACE INTO facts_fts_hot (rowid, content, entities, topics) VALUES (?, ?, ?, ?)").run(rowid, fact.content, fact.entities.join(" "), fact.topics.join(" "));
                }
                for (const ent of fact.entities) {
                    const k = normalize(ent);
                    this.db.prepare("INSERT INTO kg_nodes (name, last_seen) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET frequency = frequency + 1, last_seen = ?").run(k, now, now);
                }
                for (let i = 0; i < fact.entities.length; i++) {
                    for (let j = i + 1; j < fact.entities.length; j++) {
                        const a = normalize(fact.entities[i]), b = normalize(fact.entities[j]);
                        this.db.prepare("INSERT INTO kg_edges (source, target, weight, last_strengthened) VALUES (?, ?, ?, ?) ON CONFLICT(source, target) DO UPDATE SET weight = MIN(1.0, weight + 0.05), last_strengthened = ?").run(a, b, 0.05, now, now);
                    }
                }
            })();
            if (this.embedder) {
                const vector = await this.embedder.embed(fact.content);
                if (vector) {
                    const vBlob = Buffer.from(new Float32Array(vector).buffer);
                    this.db.prepare("INSERT OR REPLACE INTO vec_facts (fact_id, embedding) VALUES (?, ?)").run(fact.id, vBlob);
                    if (fact.strength > 0.6 || fact.importance > 0.8) {
                        this.db.prepare("INSERT OR REPLACE INTO vec_facts_hot (fact_id, embedding) VALUES (?, ?)").run(fact.id, vBlob);
                    }
                }
            }
            this.kgDirty = true;
        },
        search: async (query: string, topK: number, deepRecall = false, context?: { project?: string; atTimestamp?: number; mode?: "latest" | "history" | "at-time"; minConfidence?: number; queryHint?: string; scopeMode?: "strict" | "soft"; crossProject?: boolean; epochAnchor?: string }): Promise<Fact[]> => {
            const start = performance.now();
            const cleanQuery = query.replace(/[^\w\uAC00-\uD7A3\s]/g, " ").trim();
            const tokens = cleanQuery.split(/\s+/).filter(t => t.length > 0);
            const ftsQuery = tokens.length > 0 ? tokens.map(t => `${t}*`).join(" OR ") : "*";
            const queryVec = this.embedder ? await this.embedder.embed(query) : null;
            
            // P0-1 FIX: Correcting Tier Selection
            const isBiTemporal = context?.mode === "at-time" || context?.atTimestamp !== undefined;
            const useHot = !deepRecall && !context?.epochAnchor && !isBiTemporal && query.length > 0;
            const limit = topK * 10;
            
            let ftsRows: any[] = [], vecRows: any[] = [];
            if (query.length > 0) {
                ftsRows = (useHot ? this.stmtFtsHot : this.stmtFtsDeep).all(ftsQuery, limit) as any[];
                if (queryVec) vecRows = (useHot ? this.stmtVecHot : this.stmtVecDeep).all(Buffer.from(new Float32Array(queryVec).buffer), limit) as any[];
            }

            const rrfMap = new Map<string, number>();
            const ftsRanks = new Map<number, number>(ftsRows.map((r, i) => [r.rowid, i + 1]));
            if (ftsRows.length > 0) {
                const fids = ftsRows.map(r => r.rowid).join(",");
                const resolved = this.db.prepare(`SELECT rowid, fact_id FROM id_map WHERE fid IN (${fids})`).all() as any[];
                resolved.forEach(r => rrfMap.set(r.fact_id, 1.0 / (60 + (ftsRanks.get(r.rowid) || 60))));
            }
            vecRows.forEach((r, i) => rrfMap.set(r.fact_id, (rrfMap.get(r.fact_id) || 0) + 1.0 / (60 + (i + 1))));

            // Gemini P1 FIX: Gating with relevance if query exists
            const hasMatches = rrfMap.size > 0;
            const now = Date.now();
            const includeSuperseded = context?.mode === "history" || context?.mode === "at-time" || deepRecall || (context?.epochAnchor !== undefined);

            if (query.length > 0 && !hasMatches && !context?.epochAnchor && !isBiTemporal) return [];

            // Gemini P4 FIX: Always use R-Tree for temporal point-in-time checks
            let gate = "WHERE 1=1";
            const gateParams: any[] = [];
            if (hasMatches) {
                const ids = Array.from(rrfMap.keys());
                gate += ` AND id IN (${ids.map(() => "?").join(",")})`;
                gateParams.push(...ids);
            }
            
            if (context?.epochAnchor) {
                const m = this.db.prepare("SELECT * FROM epochs WHERE name LIKE ? LIMIT 1").get(`%${context.epochAnchor}%`) as any;
                if (m) { gate += " AND rowid IN (SELECT id FROM facts_time_idx WHERE min_ts <= ? AND max_ts >= ?)"; gateParams.push(m.end_time || now, m.start_time); }
            } else if (isBiTemporal) {
                const t = context?.atTimestamp ?? now;
                // Use R-Tree for point-in-time too (min_ts <= t AND max_ts >= t)
                gate += " AND rowid IN (SELECT id FROM facts_time_idx WHERE min_ts <= ? AND max_ts >= ?)";
                gateParams.push(t, t);
            }

            const rows = this.db.prepare(`SELECT * FROM facts ${gate} LIMIT ?`).all(...gateParams, topK * 5);

            if (this.kgDirty) await this.getKGState();
            const kg = new KnowledgeGraph(this.kgCache);
            const actMap = new Map(kg.spreadingActivation(tokenize(query), 2, 0.8).map(a => [a.entity.toLowerCase(), a.activation]));

            return rows.map(r => {
                const fact = this.rowToFact(r, rrfMap.get(r.id) || 0);
                for (const ent of fact.entities) {
                    const a = actMap.get(normalize(ent));
                    if (a) fact.relevanceScore! += a * 2.0;
                }
                return fact;
            }).filter(f => (includeSuperseded || f.status === "active") && (f.relevanceScore! > 0 || isBiTemporal || deepRecall))
              .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)).slice(0, topK);
        },
        decay: async (now: number): Promise<number> => {
            const facts = this.db.prepare("SELECT id, last_accessed, strength FROM facts WHERE status = 'active'").all() as any[];
            let count = 0;
            this.db.transaction(() => {
                for (const f of facts) {
                    const newStrength = calculateStrength(f.strength, f.last_accessed, now);
                    if (newStrength < 0.1) {
                        this.db.prepare("UPDATE facts SET strength = ?, status = 'archived' WHERE id = ?").run(newStrength, f.id);
                        count++;
                    } else {
                        this.db.prepare("UPDATE facts SET strength = ? WHERE id = ?").run(newStrength, f.id);
                    }
                }
                this.db.exec("DELETE FROM vec_facts_hot WHERE fact_id IN (SELECT id FROM facts WHERE strength < 0.4)");
                this.db.exec("DELETE FROM facts_fts_hot WHERE rowid IN (SELECT rowid FROM facts WHERE strength < 0.4)");
            })();
            return count;
        },
        associate: async (entityA: string, entityB: string, weight = 0.05): Promise<void> => {
            const now = Date.now(), a = normalize(entityA), b = normalize(entityB);
            this.db.transaction(() => {
                this.db.prepare("INSERT INTO kg_nodes (name, last_seen) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET frequency = frequency + 1, last_seen = ?").run(a, now, now);
                this.db.prepare("INSERT INTO kg_nodes (name, last_seen) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET frequency = frequency + 1, last_seen = ?").run(b, now, now);
                this.db.prepare("INSERT INTO kg_edges (source, target, weight, last_strengthened) VALUES (?, ?, ?, ?) ON CONFLICT(source, target) DO UPDATE SET weight = MIN(1.0, weight + ?), last_strengthened = ?").run(a, b, weight, now, weight, now);
            })();
            this.kgDirty = true;
        },
        getAll: async (): Promise<Fact[]> => { return (this.db.prepare("SELECT * FROM facts").all() as any[]).map(r => this.rowToFact(r)); },
        delete: async (id: string): Promise<boolean> => {
            const row = this.db.prepare("SELECT rowid FROM facts WHERE id = ?").get(id) as any;
            if (!row) return false;
            this.db.transaction(() => { this.db.prepare("DELETE FROM facts WHERE id = ?").run(id); this.db.prepare("DELETE FROM id_map WHERE fact_id = ?").run(id); this.db.prepare("DELETE FROM facts_time_idx WHERE id = ?").run(row.rowid); this.db.prepare("DELETE FROM facts_fts WHERE rowid = ?").run(row.rowid); this.db.prepare("DELETE FROM facts_fts_hot WHERE rowid = ?").run(row.rowid); this.db.prepare("DELETE FROM vec_facts WHERE fact_id = ?").run(id); this.db.prepare("DELETE FROM vec_facts_hot WHERE fact_id = ?").run(id); })();
            this.kgDirty = true; return true;
        }
    };

    procedural = {
        getSkill: async (name: string): Promise<Skill | null> => { const r = this.db.prepare("SELECT * FROM skills WHERE name = ?").get(name) as any; return r ? { id: r.id, name: r.name, description: r.description, usageCount: r.usage_count, successCount: r.success_count, lastUsed: r.last_used } as any : null; },
        recordOutcome: async (name: string, success: boolean): Promise<void> => { this.db.prepare("INSERT INTO skills (name, usage_count, success_count, last_used) VALUES (?, 1, ?, ?) ON CONFLICT(name) DO UPDATE SET usage_count = usage_count + 1, success_count = success_count + ?, last_used = ?").run(name, success ? 1 : 0, Date.now(), success ? 1 : 0, Date.now()); },
        learnFromFailure: async (reflection: Reflection): Promise<void> => { this.db.prepare("INSERT INTO reflections (id, content, timestamp, importance) VALUES (?, ?, ?, ?)").run(randomUUID(), JSON.stringify(reflection), reflection.timestamp, 0.5); },
        getReflections: async (task: string, topK: number): Promise<Reflection[]> => { const rows = this.db.prepare("SELECT content FROM reflections WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?").all(`%${task}%`, topK) as any[]; return rows.map(r => JSON.parse(r.content)); }
    };

    async upsertEpoch(epoch: Epoch): Promise<void> { this.db.prepare("INSERT INTO epochs (id, name, description, start_time, end_time, source_episode_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, start_time=excluded.start_time, end_time=excluded.end_time").run(epoch.id, epoch.name, epoch.description, epoch.start, epoch.end, epoch.sourceEpisodeId); }
    async getEpochs(): Promise<Epoch[]> { return (this.db.prepare("SELECT * FROM epochs").all() as any[]).map(r => ({ id: r.id, name: r.name, description: r.description, start: r.start_time, end: r.end_time, source_episode_id: r.source_episode_id })); }
    async getHubs(): Promise<Record<string, { frequency: number }>> {
        const rows = this.db.prepare("SELECT name, frequency FROM kg_nodes ORDER BY frequency DESC LIMIT 50").all() as any[];
        const hubs: Record<string, { frequency: number }> = {};
        for (const r of rows) hubs[r.name] = { frequency: r.frequency };
        return hubs;
    }
    async getKGState(): Promise<any> {
        if (!this.kgDirty && this.kgCache) return this.kgCache;
        const nodes = this.db.prepare("SELECT * FROM kg_nodes").all() as any[], edges = this.db.prepare("SELECT * FROM kg_edges").all() as any[], state = emptyKGState();
        for (const n of nodes) state.nodes[n.name] = { name: n.name, frequency: n.frequency, lastSeen: n.last_seen };
        for (const e of edges) state.edges[`${e.source}::${e.target}`] = { from: e.source, to: e.target, weight: e.weight, lastStrengthened: e.last_strengthened };
        this.kgCache = state; this.kgDirty = false; return state;
    }
    async consolidate(): Promise<ConsolidationResult> { return { episodesProcessed: 0, factsCreated: 0, factsUpdated: 0, memoriesPruned: 0, associationsUpdated: 0 }; }
    
    // Gemini P2 FIX: Memory-efficient chunked export to avoid OOM
    async export(password: string): Promise<Uint8Array> {
        const episodes = this.db.prepare("SELECT * FROM episodes").all();
        const facts = this.db.prepare("SELECT * FROM facts").all();
        const data = JSON.stringify({ episodes, facts, epochs: this.db.prepare("SELECT * FROM epochs").all(), kg_nodes: this.db.prepare("SELECT * FROM kg_nodes").all(), kg_edges: this.db.prepare("SELECT * FROM kg_edges").all() });
        const salt = randomBytes(16), iv = randomBytes(12);
        const key = await pbkdf2Async(password, salt, 200000, 32, "sha256");
        const cipher = createCipheriv("aes-256-gcm", key, iv);
        const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();
        const header = Buffer.alloc(49);
        header.write("NAIA", 0); header.writeUInt8(1, 4); salt.copy(header, 5); iv.copy(header, 21); tag.copy(header, 33);
        return Buffer.concat([header, encrypted]);
    }
    
    async import(blob: Uint8Array, password: string): Promise<void> {
        const buf = Buffer.from(blob);
        if (buf.toString("utf8", 0, 4) !== "NAIA") throw new Error("Invalid format");
        const salt = buf.subarray(5, 21), iv = buf.subarray(21, 33), tag = buf.subarray(33, 49), ciphertext = buf.subarray(49);
        const key = await pbkdf2Async(password, salt, 200000, 32, "sha256");
        const decipher = createDecipheriv("aes-256-gcm", key, iv); decipher.setAuthTag(tag);
        const data = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
        this.db.transaction(() => {
            this.db.exec("DELETE FROM episodes; DELETE FROM facts; DELETE FROM id_map; DELETE FROM facts_time_idx; DELETE FROM vec_facts; DELETE FROM facts_fts; DELETE FROM vec_facts_hot; DELETE FROM facts_fts_hot;");
            for (const e of data.episodes) this.episode.store(e);
            for (const f of data.facts) this.semantic.upsert(this.rowToFact(f));
        })();
    }

    async close(): Promise<void> { this.db.close(); }
    private rowToEpisode(r: any): Episode { return { id: r.id, content: r.content, timestamp: r.timestamp, role: r.role as any, consolidated: !!r.consolidated, importance: { utility: r.importance_utility, emotion: r.importance_emotion }, encodingContext: JSON.parse(r.encoding_context || "{}") }; }
    private rowToFact(r: any, score?: number): Fact { return { id: r.id, content: r.content, entities: JSON.parse(r.entities || "[]"), topics: JSON.parse(r.topics || "[]"), importance: r.importance, maxEmotion: r.max_emotion, strength: r.strength, status: r.status as any, createdAt: r.created_at, updatedAt: r.updated_at, lastAccessed: r.last_accessed, recallCount: r.recall_count, validFrom: r.valid_from, validTo: r.valid_to, successorId: r.successor_id, supersedes: r.supersedes, sourceEpisodes: JSON.parse(r.source_episodes || "[]"), encodingContext: JSON.parse(r.encoding_context || "{}"), relevanceScore: score }; }
}
