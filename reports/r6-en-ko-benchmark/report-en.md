# Alpha Memory Benchmark u2014 Cross-Language Evaluation
## English (R5) & Korean (R6) Comparative Report

**AI Memory System Benchmark u2014 April 2026**

> This report covers two consecutive benchmark rounds: **R5 (English, April 12)** and **R6 (Korean, April 13)**, evaluating 9 AI memory systems across both language environments. The cross-language comparison reveals a severe **Korean robustness gap** affecting nearly all memory systems, driven by language assumptions embedded in their storage and retrieval pipelines.
>
> **Scope of this report**: These results measure *Korean robustness* of systems designed and optimized primarily in English u2014 not Korean language capability in a native multilingual context. The fact banks and query sets were translated from English originals. See u00a7Limitations.

---

## 1. Project Overview

### Why Do AI Systems Need Memory?

The longer you talk with an AI, the more useful it should become. If an AI canu2019t remember that youu2019re a software engineer, have two cats, and hate mornings, you have to re-introduce yourself every time u2014 which defeats the purpose of having a personal AI. But simply u201cremembering moreu201d isnu2019t the answer either. Systems that store too much tend to generate confident-sounding but fabricated answers, a phenomenon called **hallucination**.

**Alpha Memory** is a cognitive memory architecture designed to solve this problem, drawing inspiration from how the human brain actually stores and retrieves information.

### What Is Alpha Memory?

Alpha Memory is the core memory package for **Naia OS** (Nextainu2019s open-source AI desktop OS). It implements a **4-store memory model** analogous to the human brain:

| Store | Brain Analog | What It Holds |
|-------|-------------|---------------|
| **Episodic** | Hippocampus | Timestamped events and experiences |
| **Semantic** | Neocortex | Facts, concepts, relationships |
| **Procedural** | Basal Ganglia | Skills, strategies, learned patterns |
| **Working** | Prefrontal Cortex | Active context for the current conversation |

Key technical mechanisms:
- **Importance-gated encoding (3-axis scoring)**: Evaluates memory value as Importance u00d7 Surprise u00d7 Emotion
- **Ebbinghaus forgetting curve**: Simulates natural memory decay over time
- **Knowledge graph**: Connects people, places, and relationships for contextual search
- **Contradiction detection**: Automatically identifies and resolves conflicts with existing memories upon retrieval

---

## 2. Test Design

### Round 1 u2014 R5 English Benchmark (April 12, 2026)

| Parameter | Value |
|-----------|-------|
| Language | English |
| Persona | Fictional character with 1,000 stored facts |
| Test items | 240 queries u00d7 12 categories |
| Scoring judge | GLM-5.1 (semantic / meaning-based evaluation) |
| Response LLM | Gemini 2.5 Flash Lite (identical for all systems) |

### Round 2 u2014 R6 Korean Benchmark (April 13, 2026)

| Parameter | Value |
|-----------|-------|
| Language | Korean |
| Persona | Same fictional character, 1,000 Korean-translated facts |
| Test items | 240 queries u00d7 12 categories |
| Scoring judge | GLM-5.1 (primary); keyword judge for `graphiti` and `naia-local` |
| Response LLM | Gemini 2.5 Flash Lite (identical for all systems) |

> **Translated fact bank**: The Korean persona facts and queries are translations of the English originals, not natively authored Korean content. Results should be interpreted as *Korean input robustness* under translation conditions, not as a comprehensive multilingual capability benchmark.

> **Judge note**: `graphiti` (clean re-run) and `naia-local` (R7 experimental) were scored with a keyword judge. Results from keyword-judged systems are **reported separately** and should not be directly compared to GLM-5.1-judged scores. Based on cross-validation on naia EN (keyword 61% vs GLM 83.5%), keyword scores are approximately 73% of equivalent GLM scores.

### Scoring Formula

Scores are **weighted pass rates**, not raw pass rates:

$$\text{Score} = \frac{\sum_{i} (\text{passed}_i \times w_i)}{\sum_{i} (\text{total}_i \times w_i)}$$

where $w_i \in \{1, 2\}$ per category (see u00a73). This means a category with weight u00d72 contributes twice as much to the final score as a weight-u00d71 category.

