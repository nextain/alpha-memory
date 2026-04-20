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

- **deprecated embedding + missing vector search**: `text-embedding-004` (768d, EN-optimized, deprecated 2026-01-14) is not wired into LocalAdapter. Benchmark uses Mem0Adapter backend — LocalAdapter has never been measured. → alpha-memory#5 (Critical)
- **Mem0Adapter LLM dedup kills Korean**: mem0 KO 24.5% = naia KO 24.0% — same pipeline, confirmed root cause. mem0's EN-optimized LLM dedup strips Korean text during normalization. Fix: switch benchmark + production to LocalAdapter. → alpha-memory#12
- **abstention KO 100% is retrieval failure, not confidence gating**: naia KO abstention 100% is a false positive — nothing is retrieved so LLM says "I don't know". Real fix requires #5 (vector search) first, then cosine similarity threshold. → alpha-memory#9
- **unchanged_persistence cascade delete**: Contradiction update deletes unrelated facts. naia EN 47%, KO 33%. → alpha-memory#10
- **temporal 0% EN / 20% KO**: Naia overwrites facts on contradiction update, losing past state history. → alpha-memory#8
- **System prompt language mixing**: EN benchmark system prompt contained Korean phrases. Fixed (commit 0b40bec).
- **parseBatchVerdict bug**: Didn't handle `---` separator from gemini responses. Fixed (commit 0b40bec).

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

## Conventions

- Language: English for code/docs, Korean for discussions
- Package: `@nextain/alpha-memory` (Apache-2.0)
- Part of Naia OS ecosystem
