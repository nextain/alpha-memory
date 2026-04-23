# Alpha Memory

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
│   ├── embeddings.ts          # Gemini text-embedding-004 (768d)
│   └── adapters/
│       ├── local.ts           # SQLite + hnswlib (default, no API key)
│       ├── mem0.ts            # mem0 OSS backend
│       └── qdrant.ts          # Qdrant vector DB backend
├── benchmark/
│   ├── fact-bank.json         # 1000 Korean facts (fictional persona)
│   ├── fact-bank.en.json      # 1000 English facts
│   ├── query-templates.json   # Korean test queries (12 categories)
│   ├── query-templates.en.json # English test queries
│   ├── criteria.ts            # Scoring criteria
│   └── comparison/
│       ├── run-comparison.ts  # Main benchmark runner
│       ├── types.ts           # BenchmarkAdapter interface
│       ├── judge.ts           # Standalone re-judge script
│       ├── adapter-naia.ts    # Alpha Memory adapter
│       ├── adapter-mem0.ts    # mem0 OSS
│       ├── adapter-sillytavern.ts
│       ├── adapter-letta.ts
│       ├── adapter-graphiti.ts   # Graphiti (getzep/graphiti) — Neo4j temporal KG
│       ├── adapter-openclaw.ts
│       ├── adapter-sap.ts
│       ├── adapter-open-llm-vtuber.ts
│       ├── adapter-starnion.ts   # Starnion (구 jikime-mem) — SQLite + ChromaDB
│       └── adapter-no-memory.ts  # 베이스라인 (project-airi, memory 없음)
```

## 4-Store Architecture

| Store | Brain Analog | What it holds |
|-------|-------------|--------------|
| **Episodic** | Hippocampus | Timestamped events with full context |
| **Semantic** | Neocortex | Facts, entities, relationships |
| **Procedural** | Basal Ganglia | Skills, strategies, learned patterns |
| **Working** | Prefrontal Cortex | Active context (managed externally) |

## Key Commands

```bash
# Install
pnpm install

# Run benchmark (Korean, keyword judge)
GEMINI_API_KEY=xxx pnpm exec tsx src/benchmark/comparison/run-comparison.ts --adapters=naia,mem0 --judge=keyword --lang=ko

# Run benchmark (English, with gateway)
GATEWAY_URL=xxx GATEWAY_MASTER_KEY=xxx pnpm exec tsx src/benchmark/comparison/run-comparison.ts --adapters=naia --judge=keyword --lang=en