**Statistical note**: With an average of 20 queries per category, per-category scores carry a margin of error of approximately u00b122% at 95% confidence (binary pass/fail). Differences of fewer than 5 percentage points in total score, or fewer than 10 percentage points in a single category, should not be treated as statistically significant without further validation.

### Systems Evaluated

| System | Description |
|--------|-------------|
| **naia** | Alpha Memory u2014 4-store cognitive architecture (this project) |
| **letta** | Letta (formerly MemGPT) u2014 agent memory management framework |
| **mem0** | mem0 OSS u2014 open-source memory layer for LLM applications |
| **open-llm-vtuber** | Open-LLM-VTuber u2014 VTuber streaming AI character memory |
| **sillytavern** | SillyTavern u2014 roleplay chatbot memory |
| **sap** | SAP AI Core memory component |
| **graphiti** | Graphiti (getzep) u2014 Neo4j temporal knowledge graph |
| **openclaw** | OpenClaw u2014 lightweight memory layer |
| **airi** | AIRI (moeru-ai) u2014 **no-memory baseline** (pure LLM, no persistent memory) |

> All systems used the same response LLM (Gemini 2.5 Flash Lite) to isolate the memory layeru2019s contribution. System-specific underlying LLMs used for memory processing (e.g., fact extraction, deduplication) were not standardized and may contribute to performance differences.

### Grading Criteria

- **Grades**: A (u226590%), B (u226575%), C (u226560%), F (<60%)
- **Automatic disqualification**: Any failure on `abstention` results in **F (abstention fail)**, regardless of other scores
- **F vs F(abstention fail)**: Plain F = overall recall weak. F(abstention fail) = strong recall but hallucination prevention fails.

---

## 3. The 12 Evaluation Categories

### ud83dudd35 Core Memory Capabilities

**1. direct_recall** (25 items, weight u00d71)
> *Can the AI retrieve explicitly stored facts?*
Example: User said u201cIu2019m a software engineer.u201d u2192 Later asks u201cWhatu2019s my job?u201d

**2. semantic_search** (25 items, weight u00d72)
> *Can the AI find memories by meaning, not just keyword?*
Example: User asks u201cTell me about my hobbiesu201d u2014 must connect multiple stored facts.

**3. proactive_recall** (20 items, weight u00d72)
> *Does the AI surface relevant memories without being explicitly asked?*
Example: User mentions Seoul trip u2192 AI spontaneously recalls u201cYou have a friend there.u201d

**4. abstention** (20 items, weight u00d72)
> *Does the AI refuse to answer about things never stored?*
Example: User never mentioned blood type u2192 AI must say u201cI donu2019t have that information.u201d Any failure = automatic F.

### ud83dudfe1 Advanced Memory Capabilities

**5. irrelevant_isolation** (15 items, weight u00d71)
> *Does the AI avoid injecting personal info into unrelated responses?*
Example: User asks how to sort a Python list u2192 AI must NOT interject u201cAs a software engineer, you mightu2026u201d

**6. multi_fact_synthesis** (20 items, weight u00d72)
> *Can the AI combine multiple memories for a complex answer?*
Example: u201cRecommend an activity next weeku201d u2192 must connect job, budget, hobbies, schedule.

**7. entity_disambiguation** (20 items, weight u00d72)
> *Can the AI distinguish between different entities with the same name?*
Example: Two stored people named u201cAlexu201d u2192 must infer from context which one.

**8. contradiction_direct** (20 items, weight u00d72)
> *Does the AI correctly update memory when given explicit new information?*
Example: u201cI quit my cafu00e9 jobu201d u2192 must update previously stored u201cworks part-time at cafu00e9.u201d

**9. contradiction_indirect** (15 items, weight u00d72)
> *Can the AI infer implied contradictions?*
Example: u201cItu2019s been three years since I quit smokingu201d u2192 must update previously stored u201csmokes daily.u201d

**10. noise_resilience** (20 items, weight u00d72)
> *Can the AI retrieve the correct memory amid irrelevant conversational noise?*

### ud83dudd34 Persistence & Temporal Capabilities

**11. unchanged_persistence** (15 items, weight u00d71)
> *After updating some memories, are unrelated memories still intact?*
Example: After updating job, does the system still remember name, age, hobbies correctly?

