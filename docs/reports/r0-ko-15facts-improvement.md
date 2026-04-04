# Alpha Memory System — Final Improvement Report

> Date: 2026-03-27
> Epic: #145 (Alpha Memory v2)
> Response model: gemini-2.5-flash
> Scoring: gemini-2.5-pro + Claude CLI dual independent scoring
> Embeddings: gemini-embedding-001 (3072d)
> Tests: 50 cases, 5 categories × 10 each, 3 runs with 2/3 pass threshold
> Total of 5 improvement loop rounds executed

---

## Final Results (Round 4, Best Score)

| Configuration | pro judge | Claude judge |
|------|:---------:|:------------:|
| no-memory baseline (LLM only) | - | **39%** |
| **with memory (Round 4)** | **68%** (34/50) | **74%** (37/50) |
| **Memory contribution** | - | **+35pp** |

### By Category

| Capability | What It Measures | pro | Claude | Assessment |
|------|----------|:---:|:------:|------|
| **recall** | Accurately answers stored facts using varied phrasing | **9/10** | **9/10** | Strongest |
| **contradiction** | Reflects changed facts + retains unchanged ones | 7/10 | **9/10** | Good |
| **synthesis** | Combines multiple memories for comprehensive answers | **8/10** | 7/10 | Good |
| **semantic** | Finds related memories via indirect expressions | 5/10 | **8/10** | Improved |
| **abstention** | Answers "I don't know" for unknown things | 5/10 | 4/10 | **Weakness** |

---

## Improvement Loop History

| Round | Change | pro | Claude | Speed | Result |
|:-----:|------|:---:|:------:|:----:|------|
| 0 | baseline (LLM only, no memory) | - | 39% | - | State without memory |
| 1 | mem0 basic + simple prompt | 64% | 66% | 37min | First implementation |
| 2 | threshold 0.65 + prompt improvements | 50% | 66% | 37min | ❌ synthesis dropped (threshold too high) |
| 3 | threshold relaxed to 0.55 | 64% | 66% | 37min | synthesis recovered, abstention dropped |
| **4** | **threshold removed + relevance% LLM judgment** | **68%** | **74%** | **37min** | **✅ Best. recall 9/9, semantic 8/10** |
| 5 | abstention prompt over-reinforced | 60% | 62% | 37min | ❌ counterproductive. overall drop. rolled back. |

### Lessons Learned Per Round

| Round | Lesson |
|-------|------|
| 2 | Raising threshold enables recall but cuts memories needed for synthesis |
| 3 | Threshold and abstention are a trade-off. Raising one lowers the other |
| 4 | **Showing relevance% to LLM for self-judgment is more effective than threshold** |
| 5 | Overly restrictive prompts suppress other capabilities as well |

---

## Score Comparison by Test Scale (Overestimation Experience)

| Test count | Scoring method | Score | Notes |
|:---------:|----------|:----:|------|
| 23 | self-judge | 87% | Inflated — self-judge + small scale |
| 23 | dual | 78% / 87% | |
| **50** | **dual** | **68% / 74%** | **Actual performance** |

**Expanding from 23→50 tests dropped score from 87%→74%, a 13pp decrease.** Overestimation from small-scale tests confirmed.

---

## Findings and Fixes from Adversarial Review

| Finding | Action |
|------|------|
| threshold 0.7 = data leakage | Separate calibration → ultimately removed threshold entirely |
| Suspected self-judge bias | Claude CLI independent scoring → ~4pp difference (negligible) |
| gemini-2.5-pro 0% judgment | max_tokens 500→8192 (thinking token consumption) |
| 23-test 87% overestimate | Expanded to 50 tests → 74% |
| abstention = prompt effect | Confirmed in no-memory baseline |
| baseline abstention 9/9 was misleading | Unable to search = unable to hallucinate ≠ hallucination prevention capability |
| expected_answer too narrow | semantic search works but judge fails on keyword matching |
| abstention prompt reinforcement backfired | Suppressed other capabilities → rolled back |

---

## Technical Findings

| Finding | Impact |
|------|------|
| gemini-2.5-pro thinking ~460 token consumption | max_tokens 8192+ required |
| mem0 ollama ensureModelExists 404 | Pure local execution blocked |
| Gemini embedding related/unrelated gap ~0.14 | Threshold alone cannot solve abstention |
| **Showing relevance% to LLM is more effective than threshold** | Core finding of Round 4 |
| Prompt constraints are double-edged | abstention↑ = synthesis↓ |
| chat model ≠ embedding model | Separate embedding model required for memory |
| qwen3-embedding 4.7GB exists | Pure local embedding possible (once mem0 compatibility resolved) |

---

## Unresolved Issues

### 1. Abstention (4-5/10)

Reached the limits of prompt tuning. Root causes:
- Vector search returns unrelated memories with score 0.55+
- LLM judges "there is a memory, so I must answer"
- Cutting with threshold breaks synthesis

Resolution direction: Separate LLM call for relevance judgment on search results (autonomous nervous system / conscious thought separation), or re-ranking model.

### 2. Pure Local Execution

mem0 ollama compatibility issue unresolved. qwen3:8b + qwen3-embedding 50-test run not executed.

### 3. Non-determinism

50 cases × 3 runs = 150 runs, but 1 case difference per 10-case category = 10pp. Still variable.

---

## Next Steps

1. **#152 (Release Decision)** — Current assessment at 74%
2. **qwen3:8b 50-test run** — Local model comparison
3. **Re-ranking model** — Root solution for abstention
4. **Replace Agent with Mem0Adapter** — Real operation in Shell

---

## Data Sources

| File | Contents |
|------|------|
| `reports/memory-v2-multi-2026-03-27.json` | 50-test dual scoring results (latest) |
| `reports/memory-no-memory-baseline-2026-03-27.json` | no-memory baseline |
| `benchmark/test-cases-v3.json` | 50 test cases |
| `benchmark/fact-bank.json` | 15 facts (fictional character Kim Ha-neul) |
| `benchmark/run-v2-multi.ts` | Benchmark runner (dual scoring, Round 4 configuration) |
| GitHub Issue #145 comments | Round-by-round results log |