# Re-judge existing results
pnpm exec tsx src/benchmark/comparison/judge.ts --input=reports/xxx.json --judge=gemini-pro-cli
pnpm exec tsx src/benchmark/comparison/judge.ts --input=reports/xxx.json --judge=claude-cli
pnpm exec tsx src/benchmark/comparison/judge.ts --input=reports/xxx.json --judge=glm-api
pnpm exec tsx src/benchmark/comparison/judge.ts --input=reports/xxx.json --judge=keyword
```

## Benchmark Categories (12)

| Category | What it tests |
|----------|--------------|
| direct_recall | 직접 사실 회상 |
| semantic_search | 의미 기반 검색 |
| proactive_recall | 선제적 기억 제안 |
| abstention | 모르는 건 모른다고 함 (환각 방지) |
| irrelevant_isolation | 무관한 질문에 개인정보 삽입 안 함 |
| multi_fact_synthesis | 여러 기억 조합 |
| entity_disambiguation | 동명이인/맥락 구분 |
| contradiction_direct | 직접적 모순 처리 |
| contradiction_indirect | 간접적 모순 처리 |
| noise_resilience | 노이즈 속 정보 회상 |
| unchanged_persistence | 업데이트 후 안 바뀐 기억 유지 |
| temporal | 시간 관련 기억 (과거 상태 회상) |

## Judge Modes

| Mode | How | Speed |
|------|-----|-------|
| keyword | exact/substring match | instant |
| gemini-pro-cli | gemini CLI (batch 10) | fast |
| glm-api | Z.AI API direct (batch 10) | fast |
| claude-opus-cli | claude CLI (batch 10) | fast |

**CRITICAL: 모든 judge(GLM, Gemini, Claude)는 반드시 배치 10개 묶음으로 호출. 절대 문항별 개별 호출 금지. Claude Opus는 $15/MTok(입력) + $75/MTok(출력)으로 개별 호출 시 10배 토큰 낭비 + 10배 느림.**

## Response LLM

Default: `gemini-2.5-flash-lite` (via OpenAI-compatible API). Configurable with `--llm` flag.

| LLM | Notes |
|-----|-------|
| gemini-flash-lite (default) | gemini-2.5-flash-lite via direct API |
| gemini | Same API path, explicitly named |
| gemini-cli | gemini CLI tool (buggy `-m` flag, avoid) |
| qwen3 | Local ollama qwen3:8b |

## Scoring

- Core tests: weighted pass rate
- Bonus tests: extra credit
- Grade: A (90%+), B (75%+), C (60%+), F (<60%), F (abstention fail)

## Known Issues (from benchmark results)

- **Naia Layer over-filtering (R8 v2 critical)**: Importance gating improves keyword precision +3pp but degrades semantic recall -13.5pp. semantic_search 2/18 vs mem0 base 16/18. Fix: hard filter → soft re-ranking. → P0
- **unchanged_persistence cascade delete**: Contradiction update deletes unrelated facts. All adapters 0/11 in R8 v2. Fix: status field + non-destructive update. → P0
- **multi_fact_synthesis 0%**: No multi-hop retrieval. Both naia-local and mem0 score 0/15. Fix: query decomposition + LLM synthesis. → P1
- **deprecated embedding + missing vector search**: `text-embedding-004` (768d, EN-optimized, deprecated 2026-01-14) is not wired into LocalAdapter. Benchmark uses Mem0Adapter backend — LocalAdapter has never been measured. → alpha-memory#5 (Critical)
- **Mem0Adapter LLM dedup kills Korean**: mem0 KO 24.5% = naia KO 24.0% — same pipeline, confirmed root cause. mem0's EN-optimized LLM dedup strips Korean text during normalization. Fix: switch benchmark + production to LocalAdapter. → alpha-memory#12
- **abstention is retrieval failure, not confidence gating**: naia abstention 100% (KO) / 75% (EN) is a false positive — nothing is retrieved so LLM says "I don't know". Real fix requires vector search first, then cosine similarity threshold. → alpha-memory#9
- **temporal 0-15%**: Naia overwrites facts on contradiction update, losing past state history. R8 v2: naia 3/20, mem0 0/20. → alpha-memory#8
- **EN fact bank 260/488 untranslated**: Mixed KO/EN queries in EN benchmark. Degrades EN result reliability.

## Reports

Benchmark results are saved in `reports/` as JSON files.

### Report Structure

```
reports/
├── REPORT_TEMPLATE.md       ← 보고서 작성 절차/템플릿 (3-AI 협업 방법 포함)
├── EXECUTION_HISTORY.md     ← 벤치마크 실행 이력
├── r5-en-benchmark/
│   ├── report-ko.md         ← R5 EN 벤치마크 한국어 보고서
│   └── report-en.md         ← R5 EN 벤치마크 영문 보고서
├── r6-ko-benchmark/
│   └── report-ko.md         ← R6 KO 벤치마크 한국어 보고서
├── r8-v2-5adapter/
│   └── report-ko.md         ← R8 v2 최종 보고서 (precision-recall 분석 + 로드맵)
└── runs/                    ← 원시 JSON 결과 파일
```

### R5 EN Benchmark Results (2026-04-12, GLM-5.1 Judge)

| Rank | Adapter | Score | Grade |
|------|---------|-------|-------|
| 1 | letta | 87.5% | F(abs) |
| 2 | open-llm-vtuber | 85.2% | F(abs) |
| 3 | naia | 84.0% | F(abs) |
| 4 | mem0 | 83.1% | F(abs) |
| 5 | sillytavern | 79.8% | F(abs) |
| 6 | sap | 74.1% | F(abs) |
| 7 | graphiti | 55.8% | F |
| 8 | openclaw | 43.3% | F |
| 9 | airi(baseline) | 33.9% | F |

**Key Findings:**
- All memory-capable systems fail abstention (40-65%) — memory-confidence structural coupling issue
- naia unchanged_persistence 47%: known bug naia-os#221 (cascade delete on contradiction update)
- graphiti: contradiction 100% vs semantic_search 4% — Neo4j KG cannot substitute vector search
- **NOT measured**: retrieval latency (ms) and per-query token cost — planned for R7

### R6 KO Benchmark Results (2026-04-13, keyword Judge)

| Rank | Adapter | Score | EN R5 | EN→KO |
|------|---------|-------|-------|-------|
| 1 | letta | 67.5% | 87.5% | -20pp |
| 2 | **naia** | **24.7%** (KW) / **24.0%** (GLM) | 84.0% | -60pp |
| 3 | mem0 | 24.0% | 83.1% | -59pp |
| 4 | sillytavern | 17.6% | 79.8% | -62pp |
| 5 | airi(baseline) | 16.0% | 33.9% | -18pp |
| 6 | openclaw | 14.8% | 43.3% | -29pp |
| 7 | open-llm-vtuber | 14.4% | 85.2% | -71pp |
| 8 | sap | 12.9% | 74.1% | -61pp |
| — | graphiti | DNF | 55.8% | — |

**Key Findings:**
- Korean language barrier: most systems drop 50-70pp vs EN — EN-optimized LLM pipeline is the bottleneck
- letta alone retains meaningful KO performance — internal multilingual LLM processing
- airi(no-memory) outperforms openclaw/open-llm-vtuber/sap — memory systems don't beat baseline in KO
- graphiti DNF at query 156/240 due to Neo4j 500 errors
- naia: cacheId bug fixed (c77990f) + per-query consolidation O(n²) removed; KO result: 24.7% (keyword) / 24.0% (GLM-5.1)

**Bug Fixes (R6):**
- `cacheId` always uses `cache-${lang}` — keeps EN/KO data in separate DBs (was using shared `stable` DB)
- Removed 3× `consolidateNow(force=true)` per-query calls — was O(n²) over 1000 facts

**naia EN R6 (bug-fixed rerun, 2026-04-14):**
- **GLM-5.1: 83.5%** (201/240) — essentially same as R5 EN 84.0%; bug fixes did not degrade EN performance
- keyword: 61% (150/240) — shows judge calibration gap (keyword 73% of GLM score)
- Highs: entity_disambiguation 100%, multi_fact_synthesis 95%, noise_resilience 95%
- Lows: abstention 55% (known structural bug), semantic_search 88% (GLM) vs 36% (keyword)

**Report:** See `reports/r6-ko-benchmark/report-ko.md`

### R8 v2 Benchmark Results (2026-04-23, synthetic factbank, 5 adapters × 3-Judge)

**설계**: v2 합성 팩트뱅크(200 허구 팩트, 241 쿼리)로 LLM 사전지식 경로 차단. airi baseline 33.9%→15%로 차단 확인.

**아키텍처 관계**: `naia-local = mem0 (vector search base) + Naia Layer (importance gating, consolidation, contradiction detection)`

**이중 순위 (공정성 vs 사용자 경험)**:

| 지표 | 1위 | 2위 | 3위 |
|------|-----|-----|-----|
| Keyword (정확도) | **naia-local** 31.5% | mem0 28.5% | sillytavern 26.5% |
| Consensus (사용자 경험) | **mem0** 39.8% | naia-local 38.6% | sillytavern 27.0% |
| GLM (관대 semantic) | **mem0** 79.5% | naia-local 66.0% | sillytavern 50.0% |
| Gemini (엄격 semantic) | **mem0** 32.0% | naia-local 28.5% | sillytavern 23.0% |

**Precision-Recall 트레이드오프**:
- Naia Layer가 keyword 정밀도 +3pp 개선, semantic recall -13.5pp 저하
- 원인: Importance Gating이 너무 공격적 (80%), Consolidation 정보 손실 (20%)
- semantic_search: naia 2/18 vs mem0 16/18 (8배 격차)
- unchanged_persistence: 전멸 0/11 (cascade delete)
- multi_fact_synthesis: 전멸 0/15
- temporal: naia 3/20 vs mem0 0/20 (유일한 naia 우위 카테고리)
- letta R7→R8 추락: KO 67.5%→14.5% (사전지식 경로 차단으로 무너짐)
- 모든 시스템 F 등급 (1위도 40% 미만)

**Report:** See `reports/r8-v2-5adapter/report-ko.md`

## Implementation Roadmap

### P0: Importance Gating → Soft Re-ranking (1-2 스프린트)

- [ ] Hard filter → weighted re-ranking 전환: `score = 0.6*vector + 0.4*importance`
- [ ] 동적 threshold: 쿼리 intent 분류 → threshold 조정 (탐색적 0.5, 사실적 0.85)
- [ ] semantic_search 2/18 → 10/18+ 목표, 전체 recall -13.5pp 회복

### P0 (병렬): unchanged_persistence 수정 (1-2 스프린트)

- [ ] 메모리 스키마에 `status` 필드 추가 (active/contradicted/archived)
- [ ] Contradiction update 시 물리적 삭제 → 상태 변경만
- [ ] Cascade delete 로직 제거, 대상 메모리 ID 1개만 업데이트
- [ ] 0/11 → 8/11+ 목표

### P1: multi_fact_synthesis 구현 (1-2 스프린트)

- [ ] Query Decomposition: LLM이 복합 쿼리를 서브쿼리로 분해
- [ ] Multi-hop 검색: 1차 결과에서 엔티티 추출 → 2차 검색
- [ ] LLM 합성: 수집 팩트 컨텍스트로 종합 답변 생성
- [ ] 0/15 → 5/15+ 목표

### P2: Consolidation + Temporal 고도화 (1 분기)

- [ ] 통합 시 뉘앙스 손실 최소화
- [ ] Temporal 버전 관리: 과거 상태 보존 (temporal 3/20 → 10/20+)
- [ ] Bi-temporal 모델 검토

### P3: LocalAdapter 벡터 검색 (#5, #12)

- [ ] Wire offline embedding (all-MiniLM-L6-v2) into LocalAdapter
- [ ] Switch benchmark + production to LocalAdapter — mem0 LLM dedup kills Korean

### P4: Judge 시스템 2.0

- [ ] Binary PASS/FAIL → 다차원 평가 (Accuracy, Completeness, Relevance)
- [ ] F1-Score 최적화 기준 확립
- [ ] HITL 캘리브레이션 세트 (50-100개 인간 평가 항목)

### Token Embedding Gating (Experimental — Post-Patent)

Evaluate replacing keyword heuristic in `importance.ts` with token-embedding-based scoring:

- **Phase 1 (prototype)**: Extract static token embeddings from pre-trained model (all-MiniLM-L6-v2 or LLM embedding layer). Compute cosine similarity between input tokens and pre-defined emotion/importance/surprise seed vectors. Run parallel with existing keyword scorer.
- **Phase 2 (benchmark)**: Compare keyword vs embedding vs hybrid on R5/R6 identical conditions. Gate: F1 ≥ 5% improvement, latency < 10ms/query.
- **Phase 3 (integration)**: If Phase 2 passes, add `ScoringProvider` interface to `scoreImportance()` with keyword (default) / embedding / hybrid modes.

**Risk**: Static token embeddings are context-independent (same limitation as keywords). The improvement may be marginal for the added complexity. Benchmark data required before committing.

**Patent note**: Included as "다른 실시예" in patent filing `docs-business/05. 특허/cognitive-memory-system/`. If benchmark proves ≥10% F1 gain, file divisional application or amendment.

## Conventions

- Language: English for code/docs, Korean for discussions
- Package: `@nextain/alpha-memory` (Apache-2.0)
- Part of Naia OS ecosystem