**12. temporal** (25 items, weight u00d72)
> *Can the AI recall past states and track changes over time?*
Example: u201cWhat was I doing two years ago?u201d u2014 even though the current state has changed.

---

## 4. Round 1 u2014 English (R5) Results

### Final Rankings u2014 R5 EN (GLM-5.1 Judge)

| Rank | System | Score | Raw | Grade |
|------|--------|-------|-----|-------|
| ud83eudd47 1 | **letta** | **87.5%** | 211/240 | F (abstention fail) |
| ud83eudd48 2 | **open-llm-vtuber** | **85.2%** | 206/240 | F (abstention fail) |
| ud83eudd49 3 | **naia** | **84.0%** | 197/240 | F (abstention fail) |
| 4 | mem0 | **83.1%** | 199/240 | F (abstention fail) |
| 5 | sillytavern | **79.8%** | 194/240 | F (abstention fail) |
| 6 | sap | **74.1%** | 175/240 | F (abstention fail) |
| 7 | graphiti | **55.8%** | 132/240 | F |
| 8 | openclaw | **43.3%** | 102/240 | F |
| 9 | airi (no-memory) | **33.9%** | 85/240 | F |

> All 9 systems received F. The top 6 failed `abstention` u2014 a pattern consistent with memory-confidence coupling: richer memory storage correlates with reduced ability to recognize knowledge boundaries. Score differences of fewer than 5pp fall within the u00b122% per-category statistical margin and should not be treated as definitive ranking. Specifically, **letta (87.5%), open-llm-vtuber (85.2%), naia (84.0%), and mem0 (83.1%) are statistically tied** at the top tier; sillytavern (79.8%) and sap (74.1%) form a distinct second tier.

### Category Breakdown u2014 R5 EN

| Category | letta | olv | **naia** | mem0 | silly | sap | graphiti | openclaw | airi |
|----------|-------|-----|------|------|-------|-----|----------|----------|------|
| direct_recall | 96% | 96% | 84% | 92% | **100%** | 68% | 24% | 4% | 4% |
| semantic_search | 96% | 96% | 92% | 96% | 84% | 92% | 4% | 16% | 44% |
| proactive_recall | **100%** | **100%** | 95% | 95% | 60% | 70% | 60% | 25% | 40% |
| abstention | 50% | 60% | 45% | 40% | 40% | 65% | **100%** | **100%** | **100%** |
| irrelevant_isolation | 80% | 73% | 60% | 53% | 60% | 33% | 67% | **100%** | 67% |
| multi_fact_synthesis | 75% | **100%** | **100%** | 95% | 70% | 95% | 15% | 25% | 0% |
| entity_disambiguation | 95% | 90% | 75% | 65% | 90% | 55% | 65% | 0% | 0% |
| contradiction_direct | 90% | 95% | 95% | 75% | 75% | 85% | **100%** | 70% | 50% |
| contradiction_indirect | 93% | 93% | **100%** | **100%** | **100%** | 73% | **100%** | 67% | 0% |
| noise_resilience | 90% | 65% | **100%** | **100%** | 90% | 85% | 95% | 95% | 50% |
| unchanged_persistence | 93% | **100%** | 47% | 93% | **100%** | 87% | 73% | 27% | **100%** |
| temporal | 92% | 64% | 80% | 84% | 96% | 60% | 8% | 20% | 0% |

> olv = open-llm-vtuber

---

## 5. Round 2 u2014 Korean (R6) Results

### Primary Rankings u2014 R6 KO (GLM-5.1 Judge Only)

The following table includes **only GLM-5.1-judged results** for direct comparability.

| Rank | System | KO Score | EN Score | ENu2192KO |
|------|--------|---------|---------|-------|
| ud83eudd47 1 | **letta** | **67.5%** | 87.5% | -20pp |
| ud83eudd48 2 | **naia** | **24.0%** | 84.0% | -60pp |
| ud83eudd48 2 | **mem0** | **24.0%** | 83.1% | -59pp |
| 4 | sillytavern | **17.6%** | 79.8% | -62pp |
| 5 | airi (baseline) | **16.0%** | 33.9% | -18pp |
| 6 | openclaw | **14.8%** | 43.3% | -29pp |
| 7 | open-llm-vtuber | **14.4%** | 85.2% | -71pp |
| 8 | sap | **12.9%** | 74.1% | -61pp |

