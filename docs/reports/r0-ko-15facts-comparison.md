# Naia Memory System — Benchmark Comparison Report

**Project**: Naia OS — Alpha Memory System
**Issues**: #172 Similar Project Benchmark Comparison, #173 P2 Improvements
**Period**: 2026-03-28 ~ 2026-03-30
**Author**: AI Agent (Claude Opus 4.6)

---

## 1. What This Report Answers

> "How does Naia's memory system compare to other projects?"

We ran the same tests against 9 open-source projects and compared the results.

---

## 2. Projects Compared

| Project | GitHub Stars | What It Does | Memory Approach |
|----------|:-----------:|--------------------------|-----------|
| **Letta (MemGPT)** | 21.8K | Stateful AI agent platform | 3-tier memory (core/archival/recall) |
| **Naia** | — | Personal AI OS (our project) | 4-Store + vector search |
| **Naia (Cline)** | 59.6K | IDE autonomous coding agent | SQLite + vector + text hybrid |
| **Super Agent Party** | 2.0K | All-in-one AI companion | mem0 + FAISS vector |
| **mem0** | 51.4K | General-purpose AI memory library | Vector DB + LLM fact extraction |
| **jikime-adk** | 5 | Legacy code modernization tool | SQLite text search |
| **jikime-mem** | 0 | Claude Code session memory | SQLite text search |
| **project-airi** | 36.2K | AI companion (games, voice) | Memory not implemented (WIP) |
| **Open-LLM-VTuber** | 6.4K | Voice AI VTuber | No memory (conversation history only) |

**Not tested**: Zep (4.3K) — requires OpenAI API key, unable to test

---

## 3. How We Tested

### 3.1 Test Structure

```
[15 facts input] → [store in memory system] → [55 questions] → [LLM response generation] → [automated scoring]
```

All systems receive the **same facts**, are asked the **same questions**, and are scored on the **same criteria**.

### 3.2 Input Facts (Examples)

| ID | Fact |
|----|------|
| F01 | "My name is Kim Ha-neul. I'm a startup CEO and full-stack developer" |
| F03 | "I use Neovim as my editor" |
| F07 | "I only drink americano coffee. I dislike anything with milk" |
| F12 | "I usually go running on weekends. I like running along the Han River" |

Total: 15 facts + 3 changes (editor Neovim→Cursor, address Seongsu-dong→Pangyo, etc.) + small talk noise

### 3.3 12 Test Categories

Each category measures a different capability of the memory system:

| Category | Weight | What It Measures | Example Question |
|----------|:------:|------------------|----------|
| **Direct Recall** | 1 | Answers when directly asked about stored facts | "What's my name?" → "Kim Ha-neul" |
| **Semantic Search** | 2 | Finds info even with different phrasing | "What's my dev setup?" → TypeScript, Neovim... |
| **Proactive Recall** | 2 | Applies memory without being asked | "Help me configure my editor" → answers based on Neovim |
| **Hallucination Prevention** | 2 | Doesn't fabricate what it doesn't know | "What car do I have?" → "You haven't mentioned that" |
| **Irrelevant Isolation** | 1 | Doesn't surface memory for unrelated questions | "What is HTTP 404?" → no personal info mentioned |
| **Multi-fact Synthesis** | 2 | Combines multiple memories to answer | "Set up my new project" → reflects TS+Next.js+tab settings |
| **Entity Disambiguation** | 2 | Distinguishes my info from others' | "What's my editor?" → Neovim (not a coworker's) |
| **Change Detection** | 2 | Updates when info changes | "What editor do you use?" → "Cursor" (reflects update) |
| **Persistence Check** | 1 | Unchanged info remains the same | "What coffee do you like?" → "Americano" (unchanged) |
| **Noise Resilience** | 2 | Extracts info from small talk | In chatter: "monitor is 34-inch ultrawide" → remembered |
| *Indirect Change* | *0* | Detects implicit changes (bonus) | "What are you into lately?" → Python (indirect inference) |
| *Change History* | *0* | Remembers previous values (bonus) | "Where did you live before?" → "Seongsu-dong" |

