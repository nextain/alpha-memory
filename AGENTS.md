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
│       └── mem0.ts            # mem0 OSS backend
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
│       ├── adapter-zep.ts
│       ├── adapter-openclaw.ts
│       ├── adapter-sap.ts
│       ├── adapter-open-llm-vtuber.ts
│       ├── adapter-jikime-mem.ts
│       └── adapter-no-memory.ts
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
| claude-cli | claude CLI via 9router (one-by-one) | slow |

## Scoring

- Core tests: weighted pass rate
- Bonus tests: extra credit
- Grade: A (90%+), B (75%+), C (60%+), F (<60%), F (abstention fail)

## Known Issues (from benchmark results)

- **temporal 0%**: Naia overwrites facts on contradiction update, losing past state history. → naia-os#221
- **System prompt language mixing**: EN benchmark system prompt contained Korean phrases, causing Korean responses to English queries. Fixed (commit 0b40bec).
- **parseBatchVerdict bug**: Didn't handle `---` separator from gemini responses. Fixed (commit 0b40bec).

## TODO: Benchmark R3 Re-run (before next re-run)

Before re-running the benchmark, these changes have been applied:

1. ~~시스템 프롬프트 한국어 제거~~ — DONE (commit 0b40bec)
2. ~~parseBatchVerdict `---` 처리~~ — DONE (commit 0b40bec)
3. ~~채점 기준 8개 원칙 judge 프롬프트 추가~~ — DONE (commit 0b40bec)
4. ~~**Top-K 증가**~~: adapter-naia.ts에서 topK 3→10 및 MemorySystem.recall 일관성 적용 완료.
5. ~~**Robust Memory Logic**~~:
   - Semantic redundancy check (Jaccard sim 0.85) prevents duplicate facts.
   - Deterministic SHA-256 fact IDs ensure idempotent consolidation.
   - Full contradiction resolution (updates all contradictory facts).
   - Reactivation strengthening (lastAccessed/strength refresh) and consistent 0.7 floor.
6. ~~**Consolidation Gap**~~: Benchmark runner now triggers manual consolidation (`consolidateNow(force=true)`) to exercise semantic logic.
7. **벤치마크 재실행**: 위 수정 후 run-comparison.ts 처음부터 재실행 필요 (기존 JSON 재사용 불가)

### R3 Expected Improvements
- noise_resilience: 35% → ~90% (파서 수정)
- semantic_search: 28% → ? (Top-K 증가 효과 확인)
- direct_recall: 8% → ? (한국어 응답 감소로 키워드 매칭 개선 기대)

### R2 Results (2026-04-08, for reference)

| Category | keyword | 2.5-pro(기존) | 2.5-pro(기준적용) | GLM-5.1(기존) | GLM-5.1(최종) |
|---|---|---|---|---|---|
| direct_recall | 4% | 4% | 8% | 8% | 4% |
| semantic_search | 24% | 28% | 28% | 20% | 28% |
| proactive_recall | 10% | 10% | 10% | 25% | 25% |
| abstention | 100% | 100% | 100% | 100% | 100% |
| irrelevant_isolation | 100% | 100% | 100% | 80% | 93% |
| multi_fact_synthesis | 20% | 20% | 20% | 15% | 20% |
| entity_disambiguation | 5% | 10% | 10% | 5% | 10% |
| contradiction_direct | 90% | 70% | 90% | 90% | 95% |
| contradiction_indirect | 27% | 60% | 87% | 87% | 87% |
| noise_resilience | 55% | 90% | 35% | 75% | 75% |
| unchanged_persistence | 7% | 20% | 7% | 20% | 13% |
| temporal | 0% | 0% | 0% | 0% | 0% |
| **TOTAL** | **35%** | **40%** | **39%** | **42%** | **44%** |

### Related Issues
- nextain/alpha-memory#2 — parseBatchVerdict --- 버그
- nextain/alpha-memory#3 — EN 시스템 프롬프트 한국어 혼재
- nextain/naia-os#221 — temporal 0%: 과거 상태 보존 안 됨

### 채점 기준 8원칙 (gemini-3.1-pro + GLM-5.1 합의)
1. 의미 기반 평가: exact match가 아닌 semantic matching 우선
2. 다국어 강건성: 한국어/영어 동의어 인정
3. 다중 키워드 부분 허용: min_expected 이상 충족 시 PASS
4. proactive_recall 엄격: 능동 제안 없으면 FAIL
5. irrelevant_isolation: 응답 잘림은 감점 아님, 개인정보 누출만 평가
6. contradiction: 과거값 맥락 언급 허용, 현재값 정확하면 PASS
7. multi_fact_synthesis: 단일 사실만으로는 FAIL, 종합성 필요
8. 판정 이유 필수: 이유 없는 FAIL은 기각

## Reports

Benchmark results are saved in `reports/` as JSON files.

## Conventions

- Language: English for code/docs, Korean for discussions
- Package: `@nextain/alpha-memory` (Apache-2.0)
- Part of Naia OS ecosystem