### Supplementary Results u2014 R6 KO (Keyword Judge)

The following results used a keyword judge and **cannot be directly compared** to the GLM-judged table above. Based on cross-validation (naia EN: keyword 61% vs. GLM 83.5%), keyword scores are approximately 73% of equivalent GLM scores.

| System | KO Score (keyword) | EN Score (GLM) | Notes |
|--------|-------------------|----------------|-------|
| graphiti (clean re-run) | **27.1%** | 55.8% | See u00a77 for correction details |
| naia-local (R7 exp.) | **23.0%** | 84.0% | LocalAdapter + gemini-embedding-001 |

### Category Breakdown u2014 R6 KO (GLM-5.1)

| Category | letta | **naia** | mem0 | silly | airi | openclaw | olv | sap |
|----------|-------|---------|------|-------|------|----------|-----|-----|
| direct_recall | **88%** | 20% | 16% | 28% | 4% | 0% | 8% | 0% |
| semantic_search | **48%** | 12% | 12% | 0% | 4% | 0% | 0% | 0% |
| proactive_recall | **65%** | 5% | 10% | 0% | 0% | 10% | 0% | 5% |
| abstention | u26a0ufe0f40% | u26a0ufe0f**100%** | 90% | 70% | 95% | **100%** | **100%** | 85% |
| irrelevant_isolation | 93% | **100%** | **100%** | 93% | **100%** | **100%** | **100%** | **100%** |
| multi_fact_synthesis | **65%** | 5% | 15% | 10% | 5% | 5% | 5% | 5% |
| entity_disambiguation | **80%** | 10% | 20% | 15% | 5% | 0% | 5% | 5% |
| contradiction_direct | **55%** | 15% | 5% | 5% | 5% | 5% | 0% | 0% |
| contradiction_indirect | **67%** | 7% | 7% | 0% | 7% | 0% | 0% | 0% |
| noise_resilience | **65%** | 15% | 15% | 10% | 5% | 0% | 0% | 0% |
| unchanged_persistence | **87%** | 27% | 20% | 13% | 0% | 0% | 0% | 0% |
| temporal | **92%** | 20% | 20% | 16% | 4% | 0% | 0% | 0% |
| **TOTAL** | **67.5%** | **24.0%** | **24.0%** | **17.6%** | **16.0%** | **14.8%** | **14.4%** | **12.9%** |

---

## 6. Cross-Language Comparison

### ENu2192KO Score Drop (GLM-judged systems only)

```
System           EN (R5)   KO (R6)   u0394        Pattern
u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500u2500
letta            87.5%     67.5%     -20pp    Usable
airi (baseline)  33.9%     16.0%     -18pp    Baseline (no memory)
openclaw         43.3%     14.8%     -29pp    Below baseline
mem0             83.1%     24.0%     -59pp    Severe degradation
naia             84.0%     24.0%     -60pp    Severe degradation
sillytavern      79.8%     17.6%     -62pp    Severe degradation
sap              74.1%     12.9%     -61pp    Severe degradation
open-llm-vtuber  85.2%     14.4%     -71pp    Worst degradation
```

### The Baseline Reversal

A notable finding: **airi (no-memory baseline, 16.0%) outscores openclaw (14.8%), open-llm-vtuber (14.4%), and sap (12.9%)** in Korean. For these three systems, adding a memory layer reduced overall performance below what the base LLM alone achieved.

A likely explanation is context dilution: poorly retrieved or badly normalized Korean memories are injected into the LLMu2019s context, introducing noise that degrades response quality. This is consistent with the u201cLost in the Middleu201d phenomenon, where low-quality context injections harm rather than help language model outputs. The memory systemu2019s *retrieval implementation* produces noisy context u2014 the base LLM capability itself is not the failure point.

This does not imply memory is inherently harmful; it indicates that **retrieval quality in Korean must exceed a minimum threshold** before a memory layer provides net value over the baseline.

---

## 7. System-Specific Findings

### letta u2014 Strongest Korean Retention

