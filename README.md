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

Alpha Memory is **one implementation of the `MemoryProvider` contract** specified in `@naia-agent/types`:

- **Transparent** — the contract is public. Any memory system that implements it can replace Alpha Memory without touching runtime code.
- **Non-binding** — alpha-memory does not depend on naia-agent's runtime. naia-agent treats this package as a black box behind the interface.
- **Abstracted** — swap Alpha Memory for another implementation (mem0, Letta, custom) and nothing else in the Naia ecosystem changes.

Part of the broader Naia principle: repos couple through **published interfaces**, not runtime dependencies. See [naia-agent README](https://github.com/nextain/naia-agent) for the full picture.

---

## Overview

Alpha Memory implements a 4-store memory architecture inspired by cognitive science:

| Store | Brain Analog | What it holds |
|-------|-------------|--------------|
| **Episodic** | Hippocampus | Timestamped events with full context |
| **Semantic** | Neocortex | Facts, entities, relationships |
| **Procedural** | Basal Ganglia | Skills, strategies, learned patterns |
| **Working** | Prefrontal Cortex | Active context (managed externally by ContextManager) |

### Key Features

- **Importance gating** — 3-axis scoring (importance × surprise × emotion) filters what gets stored
- **Knowledge graph** — entity/relation extraction for semantic memory
- **Ebbinghaus decay** — memory strength fades over time, strengthened by recall
- **Reconsolidation** — contradiction detection on retrieval
- **Pluggable adapters** — swap the vector backend (local SQLite, mem0, etc.)
- **Benchmark suite** — compare against mem0, SillyTavern, Letta, Zep, SAP, OpenClaw, and more

---

## Architecture

```
src/
├── memory/
│   ├── index.ts            # MemorySystem — main orchestrator
│   ├── types.ts            # Type definitions
│   ├── importance.ts       # 3-axis importance scoring (Amygdala analog)
│   ├── decay.ts            # Ebbinghaus forgetting curve
│   ├── reconsolidation.ts  # Contradiction detection
│   ├── knowledge-graph.ts  # Entity/relation extraction
│   ├── embeddings.ts       # Embedding abstraction
│   └── adapters/
│       ├── local.ts        # SQLite + hnswlib (local, no API key)
│       └── mem0.ts         # mem0 OSS backend
└── benchmark/
    ├── fact-bank.json          # 1000 Korean facts
    ├── fact-bank.en.json       # 1000 English facts
    ├── query-templates.json    # Korean test queries
    ├── query-templates.en.json # English test queries
    ├── criteria.ts             # Scoring criteria
    └── comparison/
        ├── run-comparison.ts       # Main benchmark runner
        ├── types.ts                # BenchmarkAdapter interface
        ├── adapter-naia.ts         # Alpha Memory (this project)
        ├── adapter-mem0.ts         # mem0 OSS
        ├── adapter-sillytavern.ts  # SillyTavern (vectra + transformers.js)
        ├── adapter-letta.ts        # Letta (formerly MemGPT)
        ├── adapter-zep.ts          # Zep CE
        ├── adapter-openclaw.ts     # OpenClaw
        ├── adapter-sap.ts          # Super Agent Party (mem0 + FAISS)
        └── adapter-jikime-mem.ts   # Jikime Memory
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
console.log(results); // ["User prefers dark mode and uses Neovim as their editor"]

// At session start — inject into system prompt
const context = await memory.sessionRecall("new conversation started");
// context: string to prepend to system prompt
```

---

## Quick Start (Benchmark)

```bash
npm install

# Korean benchmark, keyword judge
GEMINI_API_KEY=your-key npx tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia,mem0,sillytavern \
  --judge=keyword \
  --lang=ko

# With gateway (Vertex AI, no rate limits)
GATEWAY_URL=https://your-gateway GATEWAY_MASTER_KEY=your-key \
  npx tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia \
  --judge=keyword \
  --lang=en
```

### CLI Options

| Option | Default | Description |
|--------|---------|-------------|
| `--adapters=a,b,c` | `naia,mem0` | Adapters to run |
| `--judge=keyword\|claude-cli` | `claude-cli` | Scoring method |
| `--lang=ko\|en` | `ko` | Fact bank language |
| `--embedder=gemini\|solar\|qwen3\|bge-m3` | `gemini` | Embedding model |
| `--llm=gemini\|qwen3` | `qwen3` | LLM for Naia adapter |
| `--skip-encode` | off | Reuse cached DB |
| `--runs=N` | `1` | Runs per test |
| `--categories=a,b` | all | Filter categories |

### Available Adapters

| ID | System | Backend |
|----|--------|---------|
| `naia` | Alpha Memory (this project) | SQLite + vector search + KG |
| `mem0` | [mem0 OSS](https://github.com/mem0ai/mem0) | SQLite vector + LLM dedup |
| `sillytavern` | [SillyTavern](https://github.com/SillyTavern/SillyTavern) | vectra + transformers.js |
| `letta` | [Letta](https://github.com/letta-ai/letta) | Requires Letta server |
| `zep` | [Zep CE](https://github.com/getzep/zep) | Requires Zep server |
| `openclaw` | [OpenClaw](https://github.com/nextain/naia-os) | Local (Naia Gateway) |
| `sap` | Super Agent Party | mem0 + FAISS/ChromaDB |
| `open-llm-vtuber` | [Open-LLM-VTuber](https://github.com/t41372/Open-LLM-VTuber) | Letta-based agent memory |
| `jikime-mem` | [Jikime Memory](https://github.com/jikime/jikime-mem) | Local |
| `no-memory` | Baseline (no memory) | — |

---

## Embedding Backends

| Backend | Model | Dims | Notes |
|---------|-------|------|-------|
| `gemini` | gemini-embedding-001 | 3072 | Requires `GEMINI_API_KEY` |
| `solar` | embedding-query/passage | 4096 | Requires `UPSTAGE_API_KEY` |
| `qwen3` | qwen3-embedding (Ollama) | 2048 | Local |
| `bge-m3` | bge-m3 (Ollama) | 1024 | Local, multilingual |
| Gateway | vertexai:text-embedding-004 | 768 | `GATEWAY_URL` + `GATEWAY_MASTER_KEY` |

---

## Benchmark Results

**R2 Report (April 2026)** — 1000 facts, 240 queries, 4 systems, KO + EN:

| System | KO (R1) | EN (R2) |
|--------|:-------:|:-------:|
| **Alpha Memory (Naia)** | **65%** | 46% |
| SillyTavern | 46% | **64%** |
| Letta | 47% | — |
| mem0 | re-run* | 43% |
| SAP | re-run* | 45% |

*R1 KO: mem0/SAP had API rate limit failures; re-run in progress.

All systems scored F grade (abstention criterion not met by any system).

→ Full reports: [`docs/reports/benchmark-r2-2026-04.en.md`](docs/reports/benchmark-r2-2026-04.en.md) | [`docs/reports/benchmark-r2-2026-04.ko.md`](docs/reports/benchmark-r2-2026-04.ko.md)

---

## Development

```bash
npm run typecheck   # TypeScript check
npm run check       # Biome lint + format
```

---

## AI-Native Open Source

This project is built with an AI-native development philosophy:

- **AI context is a first-class artifact** — `.agents/` context files are versioned alongside code, not treated as throwaway prompts
- **Privacy by architecture** — memory is stored locally and E2E encrypted; even the service provider cannot access it
- **AI sovereignty** — the user owns their AI memories; Nextain provides infrastructure, not access
- **Transparent AI assistance** — AI contributions are credited via `Assisted-by:` git trailers

AI context in `.agents/` and `.users/` is licensed under [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) — attribution and same license required.

> In the vibe coding era, AI context is an asset as valuable as code.

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

Part of [Naia OS](https://github.com/nextain/naia-os) by [Nextain](https://nextain.io).
