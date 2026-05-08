# R3 + #27 Cross-Review Report (2026-05-09)

R3 Phase (R2.5 v2 chain + 보존 우선) + #27 Step 1/2/5 (confidence
threshold + HyDE + MMR) 완료 후 *2 reviewer 적대적 검토* 결과 archive.

## 누적 측정 결과

### Phase A 100 conv (baseline, 2026-05-07)
| Metric | Score |
|---|:-:|
| keyword recall@20 | 69.1% (loose) / 62.8% (polarity-aware) |
| **cosine 0.7 recall@20** | **76.8%** |
| recall@5 / @10 / @20 (cosine) | 44.1% / 66.9% / 76.8% |
| no-memory floor | 0% |

### Phase B-α R2.5 contradiction (80-entry ledger)
| Filter | Recall (A) | Supersede (B) | FP (C) |
|---|:-:|:-:|:-:|
| Heuristic | 100% | 3.3% | 0% |
| Gemini Flash Lite | 100% | **53.3%** | 0% |

### Phase B-γ A/B mechanism (30 conv, all noise band ±2pp)
| Mode | Δ baseline keyword | Δ baseline cosine 0.7 |
|---|:-:|:-:|
| importance OFF | +1.1pp | +0.3pp |
| KG OFF | -0.3pp | +0.8pp |
| 둘 다 OFF | -0.5pp | -0.3pp |
| naia-on-mem0 hybrid (5 conv) | -4.2pp keyword | recall@5 **-16pp** |
| MMR OFF | -1.1pp | -0.3pp |

### R3 + #27 Step 1 backward compat (30 conv, 2026-05-08)
| Mode | keyword | cosine 0.7 r@20 |
|---|:-:|:-:|
| baseline (R2.5 v1, prune) | 67.1% | 76.8% |
| **R3+#27 Step 1 (chain + 보존 + threshold default 0)** | **67.9%** | **77.4%** |
| Δ | +0.8pp | +0.6pp |

→ backward compat 검증 완료 — 모든 axis ±2pp noise band 안.

## Reviewer 1 (Plan, devil's advocate) 결론

### 모든 mechanism noise band 의 진짜 의미

가장 정합한 해석 = **(3) + (2) 결합**:
- **(3) R2.5 v2 chain + 보존 우선 통합 효과 dominate** — `mode='latest'` 가 status='active' 만 노출 → MMR 의 attribute-key diversity 가 *이미 chain 이 attribute 별 1개로 압축한 set* 위 작동 → MMR redundant
- **(2) measurement sensitivity 부족** — 30 conv × cosine 0.7 hard threshold = ~6 query 가 ±2pp noise band. 1-2pp scale mechanism 효과 detection 불가

기각: **(1) mechanism 무의미** — Phase A 76.8% (no-memory 0% 대비) 자체가 stack 결합 효과. ablation noise 가 stack 무의미 의미 X.

### 빠진 항목 우선순위

| 우선 | 항목 | 이유 |
|:-:|---|---|
| **1** | **#27 Step 1 sweep (minConfidence 0.005/0.01/0.5)** | 코드 in place, 측정만 추가. 현재 default=0 = step 자체 *측정 안 한 것* |
| **2** | #27 Step 3 cross-encoder (BGE-reranker) | Step 1 plateau 시 진짜 ranking 강화. chain 후 cross-encoder 가 진짜 추가 신호 |
| 3 | HyDE 측정 | caller LLM call 추가 후 |
| 4 | R2.5 v2 history mode 측정 | Phase B-α ledger 위 chain 회상률 |
| 5 | #30 long-term framework | naia OS 통합 prerequisite |

## Reviewer 2 (외부 비교, WebSearch) 결론

### 보존 우선 + chain 차별화 (시스템 비교)

| 시스템 | Update 처리 | Chain | Bi-temporal | Hard delete |
|---|---|:-:|:-:|:-:|
| **naia (R3)** | status=archived + chain + validity | **system-wide** | **system-wide** | No |
| Zep / Graphiti | edge invalidate | edges only | facts/edges only | No |
| mem0 v3 | A.U.D.N. + ID 재사용 | none | none | **Yes** |
| Letta | archival 갱신, dedup 미구현 | none | none | Yes |
| MemU | decay 자연 약화 | none | none | No |

**판정**: Zep 의 bi-temporal + chain 은 *graph edge 한정*. naia 는 *모든 fact* (graph 안 쓰는 단순 fact 포함) 에 system-wide 적용 — **부분 차별화** (Zep 보다 적용 범위 넓음, 발명은 아님).

### caller-injected HyDE design

업계 표준 HyDE = retrieval layer 가 LLM 직접 호출. naia = caller 책임. 차별화 가치 = architecture 청결성 (memory 가 LLM-free retrieval-only) + latency/cost predictability. 정확도 우위는 아님.

### mechanism noise band 의 외부 패턴

ZenBrain (LoCoMo ablation): gated update 제거 -20pp recall. Link 제거 -1.2pp F1. hierarchical -9.5%. 즉 **잘 설계된 시스템에서 핵심 mechanism on/off 는 visible 차이 만든다**.

