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

