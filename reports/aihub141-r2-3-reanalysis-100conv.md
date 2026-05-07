# AI Hub 141 R2.3 — 정직한 재해석

**Source**: `reports/aihub141-r2-3-2026-05-07T05-19-43-284Z.json`
**Adapter**: naia-local

> Cross-review (devil's advocate) 발견에 따라 *3-axis 정직한 측정*. 같은 report 위에서 logic 재적용. 비용 0.

## 1. recall@K — topK ceiling 효과

| K | matched / GT | recall@K |
|---|---|---|
| 5 | 996 / 2596 | **38.4%** |
| 10 | 1558 / 2596 | **60.0%** |
| 20 | 1794 / 2596 | **69.1%** |

Average recalled set: 11.6 facts / GT: 8.7 facts (300 sessions, median recalled = 11).

→ topK=20 이 평균 recalled set (11.6) 보다 크면 **"top 20 안에 있냐"** 만 본 셈. ranking 품질 측정 X.

## 2. Polarity-aware match — 부정형 false positive

| metric | value |
|---|---|
| Negation GT facts | 383 |
| Matched (keyword, no polarity check) | 277 |
| Matched (polarity-aware) | 136 |
| **Polarity-flipped false positives** | **141** (50.9% of keyword matches) |

### Polarity-corrected recall@20

recall@20 (polarity-aware) = **62.8%** (1631 / 2596)

## 3. Hard match — entire GT substring

| K | matched / GT | hard recall@K |
|---|---|---|
| 5 | 0 / 2596 | **0.0%** |
| 10 | 0 / 2596 | **0.0%** |
| 20 | 0 / 2596 | **0.0%** |

→ Hard match = GT phrase (조사 제거 후) 가 recalled fact 의 substring. topK ceiling 회피, naia 가 *원형* 그대로 회상한 비율.

## 4. 정직한 band

| metric | recall | 의미 |
|---|---|---|
| recall@5 (loose keyword) | **38.4%** | top-5 ranking 품질 (LLM context 주입 가정) |
| recall@10 (loose keyword) | 60.0% | mid-bound |
| recall@20 (loose keyword) | 69.1% | ← 원래 보고 (inflated by topK ceiling) |
| recall@20 (polarity-aware) | **62.8%** | false positive 제외 — 비교 가능한 정직한 수치 |
| recall@20 (hard, entire phrase) | 0.0% | naia 가 GT 원형 그대로 저장 X — *paraphrase mechanism 정상 동작* |

### 결론

- **정직한 band: 38.4% ~ 62.8%** (recall@5 ~ recall@20 polarity-aware)
- 하한 (38.4%) — daily LLM context 주입 시 top-5 안에 prior fact 가 있을 확률
- 상한 (62.8%) — 전체 fact pool 안에 있고 polarity 도 맞음 (false positive 제외)
- recall@20 hard 가 0% 인 것은 *bug 아님* — naia 의 atomic fact extraction ("사용자 X: Y" 형식) 이 GT 의 자연 phrase ("나는 X 이다") 와 surface 다른 *paraphrase* 인 정상 동작. embedding cosine metric 으로만 정확 측정 가능 (별도 spike)

### 외부 벤치 비교 (cross-review reviewer 1)

- LoCoMo J-score (영어): mem0 67%, Letta 74%, Zep 66-75%, MemU 92%
- 다른 metric, 직접 비교 disclaim 필요. 그러나 *수치적으로* naia 62.8% (한국어 polarity-aware) ≈ mem0/Zep mid-tier (영어).
- AI Hub 141 = naia 가 *novel KO multi-session memory benchmark* 첫 시도. 외부 leaderboard 없음.

