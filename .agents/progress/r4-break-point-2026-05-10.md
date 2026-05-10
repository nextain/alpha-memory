# R4 Break Point — naia-agent 통합 wait (2026-05-10)

cross-review (2 reviewer 일치) 권고 따라 *naia-memory 측 자율 진행 일시
정지*. naia-agent 통합 prerequisite 가 모든 다른 한계의 상위 종속.

## 1. naia-memory 측 ship-ready 영역

### Mechanism (모두 활성 + 검증)

| Phase | Step | 상태 | Tests / 측정 |
|---|---|:-:|---|
| **R1** 안정화 | 7 slices | ✓ | 기존 |
| **R2** Capability | 4 slices | ✓ | 기존 |
| **R3** Preservation-first | 7 step (Fact schema + R2.5 v2 + 보존) | ✓ | Phase A 30 conv backward compat verify (76.8% cosine 유지) |
| **#27** Retrieval ranking | Step 1 (threshold) + Step 2 (HyDE) + Step 5 (MMR) | ✓ + 측정 | 모두 noise band ±2pp = chain dominate (decision-matrix §A09 revised) |
| **#50** Cross-encoder | OfflineRerankerProvider (BGE-base) | ✓ | 5 conv smoke noise band, chain dominate 가설 검증 |
| **#28** Privacy | Part 1 (project scope strict) + Part 2 (Episode + intent penalty) | ✓ | unit test |
| **R4** Background brain | Step 1+2+3+4+5a+5c (Step 5b future) | ✓ | 13 unit tests + Phase B-α 19 spike + 30 replay |

### Public API (naia-agent 통합 측 reference)

```ts
import {
  MemorySystem, LocalAdapter,
  OpenAICompatEmbeddingProvider, buildLLMFactExtractor,
  OfflineRerankerProvider,         // #50 cross-encoder (선택)
  IdentityReranker,                 // no-op
  type RerankerProvider,
  type SpikeEvent,                  // R4 #26
  type SpikeAction,
  type ActiveContext,
  type SubscribableMemory,
} from "@nextain/naia-memory";

// 1. 기본 사용 (#1)
const memory = new MemorySystem({ adapter, factExtractor, embeddingProvider });
await memory.encode({ content, role: "user" }, { project: "personal" });
const result = await memory.recall(query, {
  project, topK: 10,
  scopeMode: "strict",         // R5 #28 — cross-project leak 차단
  minConfidence: 0,            // #27 — default 0 (chain dominate, 변경 X)
  queryHint: hydeAnswer,       // #27 — caller-injected HyDE
  mode: "latest",              // R2.5 v2 — latest/history/at-time
});

// 2. R4 Background brain subscribe
memory.on("spike", async (e: SpikeEvent): Promise<SpikeAction | void> => {
  // naia-agent: source-monitor + pragmatic-gate 결정
  return { decision: "inject-now", reason: "..." };
});
memory.setActiveContext({
  topics: [...], recentFactIds: [...],
  scope: { project: "personal" }, // 필수 — anchor §A10
  optOutTopics: [...],
});

// 3. R4 Cross-encoder (optional)
const reranker = new OfflineRerankerProvider("bge-reranker-base");
const adapterWithRerank = new LocalAdapter({
  storePath, embeddingProvider, reranker,
});
```

### Spike trigger 5개 활성

| Reason | Trigger 시점 | 구현 |
|---|---|:-:|
| `contradiction` | R2.5 supersede 시점 | ✓ Step 3a |
| `high-importance-relevant` | 새 fact + active context 매칭 + importance ≥ 0.8 | ✓ Step 3b |
| `temporal-anchor` | 365/180/90/30 일 ± 1day + importance ≥ 0.7 | ✓ Step 5a |
| `user-emotion-anniversary` | 같은 month/day + importance ≥ 0.8 + 작년 이상 | ✓ Step 5c |
| `recall-failure-resolved` | 사용자 query 가 자주 fail 했는데 새 fact 추출 | future (Step 3c, query history infra) |
| `repeated-fail` | 같은 query 반복 + 답 변경 | future (Step 3d) |
| `cross-domain-analogy` | KG bridging fact | future (Step 5b, KG cluster algorithm) |

## 2. naia-agent 통합 측 작업 (사용자/agent 측 책임)

### Prerequisite issues

| Issue | 내용 | 책임 |
|---|---|---|
| naia-os#240 | naia-agent agent loop 의 memory wire-in | 사용자 측 |
| naia-agent#26 | Active brain (subscribe + source monitor + pragmatic gate) | naia-agent 개발 측 |
| naia-agent#27 | SpikeEvent / ActiveContext schema in `@nextain/agent-types` | naia-agent 개발 측 |

### 통합 후 즉시 가능한 측정

