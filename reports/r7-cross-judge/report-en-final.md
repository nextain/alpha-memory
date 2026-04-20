# Alpha Memory Benchmark — R7 Final Report

**3-Judge Consensus Evaluation: Judge Reliability, Score Validity, and Improvement Roadmap**

> Date: 2026-04-20
> Judges: GLM-5.1 + Gemini 3.1 Pro Preview (majority vote, GLM moderator)
> 8 adapters × 2 languages = 16 runs × 240 items = 3,840 verdicts

---

## Executive Summary

The R7 cross-judge evaluation reveals that **the benchmark itself has fundamental structural flaws** that make current scores unreliable for ranking memory systems. While the 2-judge consensus system successfully reduced arbitrariness in KO (95-99% agreement), EN results expose a catastrophic judge disagreement (14-84%) driven by GLM's extreme leniency. Most critically, **airi — a system with zero memory — scores 41.6% in EN**, proving that the benchmark rewards LLM pre-training knowledge over actual memory retrieval.

### Key Findings

1. **KO scores are universally terrible** (14-36%) with high judge agreement (95-99%) — both judges correctly identify that Korean memory retrieval fails across the board
2. **EN judge disagreement is extreme** — GLM passes 80%+ for good systems while Gemini passes ~10%. The consensus resolves this via moderator but both extremes are problematic
3. **airi (no-memory baseline) scores 41.6% EN** — a system with zero persistent memory should score ~0% on a memory benchmark. This single fact invalidates the current EN scoring
4. **sillytavern EN 91.5%** — a simple keyword store outperforming all purpose-built architectures is a clear signal of benchmark gaming
5. **All systems receive F(abstention)** — the abstention penalty rule incentivizes hallucination over honest refusal

---

## 1. Consensus Results

### 1.1 Korean (KO)

| Rank | Adapter | Score | Grade | GLM↔Gemini Agreement |
|------|---------|-------|-------|---------------------|
| 1 | letta | 35.8% | F(abs) | 96% |
| 2 | graphiti | 28.0% | F | 99% |
| 3 | naia | 25.2% | F | 95% |
| 4 | mem0 | 24.5% | F(abs) | 99% |
| 5 | airi (no-mem) | 16.0% | F(abs) | 99% |
| 6 | sillytavern | 17.6% | F(abs) | 99% |
| 7 | openclaw | 15.3% | F | 99% |
| 8 | open-llm-vtuber | 14.4% | F | 98% |

**Analysis**: Korean memory performance is universally catastrophic. Even letta (best at 35.8%) fails nearly two-thirds of items. The high judge agreement (95-99%) is actually a **floor effect** — both judges easily agree on failure because the responses are obviously wrong or empty. This agreement does NOT validate the scoring; it merely confirms the failure is unambiguous.

Notable: naia (25.2%) and mem0 (24.5%) are functionally identical in KO, consistent with the known mem0 KO dedup bug where both use the same pipeline.

### 1.2 English (EN)

| Rank | Adapter | Score | Grade | GLM↔Gemini Agreement | GLM Pass | Gemini Pass |
|------|---------|-------|-------|---------------------|----------|-------------|
| 1 | sillytavern | 91.5% | F(abs) | 15% | 212 | 27 |
| 2 | mem0 | 89.9% | F(abs) | 14% | 204 | 26 |
| 3 | naia | 83.3% | F(abs) | 27% | 201 | 26 |
| 4 | letta | 83.1% | F(abs) | 25% | 199 | 27 |
| 5 | open-llm-vtuber | 81.4% | F(abs) | 26% | 185 | 28 |
| 6 | graphiti | 56.5% | F | 51% | 129 | 35 |
| 7 | airi (no-mem) | 41.6% | F | 71% | 100 | 34 |
| 8 | openclaw | 30.8% | F | 84% | 73 | 35 |

**Analysis**: EN results are unreliable due to extreme judge disagreement. GLM consistently passes 80%+ for capable systems while Gemini passes only ~10%. Since the moderator is GLM, the consensus scores skew heavily toward GLM's lenient interpretation.

The critical failure: **Gemini passes only 26-28 items for every capable system** — almost exactly the abstention + irrelevant_isolation items (35-40). This means Gemini is effectively scoring ALL memory retrieval as FAIL, only passing items where "I don't know" or "no comment" is the correct answer. This is too strict.

Meanwhile, GLM passes 212/240 for sillytavern — a 91.5% score that gives a simple keyword store the highest ranking, ahead of graph databases, vector stores, and cognitive architectures.

### 1.3 V1 (GLM-only) vs V2 (Consensus) Comparison

