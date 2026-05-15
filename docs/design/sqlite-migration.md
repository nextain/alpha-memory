# Design Doc: SQLite Hybrid Engine (Scalability Hardening)

**Status**: Draft (Step 1 of Issue #221)  
**Goal**: Transition from JSON-based storage to a relational SQLite-based hybrid engine to support 10,000+ facts without cognitive drift or performance loss.

---

## 1. Schema Design (Relational + Cognitive)

To support our "Gold Standard" cognitive features (Epochs, Flashbulb Memory, Bi-temporal tracking), we require a structured schema.

### A. Episodes Table
Stores raw interaction logs.
- `id` (TEXT, PK): UUID
- `content` (TEXT): Raw message
- `timestamp` (INTEGER): ms unix epoch
- `role` (TEXT): user/assistant/tool
- `consolidated` (BOOLEAN): Extraction status
- `importance_utility` (REAL): Importance score
- `importance_emotion` (REAL): Emotional valence
- `encoding_context` (TEXT): JSON blob of project, sessionId, etc.

### B. Facts Table
Stores distilled knowledge with bi-temporal versioning support.
- `id` (TEXT, PK): Unique version ID (e.g., `base-v1`)
- `base_id` (TEXT): ID shared across versions of the same fact
- `content` (TEXT): The fact itself
- `entities` (TEXT): JSON array of normalized entities
- `topics` (TEXT): JSON array of topics
- `importance` (REAL): Current utility
- `max_emotion` (REAL): Flashbulb trigger (highest recorded emotion)
- `strength` (REAL): Ebbinghaus decay value
- `status` (TEXT): 'active', 'superseded', 'archived'
- `created_at` (INTEGER)
- `updated_at` (INTEGER)
- `last_accessed` (INTEGER)
- `recall_count` (INTEGER)
- `valid_from` (INTEGER): Start of temporal validity
- `valid_to` (INTEGER): End of temporal validity (NULL if ongoing)
- `successor_id` (TEXT): Pointer to newer version
- `supersedes` (TEXT): Pointer to older version

### C. Embeddings Table
Decoupled vector storage.
- `id` (TEXT, PK): References Fact or Episode ID
- `vector` (BLOB): Float32Array serialized vector
- `target_type` (TEXT): 'fact' or 'episode'

### D. Epochs Table
Significant life periods.
- `id` (TEXT, PK)
- `name` (TEXT): e.g., 'Before the move'
- `description` (TEXT)
- `start_time` (INTEGER)
- `end_time` (INTEGER, NULLABLE)
- `source_episode_id` (TEXT): Linking back to the event that defined the epoch

### E. Knowledge Graph (Nodes & Edges)
- `nodes`: `name` (PK), `frequency`, `last_seen`
- `edges`: `source`, `target`, `weight`, `last_strengthened`

### F. Keyword Search (FTS5)
- `facts_fts`: Virtual table indexing Fact content, entities, and topics for BM25.

---

## 2. Algorithmic Integrity (Self-Rigorous Approach)

We will avoid "SQLite hacks" and focus on:
1. **Range-Overlap Recall**: SQL implementation of `(valid_from <= actual_end AND valid_to >= start)`.
2. **Flashbulb SQL Ranking**: A hybrid ORDER BY clause reflecting non-linear gating:
   ```sql
   ORDER BY (max_emotion >= 0.8) DESC, relevance_score DESC
   ```
3. **Transparent Consolidation**: Atomic transactions for distilling facts to ensure "the power of forgetting" never results in data loss.

## 3. Next Step: External AI Peer Review

This design will be submitted to the simulated Claude/Codex board for adversarial review before implementation starts.