1. **R4 Step 3b 활성도** — naia-agent 가 `setActiveContext` push 시 high-importance-relevant trigger 발사 빈도
2. **Spike timing precision** — 사용자 평가 (적절 inject vs noise)
3. **Cross-project leak rate** — strict mode 차단 효과 정량
4. **Daily ground recall** — 사용자 본인 ledger 위 합성 한계 극복

## 3. 미진행 항목 (yak shaving 회피)

cross-review (2 reviewer 일치) 권고 따라 *지금 진행 X*:

| 항목 | 거부 이유 |
|---|---|
| #27 100 conv × 5 sweep ($10, 20h) | plateau bias confirmation |
| Phase A 위 active context 시뮬레이션 | synthetic 위 synthetic recursion |
| BGE-reranker-large / v2-m3 (Python BAAI) | chain dominate 가설이면 같은 plateau |
| mock naia-agent loop | synthetic recursion |
| Phase B-δ KLUE/KorQuAD | KLUE-DST single-session, R2.3 측정 X |
| Step 5b cross-domain-analogy stub | KG cluster algorithm 필요, daily ground 없으면 의미 X |

## 4. naia 의 *novel first* 영역 (cross-review 외부 비교)

| 영역 | 외부 사례 | naia position |
|---|---|---|
| **Background brain spike timing-precision 측정 framework** | Letta sleep-time = math task 만, conversational spike 측정 부재 | naia first ⭐ |
| **한국어 일반 daily-life multi-session memory ground** | CareCall (의료) 외 부재 (KLUE-DST single-session) | naia first ⭐ |

이 두 영역이 *naia-agent 통합 후 진짜 first 측정* — 합성 위 시뮬레이션은 X.

## 5. Decision-matrix 정합 (이번 세션 결과)

| § | 내용 | 검증 |
|---|---|:-:|
| §A07 | 보존 우선 + recall latency 수용 | ✓ R3 backward compat verified |
| §A08 | Background + Active 책임 분리 | ✓ R4 + naia-agent#26/27 |
| §A09 (revised) | Retrieval ranking 강화 priority ↓ — chain dominate | ✓ #27 sweep + #50 5 conv plateau |
| §A10 | Privacy 5 차원 분리 | ✓ #28 Part 1+2 + R4 scope filter |
| §A11 | 합성 측정 한계 인정 | ✓ Phase A/B-α 모두 synthetic |
| §A12 | naia novel first 영역 | ✓ cross-review 외부 검증 |

## 6. 이번 세션 commits 누적 (origin/main = `eea3833`)

```
d9c2022  feat(memory): #50 OfflineRerankerProvider implementation
2a433cc  chore(repo): untracked file cleanup
5fb5776  feat(privacy): #28 Part 1 — project scope hard partition
c7b389b  feat(benchmark): aihub141 --reranker CLI option
a703bb7  fix(memory): #50 default model bge-reranker-base
7e04de8  feat(memory): R4 #26 Step 1+2 — spike infrastructure
d0bdd78  archive(report): #50 BGE-reranker chain dominate 검증
6e367e8  feat(memory): R4 #26 Step 3 — spike emit triggers
fdb2272  feat(privacy): #28 Part 2 — Episode strict scope + intent penalty
49425a6  feat(memory): R4 #26 Step 4 — replay-worthy fact strength boost
920212d  docs(integration): R4 #26 spike subscription API 추가
0d12b8a  feat(memory): R4 #26 Step 5a (temporal-anchor) + spike count tracker
3a218f2  test(memory): R4 #26 unit tests — 진짜 동작 verify (12 tests pass)
b82f81a  feat(benchmark): phase-b run.ts — R4 spike emit + replay count 보고
578c848  archive(report): R4 #26 Background brain 측정 결과
23d39a8  docs(decision-matrix): §A09 revised + A11-A12 추가
eea3833  feat(memory): R4 #26 Step 5c — user-emotion-anniversary trigger
```

## 7. 다음 세션 시작 시 권장 reading order

1. 본 파일 (`r4-break-point-2026-05-10.md`) — 현 상태 + 다음 step
2. `decision-matrix.md` §A07-A12 — 결정 anchor
3. `r3-cognitive-architecture-2026-05-08.md` — R3+ phase plan
4. `docs/integration.md` — naia-agent 통합 측 SoT
5. (필요 시) `r2-bench-trust-2026-05-07.md` — Phase A/B 측정 결과

## 결론

naia-memory 측 *ship-ready*. R3 + #27 + #28 + R4 Step 1-5 (5b 제외)
모두 활성 + unit test + 합성 측정 verify 완료. 진짜 가치 (daily ground)
는 naia-agent 통합 후만 측정 가능.

**break point 명시** — naia-agent / naia-os 측 작업 진행 wait. 그 후
naia-memory 측 신규 작업:
- R4 Step 3c+d (query history 인프라) — 통합 후 daily ground 위
- R4 Step 5b (KG cluster algorithm) — 같음
- 측정 framework — daily collector + weekly self-eval (#30)