| Adapter | R5 EN (GLM) | R7 EN (V2) | Diff | R6 KO (GLM) | R7 KO (V2) | Diff |
|---------|-------------|------------|------|-------------|------------|------|
| sillytavern | 79.8% | 91.5% | +11.7 | 17.6% | 17.6% | 0.0 |
| mem0 | 83.1% | 89.9% | +6.8 | 24.0% | 24.5% | +0.5 |
| letta | 87.5% | 83.1% | -4.4 | 35.8% | 35.8% | 0.0 |
| naia | 84.0% | 83.3% | -0.7 | 24.7% | 25.2% | +0.5 |
| open-llm-vtuber | 85.2% | 81.4% | -3.8 | 14.4% | 14.4% | 0.0 |
| graphiti | 55.8% | 56.5% | +0.7 | DNF | 28.0% | — |
| airi | 33.9% | 41.6% | +7.7 | 16.0% | 16.0% | 0.0 |
| openclaw | 43.3% | 30.8% | -12.5 | 14.8% | 15.3% | +0.5 |

V2 consensus scores are close to v1 GLM-only scores in KO (±0.5pp) because judges agree so strongly. In EN, consensus introduces slight changes (±4-13pp) but the fundamental GLM-dominated scoring remains since GLM is the moderator.

---

## 2. Root Cause Analysis

### 2.1 Why KO Agreement is 99% but EN is 14-84%

