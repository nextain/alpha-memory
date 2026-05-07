# Naia Memory (formerly Alpha Memory)

> # ✅ STATUS: SHIP-READY for naia-agent integration (2026-05-07)
>
> **Phase A 한국어 R2.3 measurement 완료** (#23):
> - 100 conv (AI Hub 141 한국어 멀티세션 대화), recall@20 cosine 0.7 = **76.8%**
> - keyword 69.1% / polarity-aware 62.8% / cosine 76.8% / no-memory floor 0%
> - LoCoMo 영어 mid-tier (mem0 67% / Letta 74%) 와 *수치 대등*
> - 사용자 directive "1등 X, 한국어 쓸만함" 정확 부합
> - 측정 cost ~$0.5 / 100 conv, naia 2분/conv vs mem0 24분/conv (12x 빠름)
>
> **naia-agent 통합 ready**:
> - `MemoryProvider` interface (@nextain/agent-types) 충실 구현
> - 8 capability + `isCapable<>()` graceful degradation
> - `pnpm smoke:naia-memory` (naia-agent/examples/naia-memory-host.ts) 검증 완료
> - 다음 단계: naia-os#240 의 wire-in (naia-agent 측 작업)
>
> **상세**:
> - `.agents/progress/r2-bench-trust-2026-05-07.md` — Phase A/B/C 분리 path
> - `reports/aihub141-r2-3-reanalysis-100conv.md` — 정직한 multi-metric 재해석
> - `reports/aihub141-r2-3-...-embedding-reanalysis.md` — semantic cosine archive
> - issue #23 — Phase A 결과 + 외부 벤치 비교 archive
>
> ---
>
> # ⚠️ STATUS: PARTIAL OUTDATED (2026-05-03 → 본문)
> **본 문서의 본문은 R5~R14 시기 컨텍스트** (4-store, 12 카테고리 벤치 등). 현재 SoT 와 일부 모순.
> 통합 작업은 R1.4 슬라이스 예정.
>
> **AI Session 시작 시 읽기 순서 (강제, plan-v3-anchor §0 기준)**:
> 1. `.agents/progress/plan-v3-anchor-2026-05-02.md` ← **현 SoT** (모든 작업의 anchor)
> 2. `.agents/progress/decision-matrix.md` ← §A 채택 / §B 거부 / §C pending / §D 신규
> 3. `.agents/progress/gap-analysis-r0-2026-05-02.md` ← 코드 vs plan, 모순 5건
> 4. `.agents/progress/README.md` ← 인덱스 + AI 흔들림 first 참조점
>
> **본 AGENTS.md (이하 본문)** = 참고용 (R5~R14 진행상황). R1.4 통합 후 v3 정식 docs 로 대체.
>
> ## ⚓ AI 흔들림 시 자가 수정 — Quick Reference
>
> | 신호 | 가이드 |
> |------|------|
> | "naia 자체 엔진 강화하자" | decision-matrix §A06 (mem0 stack on top) + plan §2.3 |
> | "v3 레이어 더 만들자" | decision-matrix §B04 (5-layer hybrid 거부) + plan §0.2.2 |
> | "MemoryProvider 새로 정의" | decision-matrix §A01 (기존 채택) + plan §0.1.2 |
> | "mem0 fork 해서 KO fix" | decision-matrix §B01 (fork 금지) + plan §0.2.1 |
> | "naia-memory 가 자연어 파싱" | decision-matrix §B02 (자연어는 agent) + plan §2.2 |
> | "abstention 우리가 결정" | decision-matrix §B03 (응답 결정은 agent) + plan §2.2 |
>
> **규칙**: 큰 의사결정 전 위 항목 적어도 1개 인용 의무.
>
> ## 핵심 잠금 사항 (Anti-Drift Anchors, 변경 금지)
>
> 1. **MemoryProvider interface 충실 구현** (`@nextain/agent-types`) — 재정의 X
> 2. **mem0 위에 stack on top** — 코드 결합 X (사용자 directive 2026-05-02)
> 3. **자연어 의도 파악은 naia-agent 책임** — naia-memory 는 검색 로직만
> 4. **Capability pattern** — `isCapable<>()` graceful degradation
> 5. **Adapter swap 가능** — 어떤 backend 든 contract-tests 통과
>
> ## SoT 우선순위 (현재)
>
> ```
> .agents/progress/plan-v3-anchor-2026-05-02.md  ← 현 SoT
>   > .agents/progress/decision-matrix.md
>   > 본 AGENTS.md (참고용)
> ```
>
> ---

**Cognitive memory architecture for AI agents** — Naia OS의 핵심 메모리 패키지.
importance-gated encoding, vector retrieval, knowledge graph, Ebbinghaus decay, head-to-head benchmark suite.

## Project Structure

```
src/
├── memory/                    # Core memory system
│   ├── index.ts               # MemorySystem — main orchestrator
│   ├── types.ts               # Type definitions
│   ├── importance.ts          # 3-axis scoring (importance × surprise × emotion)
│   ├── decay.ts               # Ebbinghaus forgetting curve
│   ├── reconsolidation.ts     # Contradiction detection on retrieval
│   ├── knowledge-graph.ts     # Entity/relation extraction + spreading activation
│   ├── embeddings.ts          # gemini-embedding-001 (3072d) / multilingual-e5-large (1024d) / offline
│   └── adapters/
│       ├── local.ts           # 독자 엔진: JSON + cosine + BM25 + KG (default, 실제 사용중)
│       ├── mem0.ts            # mem0 OSS backend (존재하나 미사용)
│       └── qdrant.ts          # Qdrant vector DB backend (존재하나 미사용)
├── server/
│   ├── mem0-api.ts            # REST API server (mem0 protocol compatible)
│   └── consolidation-gate.ts  # R1.1 Promise gate — race condition fix
├── benchmark/
│   ├── fact-bank.json         # 1000 Korean facts (fictional persona)
│   ├── fact-bank.en.json      # 1000 English facts
│   ├── query-templates.json   # Korean test queries (12 categories)
│   ├── query-templates.en.json # English test queries
│   ├── criteria.ts            # Scoring criteria
│   └── comparison/            # Benchmark adapters + runner + judge
└── v3/                        # ⚠️ R1.2 정리 대상 — plan §3.7 매핑 참조
```

## Key Commands

```bash
pnpm install

# Benchmark
GEMINI_API_KEY=xxx pnpm exec tsx src/benchmark/comparison/run-comparison.ts --adapters=naia-local --judge=keyword --lang=ko
GEMINI_API_KEY=xxx pnpm exec tsx src/benchmark/comparison/run-comparison.ts --adapters=naia-local --judge=keyword --lang=en

# Tests
pnpm exec vitest run

# Server
PORT=9876 STORE_PATH=/tmp/naia.json pnpm exec tsx src/server/mem0-api.ts
```

## Latest Benchmark — Phase A AI Hub 141 (2026-05-07)

100 conversations × 4 sessions, KO multi-session natural dialogues.

| Metric | naia-local | no-memory | mem0 (1 conv smoke) |
|---|---|---|---|
| recall@20 keyword (loose) | 69.1% | 0% | 70.6% |
| recall@20 polarity-aware | 62.8% | 0% | — |
| **recall@20 cosine 0.7** | **76.8%** | 0% | — |
| recall@5 cosine 0.7 | 44.1% | 0% | — |
| Per-conv elapsed | **2분** | 0초 | **24분 (12x slower)** |
| Per-conv cost (estimated) | $0.005 | $0 | ~$0.05+ |

**External LoCoMo (영어, J-score, 다른 metric — disclaim 필요)**:
mem0 67% / Letta 74% / Zep 66-75% / MemU 92%. naia 76.8% (KO cosine) ≈
mem0/Letta mid-tier baseline 수준.

**상세**: `reports/aihub141-r2-3-reanalysis-100conv.md`,
`reports/aihub141-r2-3-...-embedding-reanalysis.md`,
issue #23.

### 이전 Benchmark (R14, 2026-04-25, archive)

`fact-bank.json` 25 query 측정 — naia-local KO kw 38% / gem 49%.
한계: 합성 contradiction over-fit (#22 retro). Phase A 의 자연 dataset
측정으로 대체.

## Known Issues (Top 3)

1. **unchanged_persistence 1-2/11** — P0 status field로 약간 개선, 근본적 한계
2. **multi_fact_synthesis 0-2/15** — query decomposition 필요 (P4)
3. **temporal 3/20** — TemporalCapable 구현 필요 (R2.3)

## Phase Progress

| Phase | Status |
|-------|--------|
| R1 안정화 (7 slices) | ✅ 완료 |
| R2 Capability (4 slices) | ✅ 완료 |
| R3 한국어 강화 (3/4 slices) | 🔄 R3.3 측정 대기 |
| R4 Multi-adapter | 대기 |
| R5 검증 측정 | 대기 |

## R3.3 Embedding A/B 측정 (API key 필요)

```bash
# 측정 1: 현재 기본 (keyword-only or gemini-embedding)
GEMINI_API_KEY=xxx pnpm exec tsx src/benchmark/comparison/run-comparison.ts --adapters=naia-local --judge=keyword --lang=ko

# 측정 2: multilingual-e5-large (offline, CPU)
NAIA_EMBEDDING=offline-e5 pnpm exec tsx src/benchmark/comparison/run-comparison.ts --adapters=naia-local --judge=keyword --lang=ko
```

결정 기준: e5 ≥ gemini +3pp → e5 기본값, 미만 → gemini 유지

## Conventions

- TypeScript ESM, Node ≥ 22, strict
- Package: `@nextain/naia-memory` (Apache-2.0)
- Commit: Conventional Commits
- **Anti-overfitting**: 범용 단일 전략만 허용, 카테고리별 적응형 가중치 금지
