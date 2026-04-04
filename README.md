# Alpha Memory

**Cognitive memory architecture for AI agents** — importance-gated encoding, vector retrieval, knowledge graph, Ebbinghaus decay, and a head-to-head benchmark suite against popular memory systems.

Part of the [Naia OS](https://github.com/nextain/naia-os) project.

---

## Overview

Alpha Memory implements a 4-store memory architecture inspired by cognitive science:

| Store | Analog | What it holds |
|-------|--------|--------------|
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
│   ├── types.ts            # Type definitions (Episode, Fact, Reflection, ...)
│   ├── importance.ts       # 3-axis importance scoring (Amygdala analog)
│   ├── decay.ts            # Ebbinghaus forgetting curve
│   ├── reconsolidation.ts  # Contradiction detection
│   ├── knowledge-graph.ts  # Entity/relation extraction
│   ├── embeddings.ts       # Embedding abstraction (Gemini, Solar, Ollama, ...)
│   └── adapters/
│       ├── local.ts        # SQLite + hnswlib (local, no API key needed)
│       └── mem0.ts         # mem0 OSS backend
└── benchmark/
    ├── fact-bank.json          # 1000 Korean facts (personas, events, preferences)
    ├── fact-bank.en.json       # 1000 English facts
    ├── query-templates.json    # Korean test queries
    ├── query-templates.en.json # English test queries
    ├── criteria.ts             # Scoring criteria
    └── comparison/
        ├── run-comparison.ts   # Main benchmark runner
        ├── types.ts            # BenchmarkAdapter interface
        ├── adapter-naia.ts     # Alpha Memory (this project)
        ├── adapter-mem0.ts     # mem0 OSS
        ├── adapter-sillytavern.ts  # SillyTavern (vectra + transformers.js)
        ├── adapter-letta.ts    # Letta (formerly MemGPT)
        ├── adapter-zep.ts      # Zep CE
        ├── adapter-openclaw.ts # OpenClaw
        ├── adapter-sap.ts      # Super Agent Party (mem0 + FAISS)
        └── adapter-jikime-mem.ts   # Jikime Memory
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Run benchmark (Korean, keyword judge, all adapters)
GEMINI_API_KEY=your-key npx tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia,mem0,sillytavern \
  --judge=keyword \
  --lang=ko

# Run with gateway (Vertex AI, no rate limits)
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
| `--skip-encode` | off | Reuse cached DB (skip encoding phase) |
| `--runs=N` | `1` | Runs per test (for averaging) |
| `--categories=a,b` | all | Filter test categories |

### Available Adapters

| Adapter ID | System | Backend |
|-----------|--------|---------|
| `naia` | Alpha Memory (this project) | SQLite + vector search + KG |
| `mem0` | [mem0 OSS](https://github.com/mem0ai/mem0) | SQLite vector + LLM dedup |
| `sillytavern` | [SillyTavern](https://github.com/SillyTavern/SillyTavern) | vectra + transformers.js |
| `letta` | [Letta](https://github.com/letta-ai/letta) | Requires Letta server |
| `zep` | [Zep CE](https://github.com/getzep/zep) | Requires Zep server |
| `openclaw` | OpenClaw | Local |
| `sap` | Super Agent Party | mem0 + FAISS/ChromaDB |
| `jikime-mem` | Jikime Memory | Local |
| `no-memory` | Baseline (no memory) | — |

---

## Embedding Backends

| Backend | Model | Dims | Notes |
|---------|-------|------|-------|
| `gemini` | gemini-embedding-001 | 3072 | Requires `GEMINI_API_KEY` |
| `solar` | embedding-query/passage | 4096 | Requires `UPSTAGE_API_KEY` |
| `qwen3` | qwen3-embedding (Ollama) | 2048 | Local, no API key |
| `bge-m3` | bge-m3 (Ollama) | 1024 | Local, multilingual |
| Gateway | vertexai:text-embedding-004 | 768 | Requires `GATEWAY_URL` + `GATEWAY_MASTER_KEY` |

---

## Benchmark Results

> See [`docs/reports/`](docs/reports/) for full reports.

*Results omitted from README — see reports directory.*

---

## Development

```bash
npm run typecheck   # TypeScript check
npm run check       # Biome lint + format
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

Part of [Naia OS](https://github.com/nextain/naia-os) by [Nextain](https://nextain.io).
