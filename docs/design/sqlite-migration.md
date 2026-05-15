# Design Doc: SQLite Hybrid Engine (Scalability Hardening) v2

**Status**: Hardened (Post-Peer Review)  
**Goal**: Transition to a high-performance relational/vector hybrid engine capable of 1,000,000+ facts while maintaining cognitive integrity and explaining every ranking decision.

---

## 1. Schema Design (Hardened)

### A. Core Tables
- **Episodes**: (Standard relational)
- **Facts**: Added `base_id` indexing and `status_state` enum for consolidation safety.
- **Epochs**: (Standard relational)

### B. Bi-temporal R-Tree Indexing (New)
To solve the $O(N)$ scanning issue of time ranges, we will use the **R-Tree extension**.
- `facts_time_idx` (VIRTUAL TABLE using rtree): Maps `rowid` to `[valid_from, valid_to]`.
- This enables $O(\log N)$ spatial queries for temporal overlaps, crucial for long-term persona continuity.

### C. Native Vector Search (New)
Instead of fetching BLOBs to Node.js memory:
- **Requirement**: Investigate `sqlite-vec` or `sqlite-vss` integration with `better-sqlite3`.
- **Fallback**: If extensions are blocked, use `better-sqlite3` custom functions (C++ side) to perform dot-product/cosine without crossing the FFI boundary for every row.

### D. FTS5 & RRF Integration
- Use **FTS5** with `bm25()` scoring.
- Implement **RRF (Reciprocal Rank Fusion)** at the SQL query level (via CTEs) to ensure the 랭킹 is mathematically sound and "honest" (no arbitrary magic-number additions).

---

## 2. Integrity & State Machine

To prevent "Cognitive Drift" (data/insight mismatch):
- **Consolidation State**:
  1. `PENDING`: Episode ready for distillation.
  2. `IN_PROGRESS`: LLM is processing.
  3. `COMMITTING`: Writing to SQLite (within a transaction).
  4. `COMPLETED`: Episode marked as consolidated + source archived.
- **WAL Mode**: Enable Write-Ahead Logging to ensure crash-safe atomic updates of the Knowledge Graph and Fact store.

## 3. Implementation Action Items

1. **Step 2.1**: Prototype R-Tree temporal search.
2. **Step 2.2**: Benchmark `sqlite-vec` vs optimized BLOB retrieval.
3. **Step 2.3**: Update `LocalAdapter` to `SqliteAdapter` with Zero-Clobber migration.

---

## 4. External AI Peer Review (Loop 2)

This v2 design addresses all Loop 1 criticisms. Implementation will begin only after the board confirms the "technical substance" of the R-Tree and State Machine sections.
