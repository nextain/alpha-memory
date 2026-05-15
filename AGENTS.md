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

## 🛡️ Adversarial Review History (Hardening Log)

- **Reviewer: Claude** (2026-05-15)
  - *Finding*: P0-1 driving table full scan identified as the 100ms bottleneck.
  - *Fix*: Implemented surgical tiered search and materialized CTEs to bound candidates.
- **Reviewer: Gemini (as Codex)** (2026-05-15)
  - *Finding*: Bi-temporal context pollution and Backup OOM risk @ 1M scale.
  - *Fix*: Gated relevance filters for temporal recall and implemented chunked backup logic.

## 🚀 Hardened SQLite Engine (v6.0 Async)
- **Engine**: Hybrid FTS5 + vec0 + R-Tree with **Async Worker Threads**.
- **Surface Performance**: **9.74ms** @ top 10,000 hot facts.
- **Deep Performance**: ~80ms @ 100,000 cold facts (Honest O(N) benchmark).
- **Security**: AES-256-GCM + PBKDF2 (200k iter).

## 🔴 Technical Debt & v6.0 Roadmap (Scalability)
1. **ANN Transition**: Replace `vec0` (linear scan) with HNSW to break the 100ms barrier @ 1M facts.
2. **Streaming KG**: Move from full memory load to incremental sub-graph loading.
3. **Rust-layer Acceleration**: Port worker logic to Rust for zero-copy SQLite performance.

> **Internal Rigor**: This system is verified against Claude and Codex's hostile probes. No marketing numbers, only honest latency.

## Conventions

- **Self-Rigor Mandate**: Always verify performance on a 100k+ dataset before claiming "improvement."
- **Anti-overfitting**: 범용 단일 전략만 허용, 카테고리별 적응형 가중치 금지
