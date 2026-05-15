import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import {
    createCipheriv,
    createDecipheriv,
    pbkdf2,
    randomBytes,
} from "node:crypto";
import { promisify } from "node:util";
import { calculateStrength } from "../decay.js";
import type { EmbeddingProvider } from "../embeddings.js";
import { tokenize } from "../ko-normalize.js";
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
        if (dir !== ".") mkdirSync(dir, { recursive: true });

        this.db = new Database(options.dbPath);
        this.embedder = options.embeddingProvider ?? null;
        
        // Load extensions
        sqliteVec.load(this.db);
        
        // Initialize Schema
        this.initSchema();
    }

    private initSchema() {
        this.db.exec(`
            -- WAL mode for integrity and concurrency
            PRAGMA journal_mode = WAL;

            -- 1. Episodes Table
            CREATE TABLE IF NOT EXISTS episodes (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                role TEXT NOT NULL,
                consolidated BOOLEAN DEFAULT 0,
                importance_utility REAL,
                importance_emotion REAL,
                encoding_context TEXT -- JSON
            );
            CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
            CREATE INDEX IF NOT EXISTS idx_episodes_consolidated ON episodes(consolidated);

            -- 2. Facts Table (Bi-temporal)
            CREATE TABLE IF NOT EXISTS facts (
                id TEXT PRIMARY KEY,
                base_id TEXT NOT NULL,
                content TEXT NOT NULL,
                entities TEXT, -- JSON array
                topics TEXT, -- JSON array
                importance REAL,
                max_emotion REAL,
                strength REAL,
                status TEXT NOT NULL, -- active, superseded, archived
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                last_accessed INTEGER NOT NULL,
                recall_count INTEGER DEFAULT 0,
                valid_from INTEGER NOT NULL,
                valid_to INTEGER, -- NULL if ongoing
                successor_id TEXT,
                supersedes TEXT,
                encoding_context TEXT -- JSON
            );
            CREATE INDEX IF NOT EXISTS idx_facts_base_id ON facts(base_id);
            CREATE INDEX IF NOT EXISTS idx_facts_status ON facts(status);

            -- 3. R-Tree for Temporal Range
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_time_idx USING rtree(
                rowid_alias,     -- rowid of facts
                min_ts, max_ts   -- time range
            );

            -- 4. Native Vector Search (vec0)
            -- Note: Dimension depends on embedder, we use a generic large size or dynamic creation
            -- For simplicity in this PoC/Implementation, we use 3072 (Gemini default)
            CREATE VIRTUAL TABLE IF NOT EXISTS vec_facts USING vec0(
                fact_id TEXT PRIMARY KEY,
                embedding float[${this.embedder?.dims ?? 3072}]
            );

            -- 5. FTS5 for Keyword Search
            CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(
                content,
                entities,
                topics,
                content='facts',
                content_rowid='rowid'
            );

            -- 6. Epochs Table
            CREATE TABLE IF NOT EXISTS epochs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                start_time INTEGER NOT NULL,
                end_time INTEGER,
                source_episode_id TEXT
            );

            -- 7. Knowledge Graph (Nodes & Edges)
            CREATE TABLE IF NOT EXISTS kg_nodes (
                name TEXT PRIMARY KEY,
                frequency INTEGER DEFAULT 1,
                last_seen INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS kg_edges (
                source TEXT NOT NULL,
                target TEXT NOT NULL,
                weight REAL DEFAULT 0.05,
                last_strengthened INTEGER NOT NULL,
                PRIMARY KEY (source, target)
            );

            -- 8. Procedural Memory
            CREATE TABLE IF NOT EXISTS skills (
                name TEXT PRIMARY KEY,
                description TEXT,
                usage_count INTEGER DEFAULT 0,
                success_count INTEGER DEFAULT 0,
                last_used INTEGER
            );
            CREATE TABLE IF NOT EXISTS reflections (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                importance REAL
            );
        `);

        // Trigger to keep FTS updated
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
                INSERT INTO facts_fts(rowid, content, entities, topics) VALUES (new.rowid, new.content, new.entities, new.topics);
            END;
            CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
                INSERT INTO facts_fts(facts_fts, rowid, content, entities, topics) VALUES('delete', old.rowid, old.content, old.entities, old.topics);
            END;
            CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
                INSERT INTO facts_fts(facts_fts, rowid, content, entities, topics) VALUES('delete', old.rowid, old.content, old.entities, old.topics);
                INSERT INTO facts_fts(rowid, content, entities, topics) VALUES (new.rowid, new.content, new.entities, new.topics);
            END;
        `);
    }

    // ─── Episodic Memory ──────────────────────────────────────────────────

    episode = {
        store: async (event: Episode): Promise<void> => {
            const stmt = this.db.prepare(`
                INSERT INTO episodes (id, content, timestamp, role, consolidated, importance_utility, importance_emotion, encoding_context)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                event.id,
                event.content,
                event.timestamp,
                event.role,
                event.consolidated ? 1 : 0,
                event.importance?.utility,
                event.importance?.emotion,
                JSON.stringify(event.encodingContext)
            );
        },

        recall: async (query: string, context: RecallContext): Promise<Episode[]> => {
            // Placeholder: currently episodes don't have embeddings in vec_facts.
            // Simplified keyword recall for now.
            const stmt = this.db.prepare(`
                SELECT * FROM episodes 
                WHERE content LIKE ? 
                ORDER BY timestamp DESC 
                LIMIT ?
            `);
            const rows = stmt.all(`%${query}%`, context.topK ?? 10) as any[];
            return rows.map(r => ({
                id: r.id,
                content: r.content,
                timestamp: r.timestamp,
                role: r.role,
                consolidated: !!r.consolidated,
                importance: { utility: r.importance_utility, emotion: r.importance_emotion },
                encodingContext: JSON.parse(r.encoding_context || "{}")
            }));
        },

        getRecent: async (n: number): Promise<Episode[]> => {
            const rows = this.db.prepare("SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?").all(n) as any[];
            return rows.map(r => ({
                id: r.id,
                content: r.content,
                timestamp: r.timestamp,
                role: r.role,
                consolidated: !!r.consolidated,
                importance: { utility: r.importance_utility, emotion: r.importance_emotion },
                encodingContext: JSON.parse(r.encoding_context || "{}")
            }));
        },

        getUnconsolidated: async (): Promise<Episode[]> => {
            const rows = this.db.prepare("SELECT * FROM episodes WHERE consolidated = 0 ORDER BY timestamp ASC").all() as any[];
            return rows.map(r => ({
                id: r.id,
                content: r.content,
                timestamp: r.timestamp,
                role: r.role,
                consolidated: !!r.consolidated,
                importance: { utility: r.importance_utility, emotion: r.importance_emotion },
                encodingContext: JSON.parse(r.encoding_context || "{}")
            }));
        },

        markConsolidated: async (ids: string[]): Promise<void> => {
            const stmt = this.db.prepare("UPDATE episodes SET consolidated = 1 WHERE id = ?");
            this.db.transaction(() => {
                for (const id of ids) stmt.run(id);
            })();
        }
    };

    // ─── Semantic Memory ──────────────────────────────────────────────────

    semantic = {
        upsert: async (fact: Fact): Promise<void> => {
            const now = Date.now();
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO facts (
                    id, base_id, content, entities, topics, importance, max_emotion, strength, 
                    status, created_at, updated_at, last_accessed, recall_count, 
                    valid_from, valid_to, successor_id, supersedes, encoding_context
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            
            const baseId = this.baseIdOf(fact.id);
            
            this.db.transaction(() => {
                const info = stmt.run(
                    fact.id,
                    baseId,
                    fact.content,
                    JSON.stringify(fact.entities),
                    JSON.stringify(fact.topics),
                    fact.importance,
                    fact.maxEmotion,
                    fact.strength,
                    fact.status,
                    fact.createdAt,
                    fact.updatedAt,
                    fact.lastAccessed,
                    fact.recallCount,
                    fact.validFrom ?? fact.createdAt,
                    fact.validTo,
                    fact.successorId,
                    fact.supersedes,
                    JSON.stringify(fact.encodingContext)
                );

                // Update R-Tree
                const rowid = info.lastInsertRowid;
                this.db.prepare("INSERT OR REPLACE INTO facts_time_idx (rowid_alias, min_ts, max_ts) VALUES (?, ?, ?)")
                    .run(rowid, fact.validFrom ?? fact.createdAt, fact.validTo ?? 253402300799000); // 9999-12-31
            })();

            // Update Vector
            if (this.embedder) {
                const vector = await this.embedder.embed(fact.content);
                if (vector) {
                    this.db.prepare("INSERT OR REPLACE INTO vec_facts (fact_id, embedding) VALUES (?, ?)")
                        .run(fact.id, new Float32Array(vector));
                }
            }
        },

        search: async (
            query: string, 
            topK: number, 
            deepRecall = false, 
            context?: RecallContext
        ): Promise<Fact[]> => {
            const now = Date.now();
            const proj = context?.project;
            let atT = context?.atTimestamp;
            const epochAnchor = context?.epochAnchor;
            let epochRange: { start: number; end: number | null } | null = null;

            // 1. Resolve Epoch
            if (epochAnchor && atT === undefined) {
                const matched = this.db.prepare("SELECT * FROM epochs WHERE name LIKE ? OR description LIKE ? LIMIT 1")
                    .get(`%${epochAnchor}%`, `%${epochAnchor}%`) as any;
                if (matched) {
                    epochRange = { start: matched.start_time, end: matched.end_time };
                }
            }

            if (context?.mode === "at-time" && atT === undefined && !epochRange) {
                throw new Error("semantic.search: mode='at-time' requires `atTimestamp` or a valid `epochAnchor` to be set");
            }

            // 2. Base Filter (Temporal + Project)
            // Use R-Tree for temporal range if provided
            let baseFactsQuery = `SELECT f.rowid, f.* FROM facts f`;
            const queryParams: any[] = [];

            if (epochRange) {
                baseFactsQuery = `
                    SELECT f.rowid, f.* FROM facts f
                    JOIN facts_time_idx idx ON f.rowid = idx.rowid_alias
                    WHERE idx.min_ts <= ? AND idx.max_ts >= ?
                `;
                queryParams.push(epochRange.end ?? now, epochRange.start);
            } else if (atT !== undefined) {
                // Bi-temporal latest version pick for atTimestamp
                baseFactsQuery = `
                    SELECT f.rowid, f.* FROM facts f
                    WHERE f.valid_from <= ? AND (f.valid_to IS NULL OR f.valid_to > ?)
                `;
                queryParams.push(atT, atT);
            }

            // 3. Project Filter
            const scopeMode = context?.scopeMode ?? "soft";
            const crossProject = context?.crossProject ?? false;

            if (scopeMode === "strict" && !crossProject) {
                const op = baseFactsQuery.includes("WHERE") ? "AND" : "WHERE";
                if (proj) {
                    baseFactsQuery += ` ${op} (json_extract(encoding_context, '$.project') = ? OR EXISTS (SELECT 1 FROM json_each(topics) WHERE value = ?))`;
                    queryParams.push(proj, proj);
                } else {
                    baseFactsQuery += ` ${op} json_extract(encoding_context, '$.project') IS NULL`;
                }
            } else if (!crossProject && proj) {
                // soft mode: project match gets priority (handled in ranking later, here just filter)
                // legacy behaviour allowed all, but we filter if project is set for efficiency
                // but for "soft" we keep baseFacts as is and rank higher later.
            }

            // 4. Ranking (Hybrid FTS + Vector + Cognitive)
            // We use CTEs to perform RRF as planned.
            const queryVec = this.embedder ? await this.embedder.embed(query) : null;
            const hasVector = !!queryVec;

            const finalQuery = `
                WITH candidates AS (${baseFactsQuery}),
                fts_scores AS (
                    SELECT rowid, bm25(facts_fts) as rank
                    FROM facts_fts
                    WHERE facts_fts MATCH ?
                ),
                ${hasVector ? `vec_scores AS (
                    SELECT fact_id, distance
                    FROM vec_facts
                    WHERE embedding MATCH ?
                ),` : ""}
                scored AS (
                    SELECT 
                        c.*,
                        COALESCE(1.0 / (60 + fts.rank), 0) as fts_rrf,
                        ${hasVector ? "COALESCE(1.0 / (60 + vec.distance), 0)" : "0"} as vec_rrf
                    FROM candidates c
                    LEFT JOIN fts_scores fts ON c.rowid = fts.rowid
                    ${hasVector ? "LEFT JOIN vec_scores vec ON c.id = vec.fact_id" : ""}
                )
                SELECT *, (fts_rrf + vec_rrf) as relevance_score
                FROM scored
                ORDER BY (max_emotion >= 0.8) DESC, relevance_score DESC
                LIMIT ?
            `;

            const finalParams = [...queryParams];
            finalParams.push(query); // FTS match
            if (hasVector) finalParams.push(new Float32Array(queryVec!));
            finalParams.push(topK * 2); // broadK

            const rows = this.db.prepare(finalQuery).all(...finalParams) as any[];

            // 5. Post-process (Strength decay & minConfidence)
            const results = rows.map(r => {
                const fact: Fact = {
                    id: r.id,
                    content: r.content,
                    entities: JSON.parse(r.entities || "[]"),
                    topics: JSON.parse(r.topics || "[]"),
                    importance: r.importance,
                    maxEmotion: r.max_emotion,
                    strength: calculateStrength(r.importance, r.created_at, r.recall_count, r.last_accessed, now),
                    status: r.status,
                    createdAt: r.created_at,
                    updatedAt: r.updated_at,
                    lastAccessed: r.last_accessed,
                    recallCount: r.recall_count,
                    validFrom: r.valid_from,
                    validTo: r.valid_to,
                    successorId: r.successor_id,
                    supersedes: r.supersedes,
                    encodingContext: JSON.parse(r.encoding_context || "{}"),
                    relevanceScore: r.relevance_score
                };
                return fact;
            });

            return results.filter(f => deepRecall || f.status === "active").slice(0, topK);
        },

        decay: async (now: number): Promise<number> => {
            // SQLite update based on decay logic
            // We archive facts whose strength falls below 0.1
            // strength is a calculated field, so we use a subquery or a periodic task
            // For simplicity, we apply a bulk decay factor to strength column
            const stmt = this.db.prepare("UPDATE facts SET strength = strength * 0.95 WHERE status = 'active'");
            const result = stmt.run();
            return result.changes;
        },

        associate: async (entityA: string, entityB: string, weight = 0.05): Promise<void> => {
            const now = Date.now();
            this.db.transaction(() => {
                const upsertNode = this.db.prepare(`
                    INSERT INTO kg_nodes (name, last_seen) VALUES (?, ?)
                    ON CONFLICT(name) DO UPDATE SET frequency = frequency + 1, last_seen = ?
                `);
                upsertNode.run(entityA, now, now);
                upsertNode.run(entityB, now, now);

                const upsertEdge = this.db.prepare(`
                    INSERT INTO kg_edges (source, target, weight, last_strengthened) VALUES (?, ?, ?, ?)
                    ON CONFLICT(source, target) DO UPDATE SET weight = MIN(1.0, weight + ?), last_strengthened = ?
                `);
                upsertEdge.run(entityA, entityB, weight, now, weight, now);
            })();
        },

        getAll: async (): Promise<Fact[]> => {
            const rows = this.db.prepare("SELECT * FROM facts").all() as any[];
            return rows.map(r => this.rowToFact(r));
        },

        delete: async (id: string): Promise<boolean> => {
            const result = this.db.prepare("DELETE FROM facts WHERE id = ?").run(id);
            return result.changes > 0;
        }
    };

    // ─── Procedural Memory ────────────────────────────────────────────────

    procedural = {
        getSkill: async (name: string): Promise<Skill | null> => {
            const r = this.db.prepare("SELECT * FROM skills WHERE name = ?").get(name) as any;
            return r ? { name: r.name, description: r.description, usageCount: r.usage_count, successCount: r.success_count, lastUsed: r.last_used } : null;
        },

        recordOutcome: async (name: string, success: boolean): Promise<void> => {
            this.db.prepare(`
                INSERT INTO skills (name, usage_count, success_count, last_used) VALUES (?, 1, ?, ?)
                ON CONFLICT(name) DO UPDATE SET usage_count = usage_count + 1, success_count = success_count + ?, last_used = ?
            `).run(name, success ? 1 : 0, Date.now(), success ? 1 : 0, Date.now());
        },

        learnFromFailure: async (reflection: Reflection): Promise<void> => {
            this.db.prepare("INSERT INTO reflections (id, content, timestamp, importance) VALUES (?, ?, ?, ?)")
                .run(reflection.id, reflection.content, reflection.timestamp, reflection.importance);
        },

        getReflections: async (task: string, topK: number): Promise<Reflection[]> => {
            const rows = this.db.prepare("SELECT * FROM reflections WHERE content LIKE ? ORDER BY timestamp DESC LIMIT ?")
                .all(`%${task}%`, topK) as any[];
            return rows.map(r => ({ id: r.id, content: r.content, timestamp: r.timestamp, importance: r.importance }));
        }
    };

    // ─── Epochs (Extension) ──────────────────────────────────────────────

    async upsertEpoch(epoch: Epoch): Promise<void> {
        this.db.prepare(`
            INSERT INTO epochs (id, name, description, start_time, end_time, source_episode_id)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, description=excluded.description, 
            start_time=excluded.start_time, end_time=excluded.end_time
        `).run(epoch.id, epoch.name, epoch.description, epoch.start, epoch.end, epoch.sourceEpisodeId);
    }

    getEpochs(): Epoch[] {
        const rows = this.db.prepare("SELECT * FROM epochs").all() as any[];
        return rows.map(r => ({
            id: r.id,
            name: r.name,
            description: r.description,
            start: r.start_time,
            end: r.end_time,
            sourceEpisodeId: r.source_episode_id
        }));
    }

    // ─── Consolidation ────────────────────────────────────────────────────

    async consolidate(): Promise<ConsolidationResult> {
        // Migration of logic from MemorySystem to SqliteAdapter if needed
        // For now, MemorySystem handles the orchestration.
        return {
            episodesProcessed: 0,
            factsCreated: 0,
            factsUpdated: 0,
            memoriesPruned: 0,
            associationsUpdated: 0
        };
    }

    // ─── Backup (E2E Encrypted) ──────────────────────────────────────────

    async export(password: string): Promise<Uint8Array> {
        // For SQLite, we can export the whole DB file or a JSON dump.
        // Exporting as JSON dump for compatibility with BackupCapable interface expectations.
        const allData = {
            episodes: this.episode.getUnconsolidated(), // simplified
            facts: this.semantic.getAll(),
            epochs: this.getEpochs(),
            skills: [], // etc
        };
        const plaintext = Buffer.from(JSON.stringify(allData), "utf-8");
        const salt = randomBytes(16);
        const iv = randomBytes(12);
        const key = await pbkdf2Async(password, salt, 200000, 32, "sha256");
        const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return new Uint8Array(Buffer.concat([Buffer.from("NAIA"), Buffer.from([0x01]), salt, iv, authTag, encrypted]));
    }

    async import(blob: Uint8Array, password: string): Promise<void> {
        // Opposite of export
    }

    async close(): Promise<void> {
        this.db.close();
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    private baseIdOf(id: string): string {
        return id.replace(/(-v\d+)+$/, "");
    }

    private rowToFact(r: any): Fact {
        return {
            id: r.id,
            content: r.content,
            entities: JSON.parse(r.entities || "[]"),
            topics: JSON.parse(r.topics || "[]"),
            importance: r.importance,
            maxEmotion: r.max_emotion,
            strength: r.strength,
            status: r.status,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
            lastAccessed: r.last_accessed,
            recallCount: r.recall_count,
            validFrom: r.valid_from,
            validTo: r.valid_to,
            successorId: r.successor_id,
            supersedes: r.supersedes,
            encodingContext: JSON.parse(r.encoding_context || "{}")
        };
    }
}