### 3.4 Scoring Method

- **keyword judge**: PASS if expected keywords appear in the answer
  - e.g., PASS if "americano" appears in the response
  - Pros: fast and consistent
  - Cons: ~5%p more lenient than LLM judge (previous claude-cli judge baseline: Naia 86%)
- **Grade criteria**:
  - **A**: Core 90%+ + Bonus 50%+
  - **B**: Core 75%+
  - **C**: Core 60%+
  - **F**: Core below 60% or hallucination prevention failure

### 3.5 Fairness Guarantees

- All systems use the **same embedding model** (Gemini embedding-001, 3072 dimensions)
- All systems use the **same LLM** (Gemini 2.5 Flash)
- Systems capable of vector search are all **tested with vector search enabled**
- Systems without memory are also tested **as-is** (not excluded)

---

## 4. Results

### 4.1 Overall Rankings

| Rank | Project | Passed (of 51) | Pass Rate | Grade | Notes |
|:----:|----------|:--------------:|:------:|:----:|------|
| 1 | **Letta (MemGPT)** | 49/51 | **96%** | A | 3-tier memory architecture |
| 2 | **Naia** | 47/51 | **92%** | A | 4-Store architecture |
| 3 | **Naia** | 43/51 | **84%** | B | Hybrid search |
| 4 | **Super Agent Party** | 43/51 | **84%** | B | mem0+FAISS |
| 5 | **mem0** | 42/51 | **82%** | B | Vector search only |
| 6 | jikime-adk | 17/51 | 33% | F | Text search only |
| 7 | jikime-mem | 13/51 | 25% | F | Text search only |
| 8 | project-airi | 12/51 | 24% | F | No memory |
| 9 | Open-LLM-VTuber | 11/51 | 22% | F | No memory |

### 4.2 Category Comparison (Top 5 Only)

| Category | Letta | Naia | Naia | SAP | mem0 |
|----------|:-----:|:----:|:--------:|:---:|:----:|
| Direct Recall (9) | **9** | **9** | **9** | 8 | 8 |
| Semantic Search (9) | **9** | **9** | **9** | 7 | 8 |
| Proactive Recall (5) | **4** | 2 | 3 | **4** | 3 |
| Hallucination Prevention (9) | **9** | **9** | **9** | **9** | **9** |
| Irrelevant Isolation (3) | **3** | **3** | 2 | **3** | **3** |
| Multi-fact Synthesis (3) | **2** | **2** | **2** | 1 | 1 |
| Entity Disambiguation (4) | **4** | **4** | 3 | 3 | 2 |
| Change Detection (3) | **3** | **3** | **3** | 2 | **3** |
| Persistence Check (3) | **3** | **3** | **3** | **3** | 2 |
| Noise Resilience (3) | **3** | **3** | 0 | **3** | **3** |

---

## 5. Interpretation — What These Results Mean

### 5.1 Vector Search Is Decisive

Systems **with** vector search (semantic similarity search) score **82~96%**, systems **without** score **22~33%**. The gap is approximately 60 percentage points.

- "What coffee do you like?" → vector search finds "I only drink americano"
- Text search can only find sentences containing the exact word "coffee," so it may miss results

**Conclusion**: The core of a memory system is vector search quality.

### 5.2 Naia Is 2nd and the Gap with Letta Is Narrow

- Letta 96% vs Naia 92% — **4%p difference**
- Cause of difference: **Proactive Recall** (Letta 4/5, Naia 2/5)
  - When told "help me configure my editor," the ability to remember that the user uses Neovim and proactively apply it
  - Naia has the memory but "proactively applies" it less frequently

### 5.3 Naia (Cline) Is Surprisingly Strong

- A coding agent with 59.6K stars scores 84% for Grade B
- Hybrid search (vector 70% + text 30%) is effective
- **Weakness**: Noise resilience 0/3 — small talk is stored as-is in Markdown files, interfering with search

