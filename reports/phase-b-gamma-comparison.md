# AI Hub 141 R2.3 — A/B Mechanism Comparison

Baseline = first report (naia-local | default).

## Recall@20

| Mode | Conv | Total GT | Matched | Micro recall | Δ baseline |
|---|---:|---:|---:|---:|---:|
| naia-local | default | 30 | 733 | 492 | **67.1%** | — |
| naia-local | no-importance | 30 | 733 | 500 | **68.2%** | +1.1pp |
| naia-local | no-kg | 30 | 733 | 490 | **66.8%** | -0.3pp |
| naia-local | no-importance+no-kg | 30 | 733 | 488 | **66.6%** | -0.5pp |
| naia-on-mem0 | default | 5 | 108 | 68 | **63.0%** | -4.2pp |

## Macro recall (per-session mean)

| Mode | Macro recall | Δ baseline |
|---|---:|---:|
| naia-local | default | 71.2% | — |
| naia-local | no-importance | 71.7% | +0.5pp |
| naia-local | no-kg | 70.6% | -0.7pp |
| naia-local | no-importance+no-kg | 70.2% | -1.0pp |
| naia-on-mem0 | default | 68.4% | -2.8pp |

## Per-nthSession

| Mode | S2 | S3 | S4 |
|---|---:|---:|---:|
| naia-local | default | 75.1% | 70.4% | 68.2% |
| naia-local | no-importance | 76.4% | 70.5% | 68.3% |
| naia-local | no-kg | 75.0% | 69.1% | 67.6% |
| naia-local | no-importance+no-kg | 76.0% | 67.9% | 66.9% |
| naia-on-mem0 | default | 90.3% | 57.0% | 58.1% |

## Cost / Time

| Mode | Elapsed | LLM calls | Embed calls | Cost USD |
|---|---:|---:|---:|---:|
| naia-local | default | 66.3 min | — | — | — |
| naia-local | no-importance | 64.4 min | 240 | 2822 | 0.0416 |
| naia-local | no-kg | 66.2 min | 240 | 2823 | 0.0416 |
| naia-local | no-importance+no-kg | 58.4 min | 240 | 2816 | 0.0415 |
| naia-on-mem0 | default | 190.1 min | 40 | 0 | 0.0053 |

## Mechanism 효과 정량 (vs baseline)

각 treatment 의 *baseline 대비 micro recall 변화* — mechanism 의 *실제 효과 정량*.

- **naia-local | no-importance**: +1.1pp — noise band ±2pp 안 — 효과 미미
- **naia-local | no-kg**: -0.3pp — noise band ±2pp 안 — 효과 미미
- **naia-local | no-importance+no-kg**: -0.5pp — noise band ±2pp 안 — 효과 미미
- **naia-on-mem0 | default**: -4.2pp — treatment 가 baseline 보다 **나쁨** — 해당 mechanism 의 *진짜 가치* 정량

## 해석 가이드

- *baseline (default)* = 모든 mechanism ON, Phase A 의 76.8% cosine 이 reference
- *--no-importance* = importance gating 효과 측정 (gating 없으면 어떻게?)
- *--no-kg* = KG spreading activation 효과 (graph 활성 없이 vector + BM25 만)
- *둘 다 OFF* = 두 mechanism 모두 없는 단순 retrieval

해석:
- baseline > treatment 큰 차이 → mechanism 진짜 가치 ✓
- baseline ≈ treatment → mechanism 효과 미미 (noise band)
- baseline < treatment → mechanism 이 *오히려 방해* (재검토 필요)


---

## Cosine 0.7 (semantic axis) reanalysis

같은 5 reports 의 cosine 0.7 recall — embedding-reanalyze.ts 결과.

| Mode | recall@5 | recall@10 | recall@20 |
|---|:-:|:-:|:-:|
| baseline 100 conv | 44.1% | 66.9% | **76.8%** |
| no-importance 30 | 44.1% | 65.3% | 77.1% |
| no-kg 30 | 44.6% | 66.7% | 77.6% |
| 둘 다 OFF 30 | 43.9% | 66.3% | 76.5% |
| **naia-on-mem0 5** | **27.8%** | 48.1% | 77.8% |

## Axis 종합 결론

1. **naia-local 의 4 mode 모두 semantic 차이 noise band 안** — importance / KG mechanism 의 visible 효과 X (현재 measurement)
2. **naia-on-mem0 recall@5 = 27.8% (naia-local 44.1% 대비 -16pp)** — recall@20 은 비슷한데 *top-5 ranking 약점* 명확. mem0 backend 의 약점은 retrieval *순서*
3. **naia 의 진짜 가치 = LocalAdapter retrieval ranking** (vector + BM25 + RRF) — backend 자체가 차별

## #27 (Retrieval ranking 강화) priority 강하게 보강

- naia-on-mem0 의 recall@5 약점 = ranking 강화 (HyDE / cross-encoder / MMR) 가 *진짜 향상 path*
- preservation-first (#25) prerequisite 도 ranking 강화 — mem0 \"97.8% junk\" 회피
