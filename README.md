# Alpha Memory

**Cognitive memory architecture for AI agents** — importance-gated encoding, vector retrieval, knowledge graph, Ebbinghaus decay, and a head-to-head benchmark suite against popular memory systems.

**AI 에이전트용 인지 메모리 아키텍처** — 중요도 게이팅 인코딩, 벡터 검색, 지식 그래프, 에빙하우스 망각 곡선, 그리고 주요 메모리 시스템과의 헤드투헤드 벤치마크를 포함합니다.

Part of the [Naia OS](https://github.com/nextain/naia-os) project.
[Naia OS](https://github.com/nextain/naia-os) 프로젝트의 일부입니다.

---

## Overview / 개요

Alpha Memory implements a 4-store memory architecture inspired by cognitive science.
Alpha Memory는 인지과학에서 영감을 받은 4-저장소 메모리 아키텍처를 구현합니다.

| Store / 저장소 | Analog / 유사체 | What it holds / 저장 내용 |
|---------------|----------------|--------------------------|
| **Episodic / 에피소딕** | Hippocampus / 해마 | Timestamped events / 타임스탬프 이벤트 |
| **Semantic / 시맨틱** | Neocortex / 신피질 | Facts, entities / 사실, 엔티티, 관계 |
| **Procedural / 절차적** | Basal Ganglia / 기저핵 | Skills, strategies / 기술, 전략 |
| **Working / 작업** | Prefrontal Cortex / 전두엽 | Active context / 활성 컨텍스트 |

### Key Features / 주요 특징

- **Importance gating / 중요도 게이팅** — 3-axis scoring (importance × surprise × emotion) / 3축 점수 (중요도 × 놀라움 × 감정)
- **Knowledge graph / 지식 그래프** — Entity/relation extraction / 엔티티·관계 추출
- **Ebbinghaus decay / 에빙하우스 망각** — Memory strength fades and strengthens on recall / 재호출로 강화
- **Reconsolidation / 재통합** — Contradiction detection on retrieval / 검색 시 모순 감지
- **Pluggable adapters / 플러그인 어댑터** — SQLite, mem0, and more / SQLite, mem0 등 교체 가능
- **Benchmark suite / 벤치마크** — Compare against mem0, SillyTavern, Letta, Zep, SAP, OpenClaw / 주요 시스템과 비교

---

## Architecture / 아키텍처

```
src/
├── memory/
│   ├── index.ts            # MemorySystem — main orchestrator / 메인 오케스트레이터
│   ├── types.ts            # Type definitions / 타입 정의
│   ├── importance.ts       # 3-axis importance scoring / 3축 중요도 점수
│   ├── decay.ts            # Ebbinghaus forgetting curve / 에빙하우스 망각 곡선
│   ├── reconsolidation.ts  # Contradiction detection / 모순 감지
│   ├── knowledge-graph.ts  # Entity/relation extraction / 엔티티·관계 추출
│   ├── embeddings.ts       # Embedding abstraction / 임베딩 추상화
│   └── adapters/
│       ├── local.ts        # SQLite + hnswlib (local, no API key)
│       └── mem0.ts         # mem0 OSS backend
└── benchmark/
    ├── fact-bank.json          # 1000 Korean facts / 한국어 사실 1000개
    ├── fact-bank.en.json       # 1000 English facts / 영어 사실 1000개
    ├── query-templates.json    # Korean test queries / 한국어 쿼리
    ├── query-templates.en.json # English test queries / 영어 쿼리
    ├── criteria.ts             # Scoring criteria / 채점 기준
    └── comparison/
        ├── run-comparison.ts       # Main benchmark runner / 메인 러너
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

## Quick Start / 빠른 시작

```bash
# Install / 설치
npm install

# Run benchmark — Korean, keyword judge
# 벤치마크 실행 — 한국어, 키워드 채점
GEMINI_API_KEY=your-key npx tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia,mem0,sillytavern \
  --judge=keyword \
  --lang=ko

# Run with gateway (Vertex AI, no rate limits)
# 게이트웨이 사용 (Vertex AI, 속도 제한 없음)
GATEWAY_URL=https://your-gateway GATEWAY_MASTER_KEY=your-key \
  npx tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia \
  --judge=keyword \
  --lang=en
```

### CLI Options / CLI 옵션

| Option | Default | Description / 설명 |
|--------|---------|-------------------|
| `--adapters=a,b,c` | `naia,mem0` | Adapters to run / 실행할 어댑터 |
| `--judge=keyword\|claude-cli` | `claude-cli` | Scoring method / 채점 방식 |
| `--lang=ko\|en` | `ko` | Fact bank language / 팩트 뱅크 언어 |
| `--embedder=gemini\|solar\|qwen3\|bge-m3` | `gemini` | Embedding model / 임베딩 모델 |
| `--llm=gemini\|qwen3` | `qwen3` | LLM for Naia adapter |
| `--skip-encode` | off | Reuse cached DB / DB 캐시 재사용 |
| `--runs=N` | `1` | Runs per test / 테스트당 실행 횟수 |
| `--categories=a,b` | all | Filter categories / 카테고리 필터 |

### Available Adapters / 사용 가능한 어댑터

| ID | System | Backend |
|----|--------|---------|
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

## Embedding Backends / 임베딩 백엔드

| Backend | Model | Dims | Notes / 비고 |
|---------|-------|------|-------------|
| `gemini` | gemini-embedding-001 | 3072 | `GEMINI_API_KEY` required |
| `solar` | embedding-query/passage | 4096 | `UPSTAGE_API_KEY` required |
| `qwen3` | qwen3-embedding (Ollama) | 2048 | Local, no API key / 로컬 |
| `bge-m3` | bge-m3 (Ollama) | 1024 | Local, multilingual / 다국어 |
| Gateway | vertexai:text-embedding-004 | 768 | `GATEWAY_URL` + `GATEWAY_MASTER_KEY` |

---

## Benchmark Results / 벤치마크 결과

> See [`docs/reports/`](docs/reports/) for full reports.
> 전체 보고서는 [`docs/reports/`](docs/reports/)를 참조하세요.

---

## Development / 개발

```bash
npm run typecheck   # TypeScript check / 타입 검사
npm run check       # Biome lint + format
```

---

## License / 라이선스

Apache 2.0 — see [LICENSE](LICENSE)

Part of [Naia OS](https://github.com/nextain/naia-os) by [Nextain](https://nextain.io).
[Naia OS](https://github.com/nextain/naia-os) by [Nextain](https://nextain.io) 프로젝트의 일부.
