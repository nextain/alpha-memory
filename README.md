# Alpha Memory

**Cognitive memory architecture for AI agents** — importance-gated encoding, vector retrieval, knowledge graph, Ebbinghaus decay, and a head-to-head benchmark suite against popular memory systems.

[English](README.md) | [한국어](README.ko.md)

## Place in the Naia ecosystem

Alpha Memory is one of four repos in the Naia open-source AI platform:

| Repo | Role |
|------|------|
| [naia-os](https://github.com/nextain/naia-os) | Desktop shell + OS image (host) |
| [naia-agent](https://github.com/nextain/naia-agent) | Runtime engine (loop · tools · compaction) |
| [naia-adk](https://github.com/nextain/naia-adk) | Workspace format + skills library |
| **alpha-memory** (this) | Memory implementation |

### Interfaces, not dependencies

Alpha Memory is **one implementation of the `MemoryProvider` contract** specified in `@nextain/agent-types`:

- **Transparent** — the contract is public. Any memory system that implements it can replace Alpha Memory without touching runtime code.
- **Non-binding** — alpha-memory does not depend on naia-agent's runtime. naia-agent treats this package as a black box behind the interface.
- **Abstracted** — swap Alpha Memory for another implementation (mem0, Letta, custom) and nothing else in the Naia ecosystem changes.

Part of the broader Naia principle: repos couple through **published interfaces**, not runtime dependencies. See [naia-agent README](https://github.com/nextain/naia-agent) for the full picture.

---

## Overview

Alpha Memory implements a 4-store memory architecture inspired by cognitive science:

| Store | Brain Analog | What it holds |
|-------|-------------|---------------|
| **Episodic** | Hippocampus | Timestamped events with full context |
| **Semantic** | Neocortex | Facts, entities, relationships |
| **Procedural** | Basal Ganglia | Skills, strategies, learned patterns |
| **Working** | Prefrontal Cortex | Active context (managed externally) |

### Key Features

- **Importance gating** — 3-axis scoring (importance × surprise × emotion) filters what gets stored
- **Knowledge graph** — entity/relation extraction + spreading activation for semantic recall
- **Ebbinghaus decay** — memory strength fades over time, strengthened by recall
- **Reconsolidation** — contradiction detection on retrieval
- **Pluggable adapters** — swap the vector backend (local SQLite, mem0, Qdrant)
- **Benchmark suite** — compare against mem0, SillyTavern, Letta, SAP, OpenClaw, Graphiti, and more

---

## Architecture

```
src/
├── memory/
│   ├── index.ts            # MemorySystem — main orchestrator
│   ├── types.ts            # Type definitions
│   ├── importance.ts       # 3-axis importance scoring
│   ├── decay.ts            # Ebbinghaus forgetting curve
│   ├── reconsolidation.ts  # Contradiction detection on retrieval
│   ├── knowledge-graph.ts  # Entity/relation extraction + spreading activation
│   ├── embeddings.ts       # Embedding abstraction (Gemini text-embedding-004)
│   └── adapters/
│       ├── local.ts        # SQLite + hnswlib (local, no API key required)
│       ├── mem0.ts         # mem0 OSS backend
│       └── qdrant.ts       # Qdrant vector DB backend
└── benchmark/
    ├── fact-bank.json          # 1000 Korean facts (fictional persona)
    ├── fact-bank.en.json       # 1000 English facts
    ├── query-templates.json    # Korean test queries (12 categories)
    ├── query-templates.en.json # English test queries
    ├── criteria.ts             # Scoring criteria
    └── comparison/
        ├── run-comparison.ts        # Main benchmark runner
        ├── types.ts                 # BenchmarkAdapter interface
        ├── judge.ts                 # Standalone re-judge script
        ├── adapter-naia.ts          # Alpha Memory (this project)
        ├── adapter-mem0.ts          # mem0 OSS
        ├── adapter-sillytavern.ts   # SillyTavern
        ├── adapter-letta.ts         # Letta (formerly MemGPT)
        ├── adapter-openclaw.ts      # OpenClaw
        ├── adapter-sap.ts           # Super Agent Party
        ├── adapter-open-llm-vtuber.ts  # Open-LLM-VTuber
        ├── adapter-graphiti.ts      # Graphiti (Neo4j temporal KG)
        ├── adapter-starnion.ts      # Starnion (SQLite + ChromaDB)
        └── adapter-no-memory.ts    # Baseline (no memory)
```

---

## Installation

```bash
npm install @nextain/alpha-memory
# or
pnpm add @nextain/alpha-memory
```

## Usage

```typescript
import { MemorySystem } from "@nextain/alpha-memory";

// Initialize with local SQLite backend (no API key needed)
const memory = new MemorySystem({ adapter: "local" });
await memory.init();

// Encode a message into memory
await memory.encode("User prefers dark mode and uses Neovim as their editor");

// Recall relevant memories for a query
const results = await memory.recall("What editor does the user use?");
console.log(results); // ["User prefers Neovim as their editor"]

// At session start — inject into system prompt
const context = await memory.sessionRecall("new conversation started");
// context: string to prepend to system prompt
```

---

## Quick Start (Benchmark)

```bash
pnpm install

# Korean benchmark, keyword judge
GEMINI_API_KEY=your-key pnpm exec tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia,mem0 \
  --judge=keyword \
  --lang=ko

# English benchmark via gateway (Vertex AI, no rate limits)
GATEWAY_URL=https://your-gateway GATEWAY_MASTER_KEY=your-key \
  pnpm exec tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia \
  --judge=glm-api \
  --lang=en

# Re-judge existing results with a different judge
pnpm exec tsx src/benchmark/comparison/judge.ts \
  --input=reports/runs/run-xxx/report-naia.json \
  --judge=glm-api
```

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--adapters=a,b,c` | `naia,mem0` | Adapters to run |
| `--judge=keyword\|glm-api\|gemini-pro-cli\|claude-cli` | `keyword` | Scoring method |
| `--lang=ko\|en` | `ko` | Fact bank language |
| `--embedder=gemini\|solar\|qwen3\|bge-m3` | `gemini` | Embedding model |
| `--llm=gemini-flash-lite\|qwen3` | `gemini-flash-lite` | Response LLM |
| `--skip-encode` | off | Reuse cached encoding DB |
| `--cache-id=name` | `cache-${lang}` | Cache DB identifier |
| `--runs=N` | `1` | Runs per test |
| `--categories=a,b` | all | Filter categories |

### Available Adapters

| ID | System | Backend |
|----|--------|---------|
| `naia` | Alpha Memory (this project) | SQLite + vector + KG |
| `mem0` | [mem0 OSS](https://github.com/mem0ai/mem0) | Vector + LLM dedup |
| `sillytavern` | [SillyTavern](https://github.com/SillyTavern/SillyTavern) | vectra + transformers.js |
| `letta` | [Letta](https://github.com/letta-ai/letta) | Archival memory + vector |
| `openclaw` | OpenClaw | FTS5 + vector hybrid |
| `sap` | Super Agent Party | mem0 + FAISS |
| `open-llm-vtuber` | [Open-LLM-VTuber](https://github.com/t41372/Open-LLM-VTuber) | Letta-based |
| `graphiti` | [Graphiti](https://github.com/getzep/graphiti) | Neo4j temporal KG |
| `starnion` | Starnion | SQLite + ChromaDB |
| `no-memory` | Baseline | No memory (LLM only) |

### Judge Modes

| Mode | How | Speed |
|------|-----|-------|
| `keyword` | Exact/substring match | Instant |
| `glm-api` | GLM-5.1 via Z.AI API (batch 10) | Fast |
| `gemini-pro-cli` | Gemini CLI (batch 10) | Fast |
| `claude-cli` | Claude CLI via gateway (one-by-one) | Slow |

---

## Embedding Backends

| Backend | Model | Dims | Notes |
|---------|-------|------|-------|
| `gemini` (default) | text-embedding-004 via gateway | 768 | `GATEWAY_URL` + `GATEWAY_MASTER_KEY` |
| `gemini-direct` | text-embedding-004 direct | 768 | `GEMINI_API_KEY` |
| `solar` | embedding-query/passage | 4096 | `UPSTAGE_API_KEY` |
| `qwen3` | qwen3-embedding (Ollama) | 2048 | Local |
| `bge-m3` | bge-m3 (Ollama) | 1024 | Local, multilingual |

---

## Benchmark Results

### R5 EN — English Benchmark (2026-04-12, GLM-5.1 judge)

1000 facts · 240 queries · 9 systems

| Rank | System | Score | Grade |
|:----:|--------|:-----:|:-----:|
| 1 | Letta | 87.5% | F(abs) |
| 2 | Open-LLM-VTuber | 85.2% | F(abs) |
| 3 | **Alpha Memory (Naia)** | **84.0%** | F(abs) |
| 4 | mem0 | 83.1% | F(abs) |
| 5 | SillyTavern | 79.8% | F(abs) |
| 6 | SAP | 74.1% | F(abs) |
| 7 | Graphiti | 55.8% | F |
| 8 | OpenClaw | 43.3% | F |
| 9 | Baseline (no memory) | 33.9% | F |

**Key findings:**
- All memory-capable systems fail abstention (40–65%) — structural issue where memory retrieval is not confidence-gated
- Graphiti: contradiction 100% vs semantic_search 4% — Neo4j KG alone cannot substitute vector search
- Retrieval latency and per-query token cost not measured — planned for R7

### R6 KO — Korean Benchmark (2026-04-13, keyword judge)

1000 facts · 240 queries · 8 systems

| Rank | System | Score | EN R5 | Drop |
|:----:|--------|:-----:|:-----:|:----:|
| 1 | Letta | 67.5% | 87.5% | -20pp |
| 2 | **Alpha Memory (Naia)** | **24.7%** | 84.0% | -60pp |
| 3 | mem0 | 24.0% | 83.1% | -59pp |
| 4 | SillyTavern | 17.6% | 79.8% | -62pp |
| 5 | Baseline (no memory) | 16.0% | 33.9% | -18pp |
| 6 | OpenClaw | 14.8% | 43.3% | -29pp |
| 7 | Open-LLM-VTuber | 14.4% | 85.2% | -71pp |
| 8 | SAP | 12.9% | 74.1% | -61pp |
| — | Graphiti | DNF | 55.8% | — |

**Key findings:**
- Korean language is a system-level barrier: most systems drop 50–70pp vs EN
- Letta alone retains meaningful Korean performance — internal multilingual LLM processing
- **Alpha Memory ranks #2 in KO** (24.7%), narrowly ahead of mem0 (24.0%) — same EN-optimized pipeline; improvement path is LocalAdapter + gemini-embedding-001
- Memory systems largely fail to beat the no-memory baseline in Korean — retrieval quality collapses at the LLM synthesis layer

> Grade legend: A ≥90% · B ≥75% · C ≥60% · F <60% · F(abs) = abstention criterion failed

Full reports: [`reports/r5-en-benchmark/`](reports/r5-en-benchmark/) · [`reports/r6-ko-benchmark/`](reports/r6-ko-benchmark/)

---

## Benchmark Categories (12)

| Category | Weight | What it tests |
|----------|:------:|---------------|
| `direct_recall` | ×1 | Direct fact retrieval |
| `semantic_search` | ×2 | Meaning-based search |
| `proactive_recall` | ×2 | Proactive memory suggestion |
| `abstention` | ×2 | Knowing what you don't know (hallucination prevention) |
| `irrelevant_isolation` | ×1 | Not injecting personal info into unrelated queries |
| `multi_fact_synthesis` | ×2 | Combining multiple memories |
| `entity_disambiguation` | ×2 | Distinguishing entities by context |
| `contradiction_direct` | ×2 | Handling direct contradictions |
| `contradiction_indirect` | ×2 | Handling indirect contradictions |
| `noise_resilience` | ×2 | Recalling signal amid noise |
| `unchanged_persistence` | ×1 | Preserving facts that shouldn't change after updates |
| `temporal` | ×2 | Recalling past states over time |

---

## Roadmap

### R7 Sprint — Core Fixes (next benchmark target)

R6 KO benchmark (GLM-5.1 judge) revealed two root causes behind naia's 24% KO vs letta's 67%:
1. **Mem0Adapter LLM dedup** strips Korean text during normalization (confirmed: mem0 24.5% = naia 24.0%)
2. **Deprecated embedding** — `text-embedding-004` (768d, EN-optimized) vs letta's `gemini-embedding-001` (3072d, MTEB multilingual #1)

R7 goal: switch to `LocalAdapter` + `gemini-embedding-001` → target KO 55%+ (letta parity).

| Issue | Description | Priority |
|-------|-------------|:--------:|
| [#5](https://github.com/nextain/alpha-memory/issues/5) | **LocalAdapter + gemini-embedding-001** — wire vector search, replace deprecated text-embedding-004, switch benchmark to LocalAdapter backend | **Critical** |
| [#9](https://github.com/nextain/alpha-memory/issues/9) | Abstention — cosine similarity threshold (requires #5 first; current 100% KO is retrieval failure, not confidence gating) | High |
| [#10](https://github.com/nextain/alpha-memory/issues/10) | unchanged_persistence — fix cascade delete on contradiction update | Medium |
| [#8](https://github.com/nextain/alpha-memory/issues/8) | Temporal recall — preserve fact history with timestamps | Medium |
| [#6](https://github.com/nextain/alpha-memory/issues/6) | CompactionMap — encode provenance tracking + safe compact() | Medium |
| [#12](https://github.com/nextain/alpha-memory/issues/12) | Korean language support — after #5, add KO-aware prompts + tokenizer | Medium |
| [#11](https://github.com/nextain/alpha-memory/issues/11) | R7 benchmark — retrieval latency + per-query token cost | Low |

### Future Directions

- **Hybrid search** — dense (vector) + sparse (keyword) RRF fusion for higher precision
- **5k+ fact scale test** — stress test with 5000 facts to validate KG and decay at scale
- **Multilingual embeddings** — compare `qwen3-embedding` (MTEB multilingual 70.58) vs `gemini-embedding-001` (68.32) in R8
- **Abstention 2.0** — uncertainty layer: pass Ebbinghaus strength as LLM metadata hint

---

## Development

```bash
pnpm install
pnpm run typecheck   # TypeScript check
pnpm run check       # Biome lint + format
```

---

## AI-Native Open Source

This project is built with an AI-native development philosophy:

- **AI context is a first-class artifact** — `.agents/` context files are versioned alongside code
- **Privacy by architecture** — memory is stored locally; the service provider cannot access it
- **AI sovereignty** — users own their AI memories
- **Transparent AI assistance** — AI contributions are credited via `Assisted-by:` git trailers

AI context in `.agents/` and `.users/` is licensed under [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

Part of [Naia OS](https://github.com/nextain/naia-os) by [Nextain](https://nextain.io).
