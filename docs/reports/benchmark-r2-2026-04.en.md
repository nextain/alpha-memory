# Alpha Memory Benchmark R2 Report

**Project**: Alpha Memory (`@nextain/alpha-memory`)
**Date**: April 2026
**Rounds**: R1 (Korean, 1000 facts), R2 (English, 1000 facts)
**Author**: Nextain internal — not an independent reviewer (conflict of interest disclosed)

---

## 1. Executive Summary

- **Every system received an F grade.** No system passed the abstention requirement — the ability to refuse to fabricate memories that do not exist. This is the minimum bar for a personal AI companion, and the entire field of open-source memory layers fails it.
- **Naia (Alpha Memory) ranked 1st in Korean (65%) but 3rd in English (46%).** The results expose simultaneous Korean-language optimization and English-language weakness.
- **This benchmark was designed by the Naia team.** The 12 categories, weights, keyword judge, and fact bank were all chosen by the team that built the system being evaluated. This is a material conflict of interest that must be disclosed upfront.
- **Bugs contaminated the results.** mem0 and SAP experienced confirmed bugs (mem0ai/mem0#4707, #4708, #4709) causing silent data loss. Their scores reflect broken pipelines, not true system capability.

---

## 2. Why This Benchmark Exists

### Gaps in Existing Benchmarks

Existing long-term memory benchmarks (LoCoMo, LongMemEval, etc.) primarily measure within-session retention: how well a model recalls information from earlier in a single conversation. They do not evaluate:

- Selective recall from a fact bank of 1,000+ entries
- Correct memory reconsolidation when facts change or contradict
- Prevention of personal information leakage in unrelated queries
- Honest refusal when a memory simply does not exist

### What This Benchmark Targets

Alpha Memory benchmark targets the **personal AI companion scenario** — an AI that remembers a specific user across many sessions and months. It uses 1,000 facts about a fictional user "Haneul Kim (김하늘)" and evaluates 12 cognitive capability categories across 240 queries.

Comparison targets are the most prominent open-source memory layer projects: SillyTavern (24K stars), mem0 (24K stars), and Letta (14K stars, Korean run only).

---

## 3. Benchmark Design

### 3.1 Fact Bank

- 1,000 total facts
- Subject: fictional user "Haneul Kim (김하늘)"
- Domains: identity, tech preferences, work, health, social relationships, finances, hobbies, temporal schedule — 8 domains
- Korean version (R1) and English version (R2) constructed separately

### 3.2 Categories and Weights

| Category | Weight | Queries | What It Measures |
|---|---|---|---|
| direct_recall | 1 | 25 | Verbatim fact retrieval ("my editor?" → "Neovim") |
| semantic_search | 2 | 25 | Paraphrase-robust retrieval |
| proactive_recall | 2 | 20 | Applying stored preferences without being asked |
| abstention | 2 | 20 | Refusing to fabricate non-existent memories (pass/fail gate) |
| irrelevant_isolation | 1 | 15 | Not leaking personal info in unrelated queries |
| multi_fact_synthesis | 2 | 20 | Combining multiple facts for compound answers |
| entity_disambiguation | 2 | 20 | Distinguishing user from mentioned third parties |
| contradiction_direct | 2 | 20 | Processing explicit updates ("switched to Cursor") |
| contradiction_indirect | 2 | 15 | Detecting implicit updates ("Django is fun lately") |
| noise_resilience | 2 | 20 | Extracting facts from casual conversation |
| unchanged_persistence | 1 | 15 | Preserving unchanged facts after updates |
| temporal | 2 | 25 | Time-based queries ("next week's schedule") |

### 3.3 Scoring

- **Weighted score**: Σ(pass × weight) / Σ(total × weight)
- **Special rule**: Any abstention failure → automatic F grade. Rationale: an AI companion that fabricates memories is unshippable.

### 3.4 Judge Methodology

Keyword matching with bilingual (Korean/English) synonym awareness. More deterministic and reproducible than LLM judgment, but sensitive to surface form — a correct answer using unexpected wording can fail.

### 3.5 Retrieval Config

- topK = 10 from 1,000 facts (1% recall ratio)
- Embedder: Gemini text-embedding-001 (3,072-dim) — Naia, mem0, SAP
- SillyTavern: Xenova/all-mpnet-base-v2 (768-dim, local)
- API throttle: 2s between calls

---

## 4. Fairness and Objectivity Review

### 4.1 Naia (Alpha Memory)

**Disadvantages:**
- Uses Qwen3 (local) for memory operations vs. Gemini 2.5 Flash for SillyTavern. The LLM quality gap affects importance scoring, reconsolidation quality, and response generation — all things Naia relies on that SillyTavern does not.
- Importance gating (3-axis: importance × surprise × emotion) can reject facts that are later needed. Over-filtering directly reduces recall-type scores.
- Ebbinghaus decay is active during tests. If the test runs faster than real-world usage, recently-added memories may weaken unexpectedly.
- Knowledge graph overhead adds processing complexity that could introduce failure modes.

**Advantages:**
- The 12 benchmark categories were designed by the Naia team. The category composition aligns with Naia's cognitive-psychology design philosophy. This is a serious conflict of interest — home field advantage cannot be ruled out.
- The system was built exactly for this use case. Design purpose and evaluation purpose are identical.
- Keyword judge may favor Naia's extraction output style.

**Fairness verdict**: The category design conflict of interest is severe. Results should not be cited without disclosing this.

### 4.2 SillyTavern

**Disadvantages:**
- Designed for long-form character roleplay, not structured fact retrieval. Being evaluated on this benchmark is a category mismatch.
- all-mpnet-base-v2 (768-dim) vs. Gemini embeddings (3,072-dim) — lower embedding quality compounds the topK=10/1000 difficulty.
- No LLM deduplication means 1,000 facts accumulate verbatim. Similar facts compete for the same retrieval slots.

**Advantages:**
- Pure vector search — no LLM call overhead, no timeout risk, no deduplication failure. Simplicity produced stability.
- Strong EN performance (64%) suggests the embedding model works well for English text.
- No bugs, no data loss, all 1,000 facts processed successfully.

**Fairness verdict**: Most mismatched system — evaluated on a benchmark it was never designed for. Its EN 64% should be interpreted as a baseline for pure vector search, not as "SillyTavern has good memory."

### 4.3 mem0

**Disadvantages:**
- Two confirmed bugs caused silent data loss during this test:
  - **mem0ai/mem0#4707**: `add()` calls hanging
  - **mem0ai/mem0#4708**: `"Memory with ID undefined not found"` error causing silent insert failure
- EN direct_recall 1/25 is catastrophically low. Most facts were likely silently dropped during LLM deduplication.
- LLM over-merging can generalize specific facts into vague summaries, destroying precision recall.

**Advantages:**
- EN abstention 20/20: never hallucinated once. LLM deduplication's conservatism suppresses hallucination effectively.
- Strong EN contradiction scores (direct 17/20, indirect 11/15) — reconsolidation works when facts survive.
- EN noise_resilience 17/20: best at extracting facts from casual conversation.

**Fairness verdict**: Confirmed bugs mean this is not a fair test of mem0's actual capability. Scores should not be used for comparison until a clean run is completed.

### 4.4 SAP (Super Agent Party)

**Disadvantages:**
- TypeScript-to-Python subprocess communication (JSON over stdin/stdout) introduces overhead and failure modes.
- **mem0ai/mem0#4709**: `store=False` field sent to Gemini API causes errors, some facts silently lost.
- Used ChromaDB in R1 (KO) and FAISS in R2 (EN) — different backends make cross-run comparison unreliable.
- EN contradiction_direct collapsed to 4/20 for unknown reasons.

**Advantages:**
- FAISS is highly optimized for vector search.
- BM25 hybrid search is claimed in the architecture (not confirmed active in this test configuration).

**Fairness verdict**: Same bug contamination issue as mem0. Additionally, the backend switch between runs is a methodological inconsistency.

---

## 5. Results

### 5.1 Korean Results (R1, 1,000 KO facts)

| Category | Naia | SillyTavern | Letta | mem0* | SAP* |
|---|---|---|---|---|---|
| direct_recall | 16/25 | 22/25 | 22/25 | partial | partial |
| semantic_search | 14/25 | 8/25 | 13/25 | partial | partial |
| proactive_recall | 13/20 | 15/20 | 15/20 | partial | partial |
| abstention | 7/20 | 10/20 | 11/20 | partial | partial |
| irrelevant_isolation | 15/15 | 15/15 | 15/15 | partial | partial |
| multi_fact_synthesis | 8/20 | 8/20 | 12/20 | partial | partial |
| entity_disambiguation | 15/20 | 18/20 | 17/20 | partial | partial |
| contradiction_direct | 14/20 | 14/20 | 13/20 | partial | partial |
| contradiction_indirect | 10/15 | 5/15 | 0/15 | partial | partial |
| temporal | 1/25 | 1/25 | 0/25 | partial | partial |
| noise_resilience | 4/20 | 0/20 | 1/20 | partial | partial |
| unchanged_persistence | 8/15 | 1/15 | 0/15 | partial | partial |
| **Weighted Score** | **65%** | **46%** | **47%** | **re-run needed** | **re-run needed** |
| **Grade** | F (abstention) | F (abstention) | F (abstention) | — | — |

*mem0 and SAP had Gemini API rate limit failures in R1 KO. Re-run pending.

### 5.2 English Results (R2, 1,000 EN facts)

| Category | Naia | SillyTavern | mem0 | SAP |
|---|---|---|---|---|
| direct_recall | 11/25 | 23/25 | 1/25 | 12/25 |
| semantic_search | 5/25 | 12/25 | 3/25 | 10/25 |
| proactive_recall | 13/20 | 11/20 | 5/20 | 14/20 |
| abstention | 13/20 | 13/20 | 20/20 | 12/20 |
| irrelevant_isolation | 15/15 | 15/15 | 15/15 | 14/15 |
| multi_fact_synthesis | 8/20 | 8/20 | 3/20 | 12/20 |
| entity_disambiguation | 11/20 | 16/20 | 4/20 | 13/20 |
| contradiction_direct | 17/20 | 14/20 | 17/20 | 4/20 |
| contradiction_indirect | 1/15 | 5/15 | 11/15 | 4/15 |
| noise_resilience | 10/20 | 14/20 | 17/20 | 3/20 |
| unchanged_persistence | 3/15 | 11/15 | 2/15 | 6/15 |
| temporal | 5/25 | 19/25 | 2/25 | 7/25 |
| **Weighted Score** | **46%** | **64%** | **43%** | **45%** |
| **Grade** | **F** (abstention) | **F** (abstention) | **F** | **F** (abstention) |

### 5.3 Key Patterns

1. **Universal abstention failure**: No system, in either language, met the abstention threshold of 20/20. mem0 EN is the sole exception — but its other scores collapsed.
2. **Universal temporal failure**: In KO, all three systems scored 1/25 or below. In EN, SillyTavern scored 19/25 but every other system failed.
3. **Language inversion**: Naia 65%(KO) → 46%(EN), SillyTavern 46%(KO) → 64%(EN) — a ~19pp reversal between the two systems.
4. **mem0's paradox**: Perfect abstention but near-zero recall — the system that never hallucinates also can't remember anything.

---

## 6. Per-Adapter Analysis

### 6.1 Naia (Alpha Memory)

**What worked:**
- **contradiction_indirect (KO 10/15)**: Only system to achieve meaningful scores here in Korean. The Ebbinghaus reconsolidation logic is detecting implicit updates in Korean context.
- **unchanged_persistence (KO 8/15)**: Best score among all systems in Korean.
- **semantic_search (KO 14/25)**: Outperformed SillyTavern (8/25) and Letta (13/25) in Korean semantic retrieval.

**What failed:**
- **temporal (KO 1/25, EN 5/25)**: Effectively non-functional. This appears to be an architectural gap, not a tuning issue.
- **abstention (KO 7/20, EN 13/20)**: Hallucinating non-existent memories is the most critical failure.
- **EN performance drop**: 65% → 46% is a 19pp decline that is too large to attribute to noise. The Qwen3 local LLM's Korean optimization likely degrades English memory operations.

**Hypothesis**: Qwen3 assigns lower importance scores to English facts than Korean facts. Importance gating then over-filters English inputs, resulting in fewer facts being stored and weaker reconsolidation quality in English.

### 6.2 SillyTavern

**What worked:**
- **EN direct_recall 23/25**: Best fact retrieval accuracy across all systems and languages. Pure vector search wins at verbatim recall when embeddings are good.
- **EN temporal 19/25**: Only system that handles time-based queries well. Temporal text in English apparently clusters well in embedding space.
- **Stability**: Zero bugs, zero API failures, 100% of facts processed.

**What failed:**
- **KO noise_resilience 0/20**: Complete failure on Korean conversational text.
- **KO unchanged_persistence 1/15**: Cannot preserve existing facts through updates in Korean.
- **No reasoning**: Categories requiring inference (proactive_recall, contradiction_indirect) have a structural ceiling of near-zero without LLM support.

**Key finding**: SillyTavern EN 64% should be read as the **vector search baseline** — what you get for free with a good embedding model and no overhead. The fact that Naia at 46% falls below this baseline in English means Alpha Memory's complex architecture is currently a net negative in English. That is an honest assessment.

### 6.3 mem0

**What worked:**
- **EN abstention 20/20**: Perfect. LLM deduplication's conservatism is excellent at preventing hallucination.
- **EN contradiction** (direct 17/20, indirect 11/15): Best contradiction handling in English. Reconsolidation works for facts that survive the dedup pipeline.
- **EN noise_resilience 17/20**: Best at extracting facts from casual text.

**What failed:**
- **EN direct_recall 1/25**: Near-total recall collapse. Most facts were silently dropped during LLM deduplication. A memory system that cannot retrieve facts is worse than no memory system.
- **Bugs**: Two confirmed bugs (#4707, #4708) are a primary cause. This is not a fair test of mem0's design.

**Core paradox**: mem0 demonstrates that LLM deduplication can eliminate hallucination. But the same pipeline destroys recall by over-merging facts. "Clean memory, but no memory."

### 6.4 SAP

**What worked:**
- **EN proactive_recall 14/20**: Best in class for applying stored preferences without being prompted.
- **EN multi_fact_synthesis 12/20**: Relatively strong compound fact retrieval.

**What failed:**
- **EN contradiction_direct 4/20**: Catastrophic collapse on explicit updates. Cause unknown.
- **EN noise_resilience 3/20**: Worst at conversational fact extraction.
- **Bugs**: #4709 caused silent data loss. The backend inconsistency (ChromaDB KO vs. FAISS EN) makes cross-run analysis unreliable.

---

## 7. Cross-Language Analysis

### 7.1 The Inversion

| | KO | EN | Delta |
|---|---|---|---|
| Naia | 65% | 46% | -19pp |
| SillyTavern | 46% | 64% | +18pp |

These two systems swapped rankings with a ~19pp gap. This magnitude is unlikely to be random variance.

### 7.2 Causal Analysis

**Why Naia dominates Korean (hypotheses):**
1. Qwen3 is optimized for Korean. Importance scoring, reconsolidation prompts, and memory search queries all leverage Korean NLP more effectively.
2. The Naia team develops in Korean. Korean-language processing paths may be more mature and tested.
3. The keyword judge may have been calibrated against Korean output patterns.

**Why SillyTavern dominates English (hypotheses):**
1. all-mpnet-base-v2 was trained primarily on English data. English embedding quality is substantially higher than Korean.
2. English text may cluster more cleanly in this embedding space, making topK=10 from 1,000 more accurate.
3. Korean morphology and spacing rules may degrade all-mpnet-base-v2 embedding quality for Korean.

### 7.3 Implications

Language inversion at this scale suggests neither system has achieved genuine multilingual memory. A production-grade personal AI companion must serve users in their native language without 20pp performance swings. Both systems remain in single-language optimization territory.

---

## 8. Known Limitations

### 8.1 Conflict of Interest (Most Important)

**The benchmark was designed and executed by the Naia team.** Category selection, weights, keyword judge, and fact bank construction were all Naia decisions. Independent replication by an external researcher has not been performed. These results should not be cited as independent validation.

### 8.2 Keyword Judge Limitations

A correct answer using unexpected phrasing can fail. Paraphrase-level correctness is not captured. Specific systems' output styles may align better with judge keywords.

### 8.3 Single Run, No Variance

Each condition was run once. LLM-based systems are stochastic — repeated runs under identical conditions may vary by several percentage points. These results are single-sample estimates.

### 8.4 Unequal LLM Quality

SillyTavern used Gemini 2.5 Flash for memory operations; Naia used local Qwen3. LLM quality is a confound that was not controlled.

### 8.5 Bug Contamination

mem0 and SAP had confirmed bugs causing silent data loss. Their scores are unreliable as measures of their actual capability.

### 8.6 Incomplete Cross-System Coverage

mem0/SAP R1 KO run was aborted due to API rate limits. Letta participated in R1 KO only. Not all systems were evaluated under identical conditions.

---

## 9. Significance

### 9.1 What the F Grades Mean

This is not a statement that these systems are 10% worse than a passing grade. **Abstention failure means an AI companion cannot be deployed.** A user who asks "what was my doctor's appointment time?" and receives a confident, fabricated answer has been harmed by the system. The AI companions in this benchmark hallucinate.

This is the state of open-source AI memory layers in 2026. Systems marketed as "AI with memory" can and do generate false memories.

### 9.2 Category-Level Reality

- **temporal failure**: These systems cannot reliably answer "do I have plans next week?" — one of the most basic companion use cases.
- **noise_resilience failure**: Users must speak in structured commands for facts to be remembered. That is not a companion; it is a filing system with a chat interface.
- **abstention failure**: The AI does not say "I don't know" — it says something that sounds plausible but may be wrong.

### 9.3 Alpha Memory's Position

Naia's KO 65% first-place result comes with two asterisks: Korean optimization and benchmark conflict of interest. More importantly, **scoring below SillyTavern (pure vector search) in English means the complex cognitive architecture is currently adding net cost, not net value, for English users.** The architecture shows promise in KO contradiction_indirect and unchanged_persistence — but promise is not performance.

---

## 10. Conclusion

### 10.1 Current State

All four memory systems fail the minimum bar for a personal AI companion. Abstention is broken across the board.

Score ranking (KO): Naia > Letta ≈ SillyTavern. Score ranking (EN): SillyTavern > Naia > SAP > mem0. But all grades are F — these rankings describe degrees of insufficiency.

### 10.2 Alpha Memory Priority Roadmap

In priority order:

1. **Fix abstention**: The system must learn to say "I don't have a memory for that." Until this passes, shipping is not on the table.
2. **Implement temporal memory**: 1/25 is a functional absence, not a low score. Time-based recall requires dedicated architectural work.
3. **Close the EN gap**: 19pp below KO suggests Qwen3 language bias is a structural problem. Evaluate multilingual LLM options or language-specific processing branches.
4. **Recalibrate importance gating**: If over-filtering is lowering recall, the threshold or post-hoc recovery mechanism needs adjustment.

### 10.3 Benchmark Roadmap

For this benchmark to be credible externally:
1. Independent replication by parties unaffiliated with Naia
2. LLM judge as alternative or complement to keyword matching
3. Equal LLM quality across all systems (same API, same model)
4. Clean re-run of mem0 and SAP after bug fixes
5. Multiple runs per condition to measure variance

---

*This report is an internal Nextain document. External publication requires explicit conflict-of-interest disclosure.*
*Alpha Memory patent application pending: "Neuroscience-inspired multi-store AI agent long-term memory management system"*
*Generated: 2026-04-05*