naia 의 ±0.3pp noise = **(a) 각 mechanism 이 같은 retrieval signal 중복 공략 (causal redundancy) + (b) cosine 0.7 recall@20 axis 미세 변화 둔감 + (c) 30 conv 통계 power 부족** 결합. 통합 stack 가설은 *축 다양화* + *큰 N* 으로 재검증 필요.

### naia 진짜 defensible position

| 후보 | 외부 비교 | 판정 |
|---|---|:-:|
| **(a) 한국어 working baseline 76.8%** | LoCoMo 영어 중심, 한국어 publicly 측정 가능한 OSS 메모리 시스템 부재 | ✅ **진짜 advantage** (희소 niche) |
| (b) chain + bi-temporal **system-wide** | Zep 가 graph edge 동일 mechanism, scope 차이 | 부분 차별화 (scope 변형) |
| (c) caller-injected HyDE | 표준 HyDE 와 design choice, 정확도 우위 X | design taste |
| (d) 12x 빠른 속도 vs mem0 | mem0 v3+ single-pass + half-latency 자체 개선 중 | **재검증 필요** (mem0 v3 측정 전 보류) |

## 종합 결론

### Competitive Advantage (1)
**한국어 long-term conversational memory working baseline** — 영어 중심 LoCoMo 생태계 (mem0/Zep/Letta/MemU) 모두 한국어 측정 부재. naia 가 한국어 자연 대화 위 *publicly 측정 가능 + 76.8% mid-tier* baseline 확립 = 진짜 defensible position.

### 부분 차별화 (1)
**preservation-first system-wide invariant** — Zep facts-only bi-temporal 을 모든 fact 로 확장. 발명 아님, scope 차이.

### 재발명 / 보류 (2)
- **caller-injected HyDE** = architecture taste. 정확도 advantage 입증 X
- **12x 속도 advantage** = mem0 v3 single-pass 등장 후 재검증 필수. 현 주장은 base version 명시 없으면 약화

### 측정 한계 인정

mechanism noise band 는 *통합 stack 강점* 보다 **axis 둔감 + N 부족 + signal 중복** 진단이 우선. ZenBrain 류 ablation 처럼 visible mechanism 효과를 만들려면 *axis 다양화* (multi-hop / temporal / F1) + *큰 N* 이 다음 작업.

## 다음 우선순위

| 단계 | 작업 | 비용 | 가치 |
|---|---|:-:|---|
| **(1) 즉시** | #27 Step 1 sweep — minConfidence ∈ {0, 0.005, 0.01, 0.05, 0.5} × 100 conv | ~$2.5 + ~3시간 | Step 1 axis ceiling 진단 |
| (2) Step 1 plateau 시 | #27 Step 3 cross-encoder (BGE-reranker offline) | ~300 LOC + ~$1 | 진짜 ranking 강화 |
| (3) Step 1 비-plateau 시 | default 변경 + commit | minor | sweep 결과 활용 |
| (4) archive 정돈 | untracked reports 6개 정리 + commit | 30분 | working tree 청결 |
| (5) naia-os#240 통합 wait | — | 사용자 측 진행 | daily ground prerequisite |
| (6) #30 long-term framework | weekly self-eval + monthly snapshot | naia-os 통합 후 | 진짜 가치 검증 |

## 외부 LLM 정책 (이번 세션 추가)

CLAUDE.md anchor §8 (2026-05-08):
- naia-memory LLM 호출 = Gemini Flash Lite 또는 vLLM Gemma 4 E4B 만
- cross-review = Claude Code sub-agent (Plan / general-purpose)
- GLM = opencode 등 별도 CLI (zai coding plan 정합)
- deprecated: `run-comparison.ts:callGlmApi`, `cross-review-engine.ts`, `cross-review.ts`

## 이번 세션 commits

| commit | 내용 |
|---|---|
| `6e5232c` | R2.5 v2 chain + bi-temporal validity (Step 1-2) |
| `c7dac47` | recall mode option (Step 3-4) + 3 fix |
| `d08e456` | decay/prune 보수적 + episode 보존 (Step 5-6) + 3 fix |
| `7fb4aad` | R3 Phase comparison (backward compat verified) |
| `6202b60` | #27 Step 1 confidence threshold + 3 fix |
| `fd655ac` | callGlmApi deprecation |
| `6972378` | cross-review.ts / cross-review-engine.ts deprecation + anchor §8 |
| `ed47b6e` | #27 Step 2+5 — HyDE + MMR |

## 사용자 directive 정합 (2026-05-08)

- ✅ 시간 연관 회상 + 장기기억 보존 — R2.5 v2 chain + bi-temporal validity
- ✅ 모든 mechanism 삭제 보수적 — splice 제거 (decay, KG, association, episode)
- ✅ recall latency 수용 — 현재 store 크기에선 미미, #29 임계 망각 prerequisite
- ✅ Background brain / Active brain 책임 분리 — naia-agent#26/27 issue 신설
- ✅ 외부 LLM 정책 — Gemini + vLLM + Claude Code sub-agent 만
- 🟨 Retrieval ranking 강화 — Step 1+2+5 완료, Step 3 (cross-encoder) 별도 issue
