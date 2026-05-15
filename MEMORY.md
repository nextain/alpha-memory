# Naia Memory Scalability & Technical Debt Ledger

## Current Ceiling (v5.1)
- **Data Scale**: Optimized for 100k facts. Performance decays linearly beyond this.
- **Latency**: 24ms @ 100k (Surface Recall). Estimated 300ms+ @ 1M.
- **Concurrency**: Zero. Synchronous `better-sqlite3` blocks the entire process.

## 🔴 Critical Debt (v6.0 Targets)
1. **Vector Scan O(N)**: `vec0` lacks HNSW/IVF. 1M facts will breach the 100ms barrier.
2. **Synchronous Blocking**: Long-running FTS/Decay freezes Naia OS main thread.
3. **KG RAM Bound**: `getKGState` loads full graph. 1M nodes will cause OOM.
4. **Virtual Table Desync**: Implicit RowID mapping is fragile without DB triggers.

## 🛠️ Breakthrough Roadmap
- [ ] Implement Worker-Thread Pool for Async SQLite access.
- [ ] Spike: Replace `vec0` with an ANN indexer (HNSW) for O(log N) vector recall.
- [ ] Implement incremental Knowledge Graph loading/paging.
- [ ] Add Database Triggers to enforce atomic consistency across FTS/Vector/Facts.

## Verification Log
- 2026-05-15: v5.1 Hardened SQLite verified @ 100k/24ms. Blockers identified by adversarial review.
