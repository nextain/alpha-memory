# Naia Memory

> **자가 개선 철학 (Self-Improvement Philosophy)**:
> - **내부적 엄격함 우선**: SOTA 집착보다 스스로의 기준에 정직한 발전을 지향한다.
> - **적대적 리뷰 루프**: [실험 → 적대적 리뷰 → 정직한 개선 → 동기화] 무한 루프 가동.
>
> **AI Session 시작 시 읽기 순서 (강제, plan-v3-anchor §0 기준)**:
> 1. `GEMINI.md` ← **Gemini 에이전트 필수 독해**
> 2. `MEMORY.md` ← **기술적 부채 및 확장성 로드맵 (v6.0)**
> 3. `docs/integration.md` ← naia-agent 통합 SoT

## 핵심 잠금 사항 (Anti-Drift Anchors, 변경 금지)
>
> 1. **MemoryProvider interface 충실 구현** (`@nextain/agent-types`) — 재정의 X
> 2. **SQLite Hybrid Engine (v5.1) 기준**: FTS5 + vec0 + R-Tree 기반 하이브리드 엔진을 기본으로 사용한다.
> 3. **자연어 의도 파악 및 대화 제어는 naia-agent 책임** — naia-memory 는 인지적 회상/공고화 로직만 담당.
> 4. **로컬 모델 백엔드(ko-serve 등)와 분리**: `naia-minicpm-ko-serve`는 순수 모델 추론만 담당하며, RAG/장기기억 주입은 `naia-agent`가 `naia-memory`를 사용하여 수행한다.

## 🚀 Hardened SQLite Engine (v5.1)
- **Performance**: 24ms retrieval latency @ 100,000 facts.
- **Architecture**: Hybrid FTS5 + vec0 + R-Tree with JS-Level RRF merging.
- **Cognitive Features**: Two-tier recall (Surface/Deep), Flashbulb bypass, Bi-temporal tracking.
- **Security**: AES-256-GCM encrypted backup/import with PBKDF2 (200k iterations).

## 🔴 Technical Debt & v6.0 Roadmap (Scalability)
1. **Vector O(N) Wall**: Replace `vec0` linear scan with ANN (HNSW/Faiss) for 1M+ facts.
2. **Main Thread Blocking**: Implement Worker-Thread pool for asynchronous SQLite operations.
3. **Graph OOM Risk**: Shift KnowledgeGraph to incremental/streaming load for millions of nodes.
4. **Consistency Hardening**: Implement DB Triggers to prevent virtual table desync.

## Project Structure

```
src/
├── memory/                    # Core memory system
│   ├── index.ts               # MemorySystem — main orchestrator
│   ├── types.ts               # Type definitions
│   └── adapters/
│       ├── sqlite.ts          # 고성능 엔진: SQLite + vec0 + FTS5 + R-Tree (v5.1 SoT)
│       └── local.ts           # 레거시 엔진: JSON (참고용)
```

## Latest Benchmark (Hardened v5.1, 2026-05-15)

| Metric | Target | Result | Status |
|---------|----------|-------|:-----:|
| Latency (100k) | < 25ms | **23.86ms** | ✅ PASS |
| Hit Rate (100k) | 100% | **100%** | ✅ PASS |
| Security | AES-256-GCM | Verified | ✅ PASS |

## Phase Progress

| Phase | Status |
|-------|--------|
| R1 안정화 | ✅ 완료 |
| R2 Capability | ✅ 완료 (Bi-temporal, Secure Backup) |
| R3 한국어 강화 | ✅ 완료 |
| R4 Hardening (v5.1) | ✅ 완료 (SQLite Hybrid) |
| R5 1M Scalability | ⏳ v6.0 준비 중 |

## Conventions

- **Self-Rigor Mandate**: Always verify performance on a 100k+ dataset before claiming "improvement."
- **Anti-overfitting**: 범용 단일 전략만 허용, 카테고리별 적응형 가중치 금지
