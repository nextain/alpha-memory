# Alpha Memory

**AI 에이전트용 인지 메모리 아키텍처** — 중요도 게이팅 인코딩, 벡터 검색, 지식 그래프, 에빙하우스 망각 곡선, 그리고 주요 메모리 시스템과의 헤드투헤드 벤치마크를 포함합니다.

[Naia OS](https://github.com/nextain/naia-os) 프로젝트의 일부입니다. | [English](README.md)

---

## 개요

Alpha Memory는 인지과학에서 영감을 받은 4-저장소 메모리 아키텍처를 구현합니다:

| 저장소 | 신경과학 유사체 | 저장 내용 |
|--------|--------------|----------|
| **에피소딕** | 해마 | 전체 컨텍스트가 포함된 타임스탬프 이벤트 |
| **시맨틱** | 신피질 | 사실, 엔티티, 관계 |
| **절차적** | 기저핵 | 기술, 전략, 학습된 패턴 |
| **작업 메모리** | 전두엽 | 활성 컨텍스트 (외부 ContextManager가 관리) |

### 주요 특징

- **중요도 게이팅** — 3축 점수 (중요도 × 놀라움 × 감정)로 저장 여부 필터링
- **지식 그래프** — 시맨틱 메모리를 위한 엔티티·관계 추출
- **에빙하우스 망각** — 시간이 지남에 따라 기억 강도 감소, 재호출로 강화
- **재통합** — 검색 시 모순 감지
- **플러그인 어댑터** — 벡터 백엔드 교체 가능 (로컬 SQLite, mem0 등)
- **벤치마크 스위트** — mem0, SillyTavern, Letta, Zep, SAP, OpenClaw 등과 비교

---

## 아키텍처

```
src/
├── memory/
│   ├── index.ts            # MemorySystem — 메인 오케스트레이터
│   ├── types.ts            # 타입 정의
│   ├── importance.ts       # 3축 중요도 점수 (편도체 유사체)
│   ├── decay.ts            # 에빙하우스 망각 곡선
│   ├── reconsolidation.ts  # 모순 감지
│   ├── knowledge-graph.ts  # 엔티티·관계 추출
│   ├── embeddings.ts       # 임베딩 추상화
│   └── adapters/
│       ├── local.ts        # SQLite + hnswlib (로컬, API 키 불필요)
│       └── mem0.ts         # mem0 OSS 백엔드
└── benchmark/
    ├── fact-bank.json          # 한국어 사실 1000개
    ├── fact-bank.en.json       # 영어 사실 1000개
    ├── query-templates.json    # 한국어 테스트 쿼리
    ├── query-templates.en.json # 영어 테스트 쿼리
    ├── criteria.ts             # 채점 기준
    └── comparison/
        ├── run-comparison.ts       # 메인 벤치마크 러너
        ├── types.ts                # BenchmarkAdapter 인터페이스
        ├── adapter-naia.ts         # Alpha Memory (이 프로젝트)
        ├── adapter-mem0.ts         # mem0 OSS
        ├── adapter-sillytavern.ts  # SillyTavern (vectra + transformers.js)
        ├── adapter-letta.ts        # Letta (구 MemGPT)
        ├── adapter-zep.ts          # Zep CE
        ├── adapter-openclaw.ts     # OpenClaw
        ├── adapter-sap.ts          # Super Agent Party (mem0 + FAISS)
        └── adapter-jikime-mem.ts   # Jikime Memory
```

---

## 빠른 시작

```bash
npm install

# 한국어 벤치마크, 키워드 채점
GEMINI_API_KEY=your-key npx tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia,mem0,sillytavern \
  --judge=keyword \
  --lang=ko

# 게이트웨이 사용 (Vertex AI, 속도 제한 없음)
GATEWAY_URL=https://your-gateway GATEWAY_MASTER_KEY=your-key \
  npx tsx src/benchmark/comparison/run-comparison.ts \
  --adapters=naia \
  --judge=keyword \
  --lang=en
```

### CLI 옵션

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `--adapters=a,b,c` | `naia,mem0` | 실행할 어댑터 |
| `--judge=keyword\|claude-cli` | `claude-cli` | 채점 방식 |
| `--lang=ko\|en` | `ko` | 팩트 뱅크 언어 |
| `--embedder=gemini\|solar\|qwen3\|bge-m3` | `gemini` | 임베딩 모델 |
| `--llm=gemini\|qwen3` | `qwen3` | Naia 어댑터용 LLM |
| `--skip-encode` | 꺼짐 | DB 캐시 재사용 |
| `--runs=N` | `1` | 테스트당 실행 횟수 |
| `--categories=a,b` | 전체 | 카테고리 필터 |

### 사용 가능한 어댑터

| ID | 시스템 | 백엔드 |
|----|--------|--------|
| `naia` | Alpha Memory (이 프로젝트) | SQLite + 벡터 검색 + KG |
| `mem0` | [mem0 OSS](https://github.com/mem0ai/mem0) | SQLite 벡터 + LLM 중복 제거 |
| `sillytavern` | [SillyTavern](https://github.com/SillyTavern/SillyTavern) | vectra + transformers.js |
| `letta` | [Letta](https://github.com/letta-ai/letta) | Letta 서버 필요 |
| `zep` | [Zep CE](https://github.com/getzep/zep) | Zep 서버 필요 |
| `openclaw` | [OpenClaw](https://github.com/nextain/naia-os) | 로컬 (Naia Gateway) |
| `sap` | Super Agent Party | mem0 + FAISS/ChromaDB |
| `open-llm-vtuber` | [Open-LLM-VTuber](https://github.com/t41372/Open-LLM-VTuber) | Letta 기반 에이전트 메모리 |
| `jikime-mem` | [Jikime Memory](https://github.com/jikime/jikime-mem) | 로컬 |
| `no-memory` | 베이스라인 (메모리 없음) | — |

---

## 임베딩 백엔드

| 백엔드 | 모델 | 차원 | 비고 |
|--------|------|------|------|
| `gemini` | gemini-embedding-001 | 3072 | `GEMINI_API_KEY` 필요 |
| `solar` | embedding-query/passage | 4096 | `UPSTAGE_API_KEY` 필요 |
| `qwen3` | qwen3-embedding (Ollama) | 2048 | 로컬 |
| `bge-m3` | bge-m3 (Ollama) | 1024 | 로컬, 다국어 |
| 게이트웨이 | vertexai:text-embedding-004 | 768 | `GATEWAY_URL` + `GATEWAY_MASTER_KEY` 필요 |

---

## 벤치마크 결과

전체 보고서는 [`docs/reports/`](docs/reports/)를 참조하세요.

---

## 개발

```bash
npm run typecheck   # TypeScript 검사
npm run check       # Biome 린트 + 포맷
```

---

## 라이선스

Apache 2.0 — [LICENSE](LICENSE) 참조

[Naia OS](https://github.com/nextain/naia-os) by [Nextain](https://nextain.io) 프로젝트의 일부.
