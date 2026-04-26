# Naia Memory (formerly Alpha Memory)

**AI 에이전트용 인지 메모리 아키텍처** — 중요도 게이팅 인코딩, 벡터 검색, 지식 그래프, 에빙하우스 망각 곡선, 그리고 주요 메모리 시스템과의 헤드투헤드 벤치마크를 포함합니다.

[English](README.md) | [한국어](README.ko.md)

## Naia 생태계에서의 위치

Alpha Memory는 Naia 오픈소스 AI 플랫폼 4개 레포 중 하나입니다:

| 레포 | 역할 |
|------|------|
| [naia-os](https://github.com/nextain/naia-os) | 데스크톱 셸 + OS 이미지 (호스트) |
| [naia-agent](https://github.com/nextain/naia-agent) | 런타임 엔진 (루프·툴·compaction) |
| [naia-adk](https://github.com/nextain/naia-adk) | 워크스페이스 포맷 + 스킬 라이브러리 |
| **alpha-memory** (이 레포) | 메모리 구현체 |

### 의존이 아닌 인터페이스

Alpha Memory는 `@nextain/agent-types`에 명세된 **`MemoryProvider` 계약의 한 구현체**입니다:

- **투명** — 계약은 공개됩니다. 같은 계약을 구현하는 어떤 메모리 시스템이든 런타임 코드 수정 없이 Alpha Memory를 대체할 수 있습니다.
- **묶이지 않음** — alpha-memory는 naia-agent의 런타임에 의존하지 않습니다. naia-agent는 이 패키지를 인터페이스 뒤의 블랙박스로 취급합니다.
- **추상화됨** — Alpha Memory를 다른 구현체(mem0, Letta, 자체 제작)로 교체해도 Naia 생태계의 나머지는 그대로 돕니다.

Naia 생태계의 더 큰 원칙의 일부: 레포들은 **런타임 의존이 아닌 공개 인터페이스**로 연결됩니다. 전체 그림은 [naia-agent README](https://github.com/nextain/naia-agent) 참고.

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
        ├── adapter-naia.ts         # Naia Memory (formerly Alpha Memory) (이 프로젝트)
        ├── adapter-mem0.ts         # mem0 OSS
        ├── adapter-sillytavern.ts  # SillyTavern (vectra + transformers.js)
        ├── adapter-letta.ts        # Letta (구 MemGPT)
        ├── adapter-zep.ts          # Zep CE
        ├── adapter-openclaw.ts     # OpenClaw
        ├── adapter-sap.ts          # Super Agent Party (mem0 + FAISS)
        └── adapter-jikime-mem.ts   # Jikime Memory
```

---

## 설치

```bash
npm install @nextain/naia-memory
# 또는
pnpm add @nextain/naia-memory
```

## 사용법

```typescript
import { MemorySystem } from "@nextain/naia-memory";

// 로컬 SQLite 백엔드로 초기화 (API 키 불필요)
const memory = new MemorySystem({ adapter: "local" });
await memory.init();

// 메시지를 메모리에 인코딩
await memory.encode("사용자는 다크 모드를 선호하고 Neovim을 에디터로 사용함");

// 쿼리에 관련된 기억 인출
const results = await memory.recall("사용자가 쓰는 에디터는?");
console.log(results); // ["사용자는 다크 모드를 선호하고 Neovim을 에디터로 사용함"]

// 세션 시작 시 — 시스템 프롬프트에 주입
const context = await memory.sessionRecall("새 대화 시작");
// context: 시스템 프롬프트 앞에 붙일 문자열
```

---

## 빠른 시작 (벤치마크)

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

**R2 보고서 (2026년 4월)** — 1000 facts, 240 queries, 4개 시스템, 한국어 + 영어:

| 시스템 | 한국어 (R1) | 영어 (R2) |
|--------|:---------:|:--------:|
| **Alpha Memory (Naia)** | **65%** | 46% |
| SillyTavern | 46% | **64%** |
| Letta | 47% | — |
| mem0 | 재실행 필요* | 43% |
| SAP | 재실행 필요* | 45% |

*R1 한국어: mem0/SAP는 API 속도 제한 오류로 재실행 필요.

모든 시스템이 F 등급 (abstention 기준 미충족).

→ 전체 보고서: [`docs/reports/benchmark-r2-2026-04.ko.md`](docs/reports/benchmark-r2-2026-04.ko.md) | [`docs/reports/benchmark-r2-2026-04.en.md`](docs/reports/benchmark-r2-2026-04.en.md)

---

## 개발

```bash
npm run typecheck   # TypeScript 검사
npm run check       # Biome 린트 + 포맷
```

---

## AI-Native 오픈소스 철학

이 프로젝트는 AI-native 개발 철학으로 만들어졌습니다:

- **AI 컨텍스트는 1급 산출물** — `.agents/` 컨텍스트 파일이 코드와 함께 버전 관리됨
- **아키텍처로 증명하는 프라이버시** — 메모리는 로컬 저장 + E2E 암호화. 서비스 제공자도 내용 접근 불가
- **AI 주권** — 사용자가 AI 기억의 주인. Nextain은 인프라를 제공할 뿐, 데이터에 접근하지 않음
- **투명한 AI 기여** — AI 기여는 `Assisted-by:` git 트레일러로 명시

`.agents/`, `.users/` AI 컨텍스트는 [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) 라이선스 — 출처 표기 및 동일 라이선스 필수.

> 바이브 코딩 시대에 AI 컨텍스트는 코드만큼 가치 있는 자산입니다.

---

## 라이선스

Apache 2.0 — [LICENSE](LICENSE) 참조

[Naia OS](https://github.com/nextain/naia-os) by [Nextain](https://nextain.io) 프로젝트의 일부.