letta is the only system with meaningful Korean performance, retaining 77% of its English score (87.5% EN u2192 67.5% KO, -20pp). Category analysis:
- **temporal 92%** (EN: 92%) u2014 near-identical performance across languages
- **direct_recall 88%** (EN: 96%) u2014 minor degradation
- **unchanged_persistence 87%** (EN: 93%) u2014 robust across languages
- **abstention 40%** u2014 lowest among all systems in both rounds

A plausible explanation is that lettau2019s internal task manager routes through Gemini API calls that process Korean input naturally, without English-only normalization steps. This hypothesis is consistent with the data but has not been independently verified by inspecting lettau2019s internals.

### graphiti u2014 Contamination Correction

**u26a0ufe0f Data integrity notice**: The initial R6 KO graphiti result (4%) was invalidated.

**What happened**: Run 2 crashed at fact #39, leaving 39 residual facts in the shared Neo4j database. Run 3 started on the same database u2014 Phase 2 evaluated against a near-empty knowledge graph.

**Clean re-run (run4)**: After clearing Neo4j and deleting checkpoint files, a fresh full run produced **27.1%** (keyword judge).

**Important caveat**: Between the contaminated run (3) and the clean re-run (4), **two variables changed simultaneously**: the database was cleared, and the judge was changed from GLM-5.1 to keyword. It is not possible to attribute the score change (4% u2192 27.1%) solely to the contamination fix. The keyword judgeu2019s different evaluation criteria may also contribute to the difference. The clean run4 result is presented as the best available data for graphitiu2019s Korean performance but requires GLM re-judging for a clean apples-to-apples comparison.

| | Contaminated run3 (GLM) | Clean run4 (keyword) |
|---|---|---|
| Score | 4% | **27.1%** |
| abstention | 0% | **100%** |
| irrelevant_isolation | 100% | 100% |
| semantic_search | 0% | **28%** |
| Judge | GLM-5.1 | Keyword |

### naia u2014 Korean Pipeline Analysis

**R6 KO result**: 24.0% (GLM). **Rank: 2nd (tied with mem0)**.

Bug fixes applied for R6:
1. **per-query consolidation removed**: Eliminated 3u00d7 `consolidateNow(force=true)` per query (O(nu00b2) over 1,000 facts)
2. **cacheId isolation**: `cache-ko` / `cache-en` separation

naia and mem0 both scoring 24.0% in Korean is consistent with a shared pipeline bottleneck. Both use the same Mem0Adapter with an English-optimized LLM for fact normalization. The identical score is a strong signal u2014 though with n=240 and binary scoring, coincidental convergence cannot be ruled out without further isolation testing.

**R7 Experiment u2014 LocalAdapter + gemini-embedding-001**:

