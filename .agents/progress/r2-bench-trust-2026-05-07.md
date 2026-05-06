# R2 Benchmark Trust — 한국어 자연 데이터 보강 (2026-05-07)

**Status**: Phase A 진입.
**Anchor**: 사용자 directive — "1등 X, 한국어에서 쓸만함 검증". 적은 비용 + 높은 신뢰성.
**Cross-review**: 2 reviewer (Plan + general-purpose ground inspection) 동시 실행 완료.

## 0. Why

`fact-bank.json` (KO 25 query) 의 한계:
- Sample size 작음 (1 query = 4pp 분해능)
- 합성 contradiction 비율 ~25% (자연 0.5-2%, 10-50× over-represented)
- Prompt-data surface overlap → over-fit retro `naia-memory#22`

→ **점수 자체를 truth source 로 쓸 수 없음**. R2.3/R2.5 측정 신뢰성 우선 보강.

## 1. Cross-review 종합 결론

### 공통 결론 (양 reviewer 일치)

| 항목 | Verdict |
|---|---|
| **R2.3 (multi-session recall)** | AI Hub 141 = 적합. personaFeatures dialog 등장률 84.5%, prevAggregatedpersonaSummary 가 monotone-growing 누적집합 → 자연 ground truth |
| **R2.5 (contradiction filter)** | 141 단독 **불가**. persona file-level 고정 → 자연 contradiction <1%. 별도 path 필수 |
| **License** | AI Hub raw json 재배포 X. loader-only commit + `AIHUB_141_PATH` env path |
| **Dataset 정량** | VL 8000 / TL 68000 file. S4 (4-session) 2000 file = R2.3 검증 최적 |

### Devil's advocate 추가 경고 (mitigation 반영)

1. **Annotation = ground truth 가정 위험** — personaFeatures crowdworker prefab. 84.5% 등장률 OK 이지만 type skew 가능.
2. **\"prefab feature recall\" ≠ \"daily 쓸만함\"** — metric gap 자각.
3. **KO baseline 공정성 함정** — mem0 default 영어 embedder. naia +X pp 가 *naia 강점* / *mem0 KO 약점* 구분 불가.

## 2. Path — 분리

| Phase | 내용 | 비용 | 산출 |
|---|---|---|---|
| **A** | AI Hub 141 → R2.3 *only* sanity check. **naia 단독, baseline 비교 X**. S4 100 conv subset, prev-agg ground truth, recall accuracy | 1 일 + ~$0.35 | "한국어 R2.3 X% recall" 절대 점수 |
| **B** | 사용자 daily ledger 50건 + 의도 contradiction 주입 30건 → R2.5 verify. self-bias 인정 (사용자 본인 사용 분포 = valid signal) | 1-1.5 일 + ~$0.1 | "R2.5 update 처리 Y% 정확" |
| **C** (유보) | KO embedder 정렬 + mem0/zep 비교. A/B 결과 본 후 결정 | 2 일 | comparable 비교 |

총 2-2.5 일 / ~$0.5 / 합성 question 0.

## 3. Phase A 구체

### Scope
- **AI Hub 141** Validation S4 zip 1개 unzip → 100 conv subset
- naia-local adapter 단독 (Heuristic / Gemini / Vllm filter 모두)
- baseline (mem0 등) 비교 X — 사용자 directive 정합

### 산출물
- `src/benchmark/aihub141/loader.ts` — zip → Episode[] + ground truth tuple (~150 LOC)
- `src/benchmark/aihub141/persona-recall-scorer.ts` — keyword + embedding cosine match (~100 LOC)
- `src/benchmark/comparison/run-comparison.ts` 분기 (`--dataset=aihub141`) (~50 LOC)
- `reports/aihub141-r2-3-{ts}.json` — 절대 점수 + per-conv breakdown

### 절대 점수 의미
- naia 단독 측정. mem0 등 baseline 비교 X.
- "한국어 R2.3 X% recall" 자체가 *처음 신뢰 signal*.
- ±2pp noise band 안이면 **measurement design 자체 재검토**. Phase B 자동 진입 X.

### License 강제
- `loader.ts` 안에서 `AIHUB_141_PATH` env var 읽기. raw json **commit X**.
- README 에 사용자 측 download 안내.

## 4. Phase B 구체

### Scope
- 사용자 daily naia 사용 ledger (대화 history) 에서 50 의미 있는 fact 추출
- 의도 contradiction 30건 주입 (직업/거주지/취향 update statement)
- naia R2.5 (contradiction filter) 의 supersede 정확도 + recall 측정

### 자기 평가 인정
- 사용자 본인 사용 분포 = naia OS 의 *진짜 target distribution*
- self-bias 가 invalid signal 이 아니라 *valid signal* (이 상황에서)

## 5. Anti-overfit guard (CLAUDE.md 정합)

- *범용 단일 전략* 만 — 카테고리별 적응형 가중치 X
- Phase A 결과 보고 prompt iteration X — *measurement* 만, *튜닝* X
- Phase B 의 ledger 도 사용자 측 frozen — naia 가 ledger 내용 모르고 측정

## 6. Decision gate

- Phase A 결과 noise (±2pp) → measurement design 재검토 (Phase B 진입 X)
- Phase A 결과 의미 있음 (한 번도 본 적 없는 KO 자연 dataset 위에서 30%+ recall) → Phase B 진입
- Phase B 결과 보고 Phase C 결정

## 7. Out of scope

- LoCoMo 영어 측정 (이번 path 와 분리)
- mem0/zep KO embedder 정렬 (Phase C 유보)
- naia mechanism iteration (R2.3/R2.5 기존 구현 그대로 측정)