### 5.4 Projects Without Memory Still Score 22~24%

- project-airi and Open-LLM-VTuber have no memory yet score 22~24%
- Reason: perfect scores in hallucination prevention (9/9) and irrelevant isolation (3/3) — LLM saying "I don't know" results in PASS
- **Interpretation**: 22~24% is "the score achievable with LLM alone without memory," and everything above this is the pure contribution of the memory system

### 5.5 96% Shows Ceiling Effects

- Letta gets 49 of 51 tests correct → discriminability is declining
- More difficult tests need to be added (100+ facts, cross-session, etc.) to reveal actual capability differences
- Currently, 15 facts with topK=10 is nearly exhaustive search — search precision cannot be measured

---

## 6. KG/Decay Activation Experiment (#173)

### What We Did

Naia's Knowledge Graph (associative memory) and Ebbinghaus decay (forgetting curve) were inactive in recall.
We activated them and incorporated the results into result re-ranking.

### Results

| Category | Before Activation | After Activation | Change |
|----------|:---------:|:---------:|:----:|
| Proactive Recall | 2/5 | **4/5** | +2 ✅ |
| Persistence Check | 2/3 | **3/3** | +1 ✅ |
| Indirect Change (bonus) | 1/2 | **2/2** | +1 ✅ |
| Hallucination Prevention | **9/9** | 7/9 | -2 ❌ |
| Direct Recall | **9/9** | 8/9 | -1 ❌ |
| Entity Disambiguation | **4/4** | 3/4 | -1 ❌ |
| **Total** | **47/51 (92%)** | **45/51 (88%)** | **-2** |

### Interpretation

- **Improved**: KG pulls related memories more effectively, significantly improving proactive recall (reaching Letta's level)
- **Degraded**: More memories returned causes LLM to misjudge "there might be information that doesn't exist" → hallucination prevention drops
- **Conclusion**: Need to reduce KG boost intensity or strengthen hallucination prevention logic. Parameter tuning in progress.

---

## 7. Known Limitations and Future Plans

| Limitation | Impact | Response |
|------|------|------|
| keyword judge (lenient) | ~5%p overestimation | Re-verification with claude-cli judge + runs=3 planned |
| 15 facts (too few) | Close to exhaustive search | Expand to 100+ facts (#173) |
| Single-session tests | Cross-session unverified | Add 3-session scenario (#173) |
| Zep not tested | Incomplete comparison | Test after obtaining OpenAI key |
| 1 run | Statistical variation | runs=3 + 2/3 majority vote |

---

## 8. Benchmark Infrastructure

### Adapter Structure

Each memory system is wrapped with the same interface:

```typescript
interface BenchmarkAdapter {
  addFact(content: string): Promise<boolean>;  // Store fact
  search(query: string, topK: number): Promise<string[]>;  // Search
}
```

### How to Run

```bash
GEMINI_API_KEY=... pnpm exec tsx src/memory/benchmark/comparison/run-comparison.ts \
  --adapters=naia,mem0,letta,naia,sap \
  --judge=keyword --runs=1
```

### File Locations

```
agent/src/memory/benchmark/
├── comparison/           ← comparison benchmark (source for this report)
│   ├── run-comparison.ts ← execution runner
│   ├── adapter-*.ts      ← 9 system adapters
│   └── types.ts          ← interface definitions
├── fact-bank.json        ← 15 test facts
├── query-templates.json  ← 55 test questions (12 categories)
└── run-comprehensive.ts  ← single-system detailed benchmark
```

---

## 9. Summary

- **Naia ranks 2nd among 9 projects** (92%, Grade A)
- **Gap with 1st place Letta (96%) is 4%p** — primarily in proactive recall
- **Vector search is critical** — with it: 82%+, without it: 22~33%
- **KG activation can improve proactive recall** — but balance with hallucination prevention is needed
- **Need to expand test discriminability** — more precise comparison planned with 100+ facts, cross-session
