# Alpha Memory Benchmark R5 — Comprehensive Report

**AI Memory System Comparative Evaluation — English Environment (April 2026)**

> Official results report for the Alpha Memory R5 English Benchmark.
> Three AIs (Claude Sonnet, Gemini 2.5 Pro, GLM-5.1) independently analyzed the data,
> then reached a final consensus through structured discussion.

---

## 1. Project Overview

### Why Do AI Systems Need Memory?

The longer you talk with an AI, the more useful it should become. If an AI can't remember that you're a software engineer, have two cats, and hate mornings, you have to re-introduce yourself every time — which defeats the purpose of having a personal AI. But simply "remembering more" isn't the answer either. Systems that store too much tend to generate confident-sounding but fabricated answers, a phenomenon called **hallucination**.

**Alpha Memory** is a cognitive memory architecture designed to solve this problem, drawing inspiration from how the human brain actually stores and retrieves information.

### What Is Alpha Memory?

Alpha Memory is the core memory package for **Naia OS** (Nextain's open-source AI desktop OS). It implements a **4-store memory model** analogous to the human brain:

| Store | Brain Analog | What It Holds |
|-------|-------------|---------------|
| **Episodic** | Hippocampus | Timestamped events and experiences |
| **Semantic** | Neocortex | Facts, concepts, relationships |
| **Procedural** | Basal Ganglia | Skills, strategies, learned patterns |
| **Working** | Prefrontal Cortex | Active context for the current conversation |

Key technical mechanisms:
- **Importance-gated encoding (3-axis scoring)**: Evaluates memory value as Importance × Surprise × Emotion
- **Ebbinghaus forgetting curve**: Simulates natural memory decay over time
- **Knowledge graph**: Connects people, places, and relationships for contextual search
- **Contradiction detection**: Automatically identifies and resolves conflicts with existing memories upon retrieval

---

## 2. Test Design

### How Was the Benchmark Run?

**Setup:**
- Language: English
- Persona: A fictional character with 1,000 stored facts (job, hobbies, family, past experiences, etc.)
- Total test items: 240 queries across 12 capability categories
- Scoring method: GLM-5.1 LLM judge using semantic (meaning-based) evaluation, not keyword matching
- Response model: Gemini 2.5 Flash Lite (same conditions for all systems)

**9 Systems Evaluated:**

| System | Description |
|--------|-------------|
| **naia** | Alpha Memory (this project) — 4-store cognitive architecture |
| **letta** | Letta (formerly MemGPT) — agent memory management framework |
| **mem0** | mem0 OSS — open-source memory layer for LLM applications |
| **open-llm-vtuber** | Open-LLM-VTuber — VTuber streaming AI character memory |
| **sillytavern** | SillyTavern — roleplay chatbot memory |
| **sap** | SAP AI Core memory component |
| **graphiti** | Graphiti (getzep) — Neo4j temporal knowledge graph |
| **openclaw** | OpenClaw — lightweight memory layer |
| **airi** | AIRI (moeru-ai) — **no-memory baseline** (pure LLM, no persistent memory) |

> `airi` is included as a baseline — a pure LLM with no memory system — to show what performance looks like without any memory.

### Grading Criteria

- **Weighted pass rate** across core test items
- **Grades**: A (≥90%), B (≥75%), C (≥60%), F (<60%)
- **Special disqualification**: Any failure on the `abstention` (hallucination prevention) category results in **F (abstention fail)**, regardless of other scores

### Speed and Cost: Architecture-Based Estimates

R5 measured accuracy only. But selecting a memory module for naia-os requires evaluating speed and cost alongside accuracy — you cannot make a real deployment decision without them. We did not time the runs directly, but **adapter code analysis** and **actual context-size data collected during the benchmark** make meaningful estimates possible.

**Premise: Background Memory Module**

In a real application like naia-os, the memory module operates at two touch points:
- **addFact (memory storage)**: Runs asynchronously after each user utterance. Does not block response generation. **Affects operating cost.**
- **search (memory retrieval)**: Runs synchronously before response generation. **Directly affects the latency the user feels.**

AddFact cost is an operational (billing) metric. Search latency is a UX metric.

**Search Latency Estimates (UX Impact)**

Based on adapter code analysis:

| System | Retrieval method | Estimated latency |
|--------|-----------------|------------------|
| graphiti | Neo4j Cypher only (no LLM, no embed) | ~50ms |
| naia | Gemini embed API + local HNSW | ~100ms |
| mem0 | Gemini embed API + SQLite vector | ~105ms |
| openclaw | Gemini embed API + FTS5 hybrid | ~105ms |
| sap | Gemini embed API + FAISS + BM25 | ~110ms |
| letta | Gemini embed API + Letta server round-trip | ~300ms |
| sillytavern | Local transformers.js + vectra | ~500ms |
| open-llm-vtuber | LLM recall call + embed + search | ~2,500ms |
| airi | None (no-memory) | 0ms |

> All systems use the same response LLM (Gemini 2.5 Flash Lite). Latency differences between systems are **purely architectural** — the memory retrieval layer only.

**Cost Structure (addFact API calls + context token burn)**

Combined with actual context-size measurements from the benchmark:

| System | addFact API calls | Context size (measured avg) | Notes |
|--------|------------------|-----------------------------|-------|
| airi | None | 0 chars | No memory |
| graphiti | LLM ×1 + Neo4j write | 166 chars | No LLM at search time |
| open-llm-vtuber | LLM **×2** + embed ×1 | 242 chars | LLM used for both add and recall |
| letta | LLM ×1 + embed ×1 | 259 chars | LLM-based add and retrieval |
| naia | embed ×1 only | 320 chars | No LLM at add time — cost advantage |
| mem0 | LLM ×1 + embed ×1 | 320 chars | Same accuracy as naia, 2× add cost |
| sap | LLM ×1 + embed ×1 | 334 chars | mem0 variant with FAISS+BM25 |
| sillytavern | Local embed (free) | 527 chars | Zero API cost, but high context injection |
| openclaw | embed ×1 | 0 chars (retrieval failed) | No usable results despite embed cost |

> Context size is the average number of characters of memory context actually passed to the LLM per query in the benchmark. Higher context means higher input token cost per response.

**Evaluation from a naia-os Deployment Perspective**

| Dimension | naia assessment | Improvement direction |
|-----------|----------------|-----------------------|
| Search latency | Good (~100ms) | Replace Gemini embed API with local model → near-zero latency |
| addFact LLM calls | **None (advantage)** | letta/mem0/sap/olv all require 1–2 LLM calls per add; naia uses embed only |
| Context injection | Moderate (320 chars avg) | Below sillytavern (527), above graphiti (166) — reasonable |
| Embedding backend | Gemini API (external) | **No local embedding option** — sillytavern runs fully free locally; naia-os users must supply an API key |

**Key takeaway**: naia has the lowest addFact cost among memory-capable systems (no LLM calls). Search latency is acceptable. The structural gap is **external API dependency for embeddings** — solvable by adding a local embedding backend (e.g., `nomic-embed-text`, `all-MiniLM-L6-v2`), which is a concrete near-term improvement target for naia-os integration.

---

## 3. The 12 Evaluation Categories Explained

### 🔵 Core Memory Capabilities

**1. direct_recall** — 25 items
> *"Can the AI retrieve explicitly stored facts?"*

Example: The user told the AI "I'm a software engineer." Later asks: "What's my job?" Does it answer correctly?

**2. semantic_search** — 25 items
> *"Can the AI find relevant memories by meaning, not just keyword?"*

Example: User asks "Tell me about my hobbies." The AI must connect stored facts about reading, hiking, etc. — a pure keyword search wouldn't work here.

**3. proactive_recall** — 20 items
> *"Does the AI proactively surface relevant memories without being asked?"*

Example: User says "I'm planning a trip to Seoul." The AI should spontaneously mention "Oh, you have a friend there, right?" — measuring active suggestion, not passive response.

**4. abstention** — 20 items
> *"Does the AI refuse to answer about things never stored?"*

Example: The user never mentioned blood type. When asked "What's my blood type?" — if the AI fabricates an answer, it FAILS. If it says "I don't have that information," it PASSES. Any failure here gives the entire system an automatic F.

### 🟡 Advanced Memory Capabilities

**5. irrelevant_isolation** — 15 items
> *"Does the AI avoid injecting personal information into unrelated responses?"*

Example: User asks "How do you sort a Python list?" — if the AI responds "Hi John, as a software engineer you might like this..." it FAILS. Personal info should stay out of irrelevant queries.

**6. multi_fact_synthesis** — 20 items
> *"Can the AI combine multiple memories to generate a complex answer?"*

Example: "Recommend an activity for next week considering my preferences." Requires simultaneously connecting job, budget, hobbies, and schedule facts.

**7. entity_disambiguation** — 20 items
> *"Can the AI distinguish between different people/things with the same name?"*

Example: Two stored people named "Alex" (friend Alex the developer, brother Alex the doctor). When asked "How's Alex doing?" — can the AI figure out which Alex from context?

**8. contradiction_direct** — 20 items
> *"Does the AI correctly update its memory when given explicit new information?"*

Example: User says "I quit my café part-time job." Does the AI correctly update the previously stored "currently working part-time at café" memory?

**9. contradiction_indirect** — 15 items
> *"Can the AI infer implied contradictions?"*

Example: User says "It's been three years since I quit smoking." The AI should automatically update the previously stored "smokes daily" memory — no explicit update command given.

**10. noise_resilience** — 20 items
> *"Can the AI retrieve the correct memory amid irrelevant noise?"*

Example: During a conversation filled with unrelated topics, can the AI accurately pull out the specific memory it needs?

### 🔴 Persistence & Temporal Capabilities

**11. unchanged_persistence** — 15 items
> *"After updating some memories, are the other memories still intact?"*

Example: After updating "job," does the system still correctly remember name, age, hobbies? Measures whether updates have unintended side effects.

**12. temporal** — 25 items
> *"Can the AI recall past states and track changes over time?"*

Example: "What did I do two years ago?" — even though the current state has changed, can the AI recall what things were like at a specific past time?

---

## 4. Results

### Final Rankings

| Rank | System | Score | Accuracy | Grade |
|------|--------|-------|----------|-------|
| 🥇 1 | **letta** | 211/240 | **87.5%** | F (abstention fail) |
| 🥈 2 | **open-llm-vtuber** | 206/240 | **85.2%** | F (abstention fail) |
| 🥉 3 | **naia** | 197/240 | **84.0%** | F (abstention fail) |
| 4 | mem0 | 199/240 | **83.1%** | F (abstention fail) |
| 5 | sillytavern | 194/240 | **79.8%** | F (abstention fail) |
| 6 | sap | 175/240 | **74.1%** | F (abstention fail) |
| 7 | graphiti | 132/240 | **55.8%** | F |
| 8 | openclaw | 102/240 | **43.3%** | F |
| 9 | airi (no-memory) | 85/240 | **33.9%** | F |

> **Note**: All 9 systems received an F grade. "F (abstention fail)" means the system has strong recall but fails hallucination prevention. Plain "F" means overall recall is weak.

### Category-by-Category Scores

| Category | letta | olv | naia | mem0 | silly | sap | graphiti | openclaw | airi |
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

## 5. Three AI Analyses

---

### [Claude Sonnet's Analysis]

The R5 results quantitatively expose a **fundamental trade-off between memory capacity and self-awareness**.

**Technical Analysis**: Naia's 3rd place (84.0%) is respectable, but abstention (45%) and unchanged_persistence (47%) are its Achilles heel. Paradoxically, both failures stem from the same root — the richer the memory, the more confidently a system answers questions it shouldn't know, and the blurrier the boundary becomes between what was updated and what wasn't. Graphiti illustrates the limits of Neo4j-based knowledge graphs: contradiction 100% is a structural strength, but semantic_search 4% proves that graph traversal cannot substitute for embedding-based similarity search.

**Design Insight**: Letta took 1st not by optimizing a single metric but through balance. The coexistence of direct_recall 96% and proactive_recall 100% suggests its retrieval (reactive) and recommendation (proactive) paths are separately designed. The maturity of a memory system is measured not by "how much it remembers" but by **"when it says it doesn't know."**

**Naia Improvement Directions**:
1. **Confidence-gated recall**: Add logic to suppress responses when retrieval cosine similarity falls below a threshold (restoring abstention performance)
2. **Immutable snapshot store**: Preserve old facts with a `superseded` tag before updates — solving temporal and unchanged_persistence simultaneously
3. **Dual-path retrieval**: Parallel keyword path (direct_recall) + embedding path (semantic) with cross-validation

**Original Observations**:
- airi's abstention 100% is a dark joke — no memory means no hallucination. This reveals that what memory systems must solve isn't "storage" but **"boundary recognition."**
- The consistent abstention decline (40–65%) across all memory-capable systems is not an individual implementation bug but a **structural coupling between memory and confidence**. A separate "uncertainty modeling" layer needs to become an industry standard.
- Naia's noise_resilience 100% demonstrates the 4-store architecture's real potential. The cognitive complexity actually contributes to noise filtering.
- The multi_fact_synthesis 100% / abstention paradox: "connect what can be connected" vs. "don't create what isn't there" are opposing directions. No system currently satisfies both. This may be AI memory's fundamental binary dilemma.

---

### [Gemini 2.5 Pro's Analysis]

This benchmark raises important questions about what each AI memory system feels like to users, and how we should evaluate AI "intelligence."

**Product/UX Perspective**: Each system offers a different texture of experience.

- **letta/open-llm-vtuber (87–85%)**: Like working with an assistant who has extraordinary recall and proactively surfaces relevant information (proactive_recall 100%). This is the experience of a true "AI companion."
- **naia (84%)**: The system with the most potential, though not fully mature. noise_resilience and contradiction_indirect at 100% show the stability of "memories that don't get confused." But abstention at 45% creates the ironic situation of "knowing too much to say I don't know."
- **graphiti (55.8%)**: A system with a completely different philosophy. It maintains perfect memory consistency but cannot surface memories in natural language. Optimized for data integrity over user experience.
- **airi (33.9%, no-memory)**: Ironically, abstention 100%. Knowing nothing means nothing can be wrong. This shows that saying "I don't know" is not a sign of intelligence.

**Ecosystem Perspective — What System Fits Where?**

- Proactive AI companion/assistant apps: **letta** (proactive recall, balance)
- AI roleplay/fictional characters: **sillytavern** (temporal 96%, persistence 100%)
- Long-term knowledge management platforms: **naia** (multi_fact_synthesis, contradiction_indirect both 100%)
- Enterprise data integrity systems: **graphiti** (perfect contradiction handling, data consistency)

**The "Abstention Paradox" and AI Trustworthiness**

The most fascinating finding is the inverse relationship: the stronger the memory, the lower the abstention score. letta 50%, naia 45%, mem0 40%... while no-memory airi scores 100%.

What this means: rich memories increase confidence, and overconfidence leads to hallucination. AI trustworthiness lies not in "knowing many things" but in **"knowing that you don't know (metacognition)."** Future AI memory systems must develop not just recall capability but also **explicit uncertainty representation**.

**Original Observations**:
- This benchmark measures "recall" but truly useful memory systems also need **reflection** — the ability to learn from past mistakes. Future benchmarks should add this dimension.
- The cost of memory is unmeasured. Perfect memory isn't free — it comes with token costs, response latency, and storage overhead. Practical AI systems need efficient forgetting to selectively retain what matters.
- airi's unchanged_persistence 100% means "nothing changed, so nothing was lost" — a structural advantage that static systems have over dynamic ones in specific metrics.

---

### [GLM-5.1's Analysis]

**1. Implementation-Focused Architecture Analysis**

Each system's architectural choices produce distinct performance profiles. **letta** (87.5%) and **open-llm-vtuber** (85.2%) are optimized for agent context management, dominating direct_recall (96%) and proactive_recall (100%). **naia** (84.0%) achieves noise_resilience (100%) and contradiction_indirect (100%) thanks to its 4-store structure, but a critical bug (naia-os#221) causes cascade deletion of unrelated memories during fact updates, crashing unchanged_persistence to 47%. **sillytavern** (79.8%) excels at temporal (96%) due to its roleplay nature but underperforms on proactive recall (60%).

**2. The Graphiti Anomaly**

**graphiti**'s extremes — contradiction 100% vs. semantic_search 4% — reveal the structural nature of Neo4j-based knowledge graphs. This system perfectly maintains node relationships and temporal consistency but has almost no ability to infer ambiguous natural language context through vector similarity. **Conclusion: graph databases and vector databases are complementary, not interchangeable.** Without vector search, a knowledge graph alone cannot serve as general-purpose AI memory.

**3. Practical Recommendation: Building an AI Companion App**

I would choose #1 **letta**. The core of a companion is proactive_recall (100%) — surfacing memories without being asked — and accurate recall (96%). While abstention (50%) makes it vulnerable to hallucination (F grade), in a companion app, being unable to recall anything is far more fatal than occasionally over-recalling.

**4. Critical Perspectives on Benchmark Design**

1. **The abstention paradox**: Memory-less airi/openclaw scoring 100% on abstention is a benchmark design limitation — it rewards the absence of capability.
2. **Static test limitations**: A 1,000-fact bank doesn't measure real-world token costs, response latency, or scalability.
3. **Multilingual bias**: English-based testing means performance in Korean, Japanese, or other languages is unknown.
4. **User adaptation unmeasured**: No assessment of how systems adapt to individual users' unique speech patterns and expression styles.

---

## 6. Three-AI Discussion: Areas of Consensus

After independent analysis, the three AIs exchanged views on key points of debate.

### Consensus 1: The "Abstention Paradox" Is an Unsolved Industry-Wide Challenge

**Claude**: Structural coupling between memory and confidence — a separate uncertainty modeling layer is needed.

**Gemini**: From a user trust standpoint, saying "I don't know" is the true measure of AI maturity.

**GLM**: The benchmark design itself doesn't fairly measure this — airi's 100% is "successful failure."

**Consensus**: High-performance memory systems scoring low on abstention is a structural tension, not an implementation bug. Next-generation memory systems need a separate layer to manage **"retrieval confidence scores."**

### Consensus 2: Graphiti Isn't Failing — It's Playing a Different Game

**Claude**: semantic_search 4% shows that graph traversal and embedding search are fundamentally different technologies.

**Gemini**: For data integrity and enterprise settings, graphiti may actually be the right choice. It needs a different evaluation framework.

**GLM**: Graph DB and vector DB are complementary. A hybrid architecture combining both is the answer.

**Consensus**: Ranking memory systems by a single metric has fundamental limitations. The optimal system varies by use case, and this benchmark is biased toward the "AI companion" scenario.

### Consensus 3: Naia's Current Position and What It Must Fix

**Claude**: 84% is a good start, but without fixing abstention (45%) and unchanged_persistence (47%), practical deployment is difficult.

**Gemini**: noise_resilience and multi_fact_synthesis at 100% are competitive differentiators. Must preserve these strengths while addressing weaknesses.

**GLM**: unchanged_persistence is a bug (naia-os#221), not a capability limit. Re-benchmark after the fix.

**Consensus**: Naia is currently "a high-potential but incomplete system." Fixing a single bug (#221) could significantly shift its ranking.

---

## 7. Naia Improvement Roadmap

### Short-Term (1–2 Sprints)

**[P0] Fix naia-os#221 — unchanged_persistence bug**
- Root cause: Cascade overwrite of related entities during contradiction resolution
- Fix: Entity-level transaction isolation; only update the targeted attribute
- Expected impact: unchanged_persistence 47% → 85%+

**[P1] Confidence-gated recall — abstention improvement**
- When retrieval cosine similarity < 0.75, explicitly return "no such information"
- Expected impact: abstention 45% → 70%+

### Mid-Term (1 Quarter)

**[P2] Bi-temporal model — temporal improvement**
- Add `valid_from` and `valid_until` timestamps to each fact
- Enables past-state queries: "What was I doing two years ago?"
- Expected impact: temporal 80% → 90%+

**[P3] Dual-path retrieval — direct_recall/semantic improvement**
- Parallel BM25 keyword path + embedding path, combined with RRF (Reciprocal Rank Fusion)
- Expected impact: direct_recall 84% → 92%+

### Long-Term (2026 H2)

**[P4] Explicit uncertainty layer**
- Include confidence scores in all recall responses
- Add LLM prompt instruction: "Explicitly flag information with confidence below X%"

**[P5] Memory efficiency optimization**
- Ebbinghaus curve-based automatic compression and archival
- Target: 50% reduction in token costs

---

## 8. Conclusion

### What This Benchmark Reveals

1. **AI memory has entered the maturity stage**: letta (87.5%) and naia (84.0%) scores show that AI can evolve beyond simple Q&A tools into genuinely "remembering AI" systems.

2. **A perfect memory system doesn't exist yet**: All 9 systems received F grades. The universal failure pattern on hallucination prevention suggests this is an industry-wide unsolved challenge.

3. **"What you say you don't know" matters more than "what you know"**: The abstention paradox reveals that AI trustworthiness lies in metacognition, not information volume.

4. **Architecture determines destiny**: A single architectural choice (like Neo4j) consistently impacts every category score. Memory system design is a philosophical choice, not just implementation.

### Next Steps

- **R6 Korean Benchmark**: Same methodology applied to Korean-language environment
- **Re-benchmark after naia-os#221 fix**: Verify bug fix impact
- **Dedicated abstention evaluation**: Design new categories to more precisely measure metacognition capability
- **R7 Speed/Cost Benchmark**: Measure memory retrieval latency (ms) and per-query token cost with equal weighting alongside accuracy. Include naia 4-store embedding cost vs. single-store alternatives for real deployment viability

---

## Appendix: Per-Adapter Strengths & Weaknesses Summary

**letta (87.5%)** — Champion of balance
- Strong: proactive_recall(100%) · direct_recall(96%) · semantic_search(96%)
- Weak: abstention(50%) · multi_fact_synthesis(75%)

**open-llm-vtuber (85.2%)** — Dark horse
- Strong: multi_fact_synthesis(100%) · unchanged_persistence(100%) · proactive_recall(100%)
- Weak: temporal(64%) · noise_resilience(65%)

**naia (84.0%)** — High potential, known bug
- Strong: multi_fact_synthesis(100%) · contradiction_indirect(100%) · noise_resilience(100%)
- Weak: abstention(45%) · unchanged_persistence(47%)

**mem0 (83.1%)** — Superior search quality
- Strong: contradiction_indirect(100%) · noise_resilience(100%) · semantic_search(96%)
- Weak: entity_disambiguation(65%) · abstention(40%) ← lowest

**sillytavern (79.8%)** — Memory persistence specialist
- Strong: direct_recall(100%) · contradiction_indirect(100%) · unchanged_persistence(100%)
- Weak: proactive_recall(60%) · abstention(40%)

**sap (74.1%)** — Solid but incomplete
- Strong: multi_fact_synthesis(95%) · semantic_search(92%)
- Weak: irrelevant_isolation(33%) · entity_disambiguation(55%)

**graphiti (55.8%)** — A different philosophy
- Strong: abstention(100%) · contradiction(100%) · noise_resilience(95%)
- Weak: semantic_search(4%) · temporal(8%) · direct_recall(24%)

**openclaw (43.3%)** — Safety-first bias
- Strong: abstention(100%) · irrelevant_isolation(100%) · noise_resilience(95%)
- Weak: direct_recall(4%) · entity_disambiguation(0%)

**airi (33.9%)** — No-memory baseline
- Strong: abstention(100%) · unchanged_persistence(100%)
- Weak: temporal(0%) · multi_fact_synthesis(0%) · contradiction_indirect(0%)

---

*This report is based on the Alpha Memory R5 EN Benchmark results (2026-04-12).*
*Judge: GLM-5.1 | Response LLM: Gemini 2.5 Flash Lite | Total: 9 adapters × 240 items*
*Co-analysis: Claude Sonnet, Gemini 2.5 Pro, GLM-5.1*