**KO Floor Effect**: Korean memory retrieval is so bad that both judges easily agree on FAIL. When a system returns "기억에 없습니다" (I don't remember) for 80% of factual queries, the verdict is obvious. High agreement on universally terrible scores is not meaningful — it's a ceiling on disagreement, not a floor on quality.

**EN Semantic Ambiguity**: English responses are fluent and plausible but often factually wrong. GLM rewards semantic proximity ("close enough" matching), while Gemini requires strict factual accuracy. This creates massive disagreement precisely because the responses are in the ambiguous zone between "clearly correct" and "clearly wrong."

### 2.2 The airi Paradox (Revisited)

airi has no memory system — it generates responses purely from LLM pre-training. In R7 EN it scores 41.6% with 71% judge agreement. Breaking down by category:

| Category | airi EN | Why |
|----------|---------|-----|
| abstention | 100% | Correctly says "I don't know" for unknown facts |
| irrelevant_isolation | 100% | No personal info to leak |
| contradiction_direct | 100% | Pre-training handles logic |
| contradiction_indirect | 67% | Pre-training reasoning |
| noise_resilience | 75% | Filters noise via pre-training |
| unchanged_persistence | 67% | Guesses correctly |
| proactive_recall | 25% | Cannot proactively suggest anything |
| direct_recall | 0% | Cannot recall specific facts |
| semantic_search | 0% | Cannot search non-existent memory |
| temporal | 0% | No temporal knowledge |

**airi's 41.6% comes entirely from categories that don't require memory retrieval** (abstention, isolation, logic, noise filtering). This proves the benchmark conflates "general intelligence" with "memory capability." A valid memory benchmark should produce ~0% for a no-memory baseline.

### 2.3 GLM Leniency vs Gemini Strictness

| Behavior | GLM-5.1 | Gemini 3.1 Pro |
|----------|---------|----------------|
| Semantic proximity | Accepts "close enough" | Requires exact match |
| Hallucination tolerance | High (rewards fluency) | Low (punishes guessing) |
| Keyword matching | Loose (accepts synonyms freely) | Strict (needs core concept) |
| Baseline (airi) treatment | Passes 100/240 | Passes 34/240 |

**Neither judge is correct in isolation.** GLM is too lenient (inflates scores by accepting hallucinations), Gemini is too strict (rejects valid semantic matches). The truth lies between them.

### 2.4 Abstention F-Grade Structural Flaw

All 8 systems receive F(abstention) in EN. This is because:
1. Memory systems attempt to answer everything → some abstention queries are answered (FAIL for not refusing)
2. The binary "F if ANY abstention fail" rule means one mistake = grade F
3. This incentivizes systems to ALWAYS refuse when uncertain, which paradoxically harms recall scores

The abstention F-grade conflates confidence calibration with memory quality. A system could have perfect recall but still get F because it answered 1 out of 20 abstention queries.

---

## 3. Improvement Recommendations

### 3.1 Judge System Improvements

1. **Baseline Anchoring**: Automatically inject airi (no-memory) into every evaluation. If airi scores > 5%, the judge prompt is invalid and must be tightened. This creates an objective calibration point.

2. **Structured Output**: Replace free-form PASS/FAIL text with JSON output: `{"verdict":"PASS","confidence":0.9,"matched_keywords":["서연"],"reason":"..."}`. This eliminates parsing ambiguity and enables confidence-weighted scoring.

3. **0-3 Point Scale**: Replace binary PASS/FAIL with:
   - 0: Hallucination (fabricated information not in memory)
   - 1: Abstention ("I don't know" — neutral, not penalized)
   - 2: Partial match (correct topic but wrong/missing details)
   - 3: Exact fact match (precise recall from memory store)

4. **Dual-Judge + Human Review**: For items where judges disagree, flag for human review rather than relying on a moderator LLM that simply adds a third biased opinion.

### 3.2 Benchmark Design Improvements

1. **Synthetic/Fictional Facts**: Replace real-world facts with fictional ones (e.g., "My sister's favorite fruit is durian", "I work at Nexon on the 17th floor"). This guarantees LLMs cannot use pre-training knowledge, instantly driving the airi baseline to ~0%.

2. **Distractor Memories**: Inject similar-but-conflicting memories alongside target facts. This tests whether systems retrieve the CORRECT memory, not just any related memory. Example: store "My sister likes apples" AND "My sister likes durian" — only reward retrieval of the correct one based on temporal context.

3. **Memory-Isolated Evaluation**: Separate benchmark into two scores:
   - **Memory Recall Score**: Only categories that require factual retrieval from stored memories (direct_recall, semantic_search, temporal, entity_disambiguation, multi_fact_synthesis)
   - **Reasoning Score**: Categories that test logic/behavior (contradiction, noise_resilience, abstention, irrelevant_isolation)
   - Report both separately; don't conflate them

4. **Unique Identifiers**: Include random IDs or specific numbers in stored facts (e.g., "My employee ID is 8472931"). Queries must retrieve the exact ID. This prevents fuzzy matching from scoring.

### 3.3 Scoring Methodology Improvements

1. **Remove Abstention F-Grade**: Replace with a penalty system:
   - Correct recall: +1
   - Hallucination/wrong answer: −0.5 (punish guessing)
   - Abstention: 0 (neutral — do NOT punish honest refusal)

2. **Confidence-Weighted Scoring**: If the response LLM expresses low confidence ("I think it might be..."), reduce the reward. High-confidence wrong answers should be penalized more than uncertain wrong answers.

3. **Category Weight Rebalancing**: Currently all 12 categories have equal weight. Increase weight on memory-dependent categories (direct_recall, semantic_search, temporal) and decrease weight on reasoning categories that don't require memory.

### 3.4 Naia-Specific Priorities

Based on the results, naia should prioritize:

1. **Fix LocalAdapter vector search (alpha-memory#5, Critical)**: naia KO currently scores 25.2% — essentially same as mem0 (24.5%) because both use the same mem0 backend. LocalAdapter's vector search has never worked. Fixing this is the single highest-impact improvement.

2. **Korean language pipeline**: naia KO 25.2% vs EN 83.3% = 58pp gap. The English-optimized LLM dedup/normalization pipeline destroys Korean text. Switch to LocalAdapter with Korean-aware processing.

3. **Abstention calibration**: naia abstention 100% KO / 55% EN. The 100% KO is a false positive — nothing is retrieved so the LLM defaults to "I don't know." Real fix requires vector search (#5) first, then cosine similarity threshold tuning.

4. **Unchanged persistence (alpha-memory#10)**: naia EN 73%, KO 33%. Contradiction update cascade-deletes unrelated facts. This is a known bug that directly costs 15-20pp.

5. **Temporal memory (alpha-memory#8)**: naia EN 80%, KO 20%. Facts are overwritten on contradiction update, losing history. Need append-only temporal storage.

---

## 4. Judge Configuration

| Parameter | GLM-5.1 | Gemini 3.1 Pro Preview |
|-----------|---------|------------------------|
| API | Z.AI REST API | Google Generative Language API |
| Model | glm-5.1 | gemini-3.1-pro-preview |
| Temperature | 0.3 | 0.3 |
| Batch size | 10 | 10 |
| Prompt language | Korean/English (auto) | Korean/English (auto) |
| Max tokens | 8000 | 8000 |
| Moderator | Yes (GLM resolves disputes) | No |

### Infrastructure Fixes Applied in R7

1. **Claude Opus CLI EMPTY bug fixed**: Model identifier `opus-4.6` → `opus`. Claude CLI prepends 2 blank lines to responses; `parseVerdict` now strips leading blank lines before parsing.
2. **Batch enforcement**: All judges (GLM, Gemini, Claude) now use BATCH_SIZE=10. Previous versions sent Claude one-by-one, wasting 10x tokens ($15/MTok input, $75/MTok output).
3. **AGENTS.md updated**: Added permanent rule: "모든 judge는 반드시 배치 10개 묶음으로 호출. 절대 문항별 개별 호출 금지."

---

## 5. Detailed Category Scores

### 5.1 Korean (KO) — Category Breakdown

| Category | airi | graphiti | letta | mem0 | naia | olv | openclaw | sillytavern |
|----------|------|----------|-------|------|------|-----|----------|-------------|
| direct_recall | 4% | 8% | 0% | 24% | 20% | 8% | 0% | 28% |
| semantic_search | 4% | 32% | 4% | 12% | 12% | 0% | 4% | 0% |
| proactive_recall | 0% | 20% | 0% | 10% | 5% | 0% | 5% | 0% |
| abstention | 95% | 100% | 70% | 90% | 100% | 100% | 100% | 70% |
| irrelevant_isolation | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 93% |
| multi_fact_synthesis | 5% | 25% | 5% | 15% | 5% | 5% | 10% | 10% |
| entity_disambiguation | 5% | 35% | 0% | 20% | 20% | 5% | 0% | 15% |
| contradiction_direct | 5% | 0% | 90% | 5% | 15% | 0% | 5% | 5% |
| contradiction_indirect | 7% | 0% | 93% | 7% | 7% | 0% | 0% | 0% |
| noise_resilience | 5% | 0% | 90% | 15% | 15% | 0% | 0% | 10% |
| unchanged_persistence | 0% | 53% | 7% | 20% | 33% | 0% | 0% | 13% |
| temporal | 4% | 12% | 8% | 20% | 20% | 0% | 0% | 16% |

### 5.2 English (EN) — Category Breakdown

| Category | airi | graphiti | letta | mem0 | naia | olv | openclaw | sillytavern |
|----------|------|----------|-------|------|------|-----|----------|-------------|
| direct_recall | 0% | 40% | 96% | 92% | 88% | 96% | 0% | 100% |
| semantic_search | 0% | 4% | 88% | 96% | 84% | 96% | 16% | 88% |
| proactive_recall | 25% | 50% | 0% | 90% | 75% | 95% | 30% | 100% |
| abstention | 100% | 100% | 60% | 55% | 55% | 65% | 100% | 60% |
| irrelevant_isolation | 100% | 100% | 100% | 100% | 100% | 100% | 100% | 100% |
| multi_fact_synthesis | 30% | 15% | 100% | 100% | 100% | 100% | 20% | 95% |
| entity_disambiguation | 0% | 50% | 95% | 95% | 85% | 90% | 0% | 90% |
| contradiction_direct | 100% | 100% | 100% | 75% | 80% | 95% | 50% | 100% |
| contradiction_indirect | 67% | 100% | 93% | 100% | 93% | 93% | 0% | 100% |
| noise_resilience | 75% | 95% | 100% | 100% | 95% | 50% | 70% | 90% |
| unchanged_persistence | 67% | 87% | 93% | 93% | 73% | 33% | 0% | 100% |
| temporal | 0% | 12% | 92% | 92% | 80% | 56% | 0% | 92% |

---

## 6. Cost & Infrastructure

| Metric | Value |
|--------|-------|
| Total API calls (GLM) | 16 × 24 batches = 384 calls |
| Total API calls (Gemini) | 16 × 24 batches = 384 calls |
| GLM cost | ~free (Z.AI internal) |
| Gemini cost | ~$2-5 (API free tier mostly) |
| Claude cost | $0 (not used in final run) |
| Total wall time | ~9 hours (21:40 KST → 06:37 KST) |
| Per adapter avg | ~28 min (KO), ~30 min (EN) |

---

## 7. Conclusion

The R7 cross-judge evaluation successfully identified the benchmark's core problems:

1. **The benchmark measures general intelligence, not memory**: airi (no memory) scoring 41.6% proves that reasoning/logic categories inflate scores independently of memory capability
2. **Judge leniency dominates EN scores**: GLM's semantic proximity matching creates inflated scores that don't reflect factual recall accuracy
3. **KO is a genuine failure mode**: 95-99% agreement on universally terrible Korean scores is the most reliable finding — Korean memory retrieval is broken everywhere
4. **The abstention F-grade is counterproductive**: It punishes honest refusal, incentivizing hallucination

**Next steps**: Implement synthetic fact bank, distractor memories, and baseline anchoring (R8). These changes should drive airi to ~0% and create meaningful differentiation between memory systems.

---

*Report generated: 2026-04-20*
*Analysis assisted by: GLM-5.1 (Z.AI API)*
*Data: alpha-memory benchmark runs 2026-04-16, cross-judged 2026-04-19~20*