To assess the contribution of embedding quality, a separate run (`naia-local`) used LocalAdapter with gemini-embedding-001 (3072d, MTEB multilingual rank #1). Result: **23.0%** (keyword) u2014 approximately the same as R6 naia 24.0% (GLM, with judge calibration applied).

This indicates that embedding quality alone is not the primary bottleneck. The `heuristicFactExtractor`, which stores entire episode content as facts, dilutes embeddings regardless of embedding model quality. An LLM-based atomic fact extractor is the likely higher-leverage intervention (see u00a79 Roadmap).

| Category | R6 naia (GLM) | R7 naia-local (keyword) | u0394 |
|----------|---------|---------------|---|
| direct_recall | 20% | 8% | -12pp |
| semantic_search | 12% | 8% | -4pp |
| multi_fact_synthesis | 5% | **20%** | +15pp |
| entity_disambiguation | 10% | **25%** | +15pp |
| noise_resilience | 15% | 0% | -15pp |
| unchanged_persistence | 27% | 0% | -27pp |

> R7 category scores use keyword judge; R6 uses GLM-5.1. Direct numerical comparison should account for the ~73% calibration factor.

Vector search improves broad-scope queries (multi_fact, entity_disambiguation) but worsens exact-match queries (direct_recall, unchanged_persistence) where keyword matching was previously more reliable. This trade-off suggests dual-path retrieval (embedding + keyword) as a more effective direction than switching embedding models alone.

---

## 8. Discussion

### Finding 1: The Korean Robustness Gap Is Likely Pipeline-Driven

Six of eight memory-capable systems show a 50u201371pp performance drop in Korean. This pattern is consistent with a common architectural characteristic: these systems use an LLM internally for memory processing (fact extraction, deduplication, entity normalization). If that internal LLM has English-centric alignment, it introduces errors when handling Korean text at storage time u2014 before retrieval even occurs.

Lettau2019s comparatively small drop (-20pp) is consistent with routing internal tasks through a more multilingual LLM layer. However, this remains a hypothesis based on observed behavior rather than direct inspection of internal system architecture.

Establishing this as a structural rather than incidental cause would require isolating each pipeline stage independently u2014 embedding, fact extraction, retrieval, and response generation u2014 to identify which component introduces the performance loss.

### Finding 2: Abstention Has Two Modes in Korean

In English, high-performing memory systems (letta, naia, mem0) score 40u201350% on abstention u2014 a consistent pattern across all memory-capable systems suggesting structural coupling between memory richness and false confidence.

In Korean, naia scores 100% on abstention. However, this is not evidence of improved confidence calibration. Rather, when storage fails (no usable Korean facts are indexed), retrieval returns empty results, and the LLM defaults to u201cI donu2019t have that informationu201d for every query u2014 including real queries. This *pseudo-abstention* achieves high abstention scores for the wrong reason: retrieval failure, not genuine uncertainty recognition.

A more rigorous abstention test should distinguish between *retrieval failure* (system has data, couldnu2019t find it) and *genuine abstention* (system correctly identifies a knowledge boundary).

### Finding 3: The Baseline Reversal Signals a Retrieval Quality Threshold

Three memory systems score below the no-memory baseline in Korean. This is best explained by context dilution: Korean memory pipelines that fail to normalize facts correctly inject noisy, partially-translated, or semantically garbled context into the response LLM, degrading its output quality below what it could achieve without any context injection.

This does not imply that memory architectures are fundamentally flawed. It implies that **retrieval quality must exceed a minimum quality threshold in the target language** before a memory layer provides net value. Systems that have not cleared this threshold in Korean should not be deployed as memory-augmented systems for Korean-speaking users.

### Finding 4: The Graphiti Graph-vs-Vector Trade-off Persists in Korean

Even the clean graphiti result (27.1% keyword) is consistent with the finding from R5: Neo4j-based graph traversal alone cannot substitute for vector similarity search. Categories that require semantic inference (noise_resilience 0%, contradiction_indirect 0%) fail regardless of language. Categories that rely on graph structure (contradiction_direct, irrelevant_isolation) pass. This is a consistent architectural characteristic across both languages.

### Multi-Perspective Analysis

This benchmark was independently reviewed by Gemini 2.5 Pro and GLM-5.1. Key perspectives from that review are incorporated here:

**On statistical confidence (GLM-5.1)**: With 20 queries per category, per-category margins of error reach u00b122%. Score differences of 1u20133pp in overall rankings should be treated as ties. The sample size is sufficient to identify large-scale patterns (50pp Korean drop) but not to rank closely-scoring systems with confidence.

**On the abstention paradox (Gemini 2.5 Pro)**: High-performing memory systems scoring low on abstention is not an individual implementation bug but a structural tension between memory richness and metacognition. Future memory systems need a separate confidence-scoring layer, not just better recall.

**On multilingual bias (GLM-5.1)**: GLM-5.1 was used as judge for both English and Korean rounds. If the judge model has English-centric alignment, it may systematically undervalue Korean responses that are semantically correct but stylistically non-native. This limitation applies to all GLM-judged Korean scores equally and cannot be corrected without human annotation baselines.

---

## 9. Limitations

1. **Translated fact bank**: The Korean facts and queries are translations of English originals. Native Korean authorship would produce more natural language patterns and may yield different results.

2. **Response LLM as confounding variable**: All systems used the same response LLM (Gemini 2.5 Flash Lite), but memory systems use different internal LLMs for memory processing. Observed Korean performance reflects the full pipeline u2014 memory layer + internal LLMs + response LLM u2014 not the memory architecture in isolation. A system that uses a multilingual internal LLM (like letta) has a structural advantage unrelated to memory design per se.

3. **Judge reliability**: GLM-5.1 was used as evaluator but its own Korean alignment has not been independently validated against human graders. Systematic judge bias would affect all Korean scores uniformly, but relative rankings would be preserved.

4. **Cross-judge comparisons**: Keyword-judged results (graphiti run4, naia-local) are presented in a separate table to avoid direct comparison with GLM-judged results. The calibration factor (~73%) is derived from a single cross-validation data point (naia EN) and may not generalize across systems or categories.

5. **Graphiti correction confound**: The graphiti clean re-run changed two variables simultaneously: database state and judge. The score improvement (4% u2192 27.1%) cannot be cleanly attributed to either change alone.

6. **Static benchmark**: 1,000 facts and 240 queries do not capture real-world scaling, latency, or token cost dynamics. Results are accuracy-only.

7. **Reproducibility**: Full reproducibility requires the 240 query sets (EN and KO), judge prompts, keyword scoring rules, and per-system configuration (embedding models, chunking strategies, internal LLMs). These artifacts are not published with this report.

---

## 10. Estimated Speed and Cost

*Architecture-based estimates from R5 EN adapter source code analysis: latency estimated by counting synchronous API call patterns in each adapter's retrieval path (embed calls, LLM calls, DB queries); cost estimated from benchmark-measured average context injection sizes. No wall-clock timing was performed. Actual values will vary by network conditions, model load, and hardware.*

### Estimated Search Latency

| System | Retrieval Method | Estimated Latency |
|--------|-----------------|------------------|
| graphiti | Neo4j Cypher only | ~50ms |
| naia | Gemini embed API + local HNSW | ~100ms |
| mem0 | Gemini embed API + SQLite vector | ~105ms |
| openclaw | Gemini embed API + FTS5 hybrid | ~105ms |
| sap | Gemini embed API + FAISS + BM25 | ~110ms |
| letta | Gemini embed API + Letta server | ~300ms |
| sillytavern | Local transformers.js + vectra | ~500ms |
| open-llm-vtuber | LLM recall call + embed + search | ~2,500ms |
| airi | None (no-memory) | 0ms |

### Estimated Cost Structure (addFact)

| System | addFact API Calls | Context Injection (avg) |
|--------|------------------|-------------------------|
| airi | None | 0 chars |
| graphiti | LLM u00d71 + Neo4j write | 166 chars |
| **naia** | **embed u00d71 only** | 320 chars |
| mem0 | LLM u00d71 + embed u00d71 | 320 chars |
| letta | LLM u00d71 + embed u00d71 | 259 chars |
| sap | LLM u00d71 + embed u00d71 | 334 chars |
| sillytavern | Local embed (free) | 527 chars |

> naia uses embed-only at storage time (no LLM addFact calls), giving it the lowest per-interaction API cost among memory-capable systems.

---

## 11. Naia Improvement Roadmap

### P0 u2014 LLM Atomic Fact Extractor (Highest Priority)

The R7 experiment indicates that the storage layer, not the retrieval layer, is likely the primary bottleneck. `heuristicFactExtractor` stores full episode content as facts, producing long mixed-content strings that dilute embedding signals. A gemini-flash-based extractor would produce atomic facts:
- u201cUser indent style: tabu201d
- u201cUseru2019s job: software engineeru201d

Expected impact: direct_recall +30pp, unchanged_persistence +20pp, noise_resilience +25pp (estimates; subject to validation).

### P1 u2014 topK Increase (17 u2192 30+)

Broader retrieval improves noise_resilience and multi_fact_synthesis at the cost of higher context injection size.

### P2 u2014 Confidence-Gated Abstention

After P0, when fact storage is clean, add cosine similarity threshold for genuine abstention. Expected to restore abstention from pseudo-abstention (retrieval failure) to genuine confidence calibration.

### P3 u2014 Bi-Temporal Fact Model

Add `valid_from`/`valid_until` timestamps per fact. Fixes unchanged_persistence cascade delete (naia-os#221) and enables past-state recall for temporal queries.

### P4 u2014 Dual-Path Retrieval

Parallel keyword (BM25) + embedding paths with RRF fusion. Addresses the trade-off observed in R7: vector search helps multi_fact but hurts direct_recall; keyword does the reverse. Both paths together should improve both.

---

## 12. Conclusion

1. **English memory systems have matured, but abstention is universally unsolved.** Top systems reach 84u201388% in English. All 9 received F grades due to abstention failures u2014 a pattern consistent with structural coupling between memory richness and false confidence.

2. **Korean reveals a severe robustness gap in systems built on English-first pipelines.** Six of eight memory systems show 50u201371pp drops when switching from English to Korean input. letta retains 77% of its English performance; all others retain 17u201329%.

3. **Three memory systems score below the no-memory baseline in Korean.** This indicates that retrieval quality in Korean falls below the threshold needed for net positive contribution. These systems should not be deployed as memory-augmented systems for Korean users without significant pipeline improvements.

4. **Naiau2019s Korean bottleneck is likely in fact storage, not retrieval.** The R7 vector search experiment (23% keyword, same as R6 24% GLM adjusted) indicates that switching embedding models does not close the gap. LLM-based atomic fact extraction (P0) is the higher-leverage next step.

5. **Benchmark methodology: judge consistency and DB isolation are critical.** Mixed judge types in a single ranking table produce false equivalences. The graphiti contamination incident demonstrates the importance of clean state isolation between runs.

---

## Appendix A: Per-Adapter Summary

**letta** u2014 EN 87.5% / KO 67.5% (-20pp). Strong across temporal, direct_recall, proactive. Weak: abstention (50% EN / 40% KO).

**open-llm-vtuber** u2014 EN 85.2% / KO 14.4% (-71pp). EN standout on multi_fact, persistence, proactive. Korean: near-total collapse.

**naia** u2014 EN 84.0% / KO 24.0% (-60pp). EN strengths: multi_fact(100%), contradiction_indirect(100%), noise_resilience(100%). Korean pipeline bottleneck: heuristicFactExtractor + Mem0Adapter LLM dedup.

**mem0** u2014 EN 83.1% / KO 24.0% (-59pp). Near-identical to naia in Korean; consistent with shared Mem0Adapter pipeline.

**sillytavern** u2014 EN 79.8% / KO 17.6% (-62pp). EN memory persistence specialist. Korean: all active recall categories at 0%.

**sap** u2014 EN 74.1% / KO 12.9% (-61pp). Below no-memory baseline in Korean.

**graphiti** u2014 EN 55.8% / KO 27.1%u2020 (keyword). Graph-only retrieval: strong on contradiction, weak on semantic search in both languages. KO result is keyword-judged; see u00a77 for correction details.

**openclaw** u2014 EN 43.3% / KO 14.8% (-29pp). Below no-memory baseline in Korean.

**airi (baseline)** u2014 EN 33.9% / KO 16.0% (-18pp). No memory; outperforms 3 memory systems in Korean. Establishes the minimum bar memory systems must exceed.

---

## Appendix B: Methodological Notes

1. **Scoring**: Weighted pass rate = u03a3(passedu1d62 u00d7 wu1d62) / u03a3(totalu1d62 u00d7 wu1d62). Weights: direct_recall u00d71, irrelevant_isolation u00d71, unchanged_persistence u00d71; all others u00d72.

2. **graphiti contamination**: Initial KO result (4%, GLM) from run3 was invalidated due to shared database state with crashed run2. Clean re-run (run4) used keyword judge: 27.1%. Two variables changed between runs (DB state + judge). Both results documented; GLM re-judge needed for clean comparison.

3. **naia R6 bug fixes**: per-query O(nu00b2) consolidation removed; cacheId isolation (cache-ko / cache-en). EN re-run after fixes: 83.5% GLM u2014 no regression from R5 84.0%.

4. **starnion**: Included in R5 EN (44/240, 17%) but excluded from R6 KO due to runtime issues.

5. **Judge calibration**: Cross-validation on naia EN shows keyword u2248 73% of GLM score. This calibration factor is from a single system/language data point and may not generalize.

---

*Report covers Alpha Memory Benchmark R5 EN (2026-04-12) and R6 KO (2026-04-13).*
*R5 EN judge: GLM-5.1 | R6 KO judge: GLM-5.1 (primary), keyword (graphitiu2020, naia-localu2020)*
*Response LLM: Gemini 2.5 Flash Lite | 9 systems u00d7 240 queries u00d7 2 languages*
*Revised: 2026-04-14 (incorporating Gemini 2.5 Pro and GLM-5.1 peer review feedback)*
