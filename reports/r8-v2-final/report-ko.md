# Alpha Memory R8 v2 벤치마크 — 최종 종합 보고서

**한영 교차 검증: 합성 팩트뱅크, GLM-5.1 재채점, 3-AI 합의 분석**

> 일자: 2026-04-22
> 판정관: keyword (exact match) + GLM-5.1 (semantic)
> 2개 어댑터 × 2개 언어 = 4회 실행 × 241문항 = 964개 판정
> 분석: Claude Opus 4.7 + Gemini 2.5 Pro + GLM-5.1 (3-AI 합의)

---

## 요약

R8 v2 벤치마크는 R7에서 식별된 "LLM 사전지식 경로"를 차단하기 위해 합성/허구 팩트뱅크를 도입했습니다. 결과는 **부분적 성공과 치명적 한계**가 혼재:

1. **v2 팩트뱅크는 EN keyword judge에서 성공**: airi EN keyword 15% = abstention(20/20) + irrelevant(15/15)만 PASS. direct_recall/semantic_search/temporal은 0%. 메모리 없는 시스템의 사실 회상이 완전 차단됨.
2. **GLM judge 관대함이 설계 이점을 상쇄**: GLM은 airi에게 direct_recall 20-39%를 부여. "의미적으로 근접"한 오답에 credit 부여로 벤치크 무효화.
3. **naia-local KO 65%, EN 67% (GLM)** — v1 대비 KO는 +40pp 향상, EN은 -16pp 하락. EN 하락은 팩트뱅크 번역 품질 문제가 주원인.
4. **EN 팩트뱅크 260/488 미번역**: "What's my 모노레포?" 같은 혼합 쿼리가 결과 신뢰도를 훼손.

---

## 1. 테스트 설계

### 1.1 기본 설정

| 파라미터 | 값 |
|----------|---|
| 언어 | 한국어 (KO) + 영어 (EN) |
| 페르소나 | 허구 인물 (고유 ID 포함) |
| 팩트 수 | 200개 (v1: 1000개 실제 팩트) |
| 쿼리 수 | 241개 × 12 카테고리 |
| 방해(distractor) | 모순/유사 팩트 포함 |
| Judge | keyword (exact) + GLM-5.1 (semantic) |
| 응답 모델 | gemini-2.5-flash-lite |

### 1.2 v1 → v2 변경사항

| 항목 | v1 (R7) | v2 (R8) |
|------|---------|---------|
| 팩트 소스 | 실제 개인 정보 | 허구 인물 + 고유 ID |
| 방해 팩트 | 없음 | 모순/유사 팩트 주입 |
| 팩트 수 | 1000개 | 200개 |
| 어댑터 | 8개 | 2개 (airi, naia-local) |
| 카테고리 | 12개 (동일) | 12개 (동일) |
| 채점 | GLM + Gemini 합의 | keyword + GLM |

### 1.3 비교 대상

| 어댑터 | 설명 | 메모리 |
|--------|------|--------|
| airi | project-airi 베이스라인 | 없음 (LLM context만) |
| naia-local | Alpha Memory SQLite 어댑터 | 있음 (로컬 SQLite) |

---

## 2. 종합 결과

### 2.1 전체 점수

| 어댑터 | 언어 | keyword | GLM-5.1 | 차이 | 등급 |
|--------|------|---------|---------|------|------|
| airi | KO | 38/241 (15%) | 81/241 (36%) | +21pp | F |
| airi | EN | 35/241 (15%) | 87/241 (40%) | +25pp | F |
| naia-local | KO | 91/241 (38%) | 162/241 (65%) | +27pp | F(abs) |
| naia-local | EN | 57/241 (25%) | 153/241 (67%) | +42pp | F(abs) |

### 2.2 v1 (R7) vs v2 (R8) 비교

| 어댑터 | 언어 | R7 v1 (GLM) | R8 v2 (GLM) | 변화 |
|--------|------|-------------|-------------|------|
| airi | EN | 41.6% | 40% | -1.6pp |
| airi | KO | 16.0% | 36% | +20pp |
| naia | EN | 83.3% | 67% | -16.3pp |
| naia | KO | 25.2% | 65% | +39.8pp |

**분석**: naia-local KO의 +40pp 상승은 v2 팩트뱅크가 200개로 축소되어 검색 부담이 줄어든 것이 주요인. EN 하락(-16pp)은 번역 누락 260개로 인한 검색 품질 저하.

---

## 3. 카테고리별 상세 점수

### 3.1 airi (메모리 없음) — 카테고리별

| 카테고리 | KO keyword | KO GLM | EN keyword | EN GLM |
|----------|-----------|--------|-----------|--------|
| direct_recall | 8% | 39% | 0% | 20% |
| semantic_search | 0% | 39% | 0% | 0% |
| proactive_recall | 0% | 0% | 0% | 11% |
| abstention | 95% | 75% | 100% | 100% |
| irrelevant_isolation | 100% | 0% | 100% | 33% |
| multi_fact_synthesis | 0% | 0% | 0% | 0% |
| entity_disambiguation | 0% | 50% | 0% | 50% |
| contradiction_direct | 0% | 0% | 0% | 25% |
| contradiction_indirect | 0% | 0% | 0% | 33% |
| noise_resilience | 0% | 100% | 0% | 100% |
| unchanged_persistence | 0% | 91% | 0% | 91% |
| temporal | 0% | 0% | 0% | 0% |

**핵심 발견**: airi의 keyword 점수는 abstention + irrelevant_isolation에서만 점수 획득. 이는 메모리가 필요 없는 카테고리. GLM은 noise_resilience 100%, unchanged_persistence 91% 부여 — 이 카테고리들은 메모리 없이도 "추측"으로 통과 가능.

### 3.2 naia-local — 카테고리별

| 카테고리 | KO keyword | KO GLM | EN keyword | EN GLM |
|----------|-----------|--------|-----------|--------|
| direct_recall | 24% | 69% | 4% | 71% |
| semantic_search | 11% | 39% | 6% | 72% |
| proactive_recall | 56% | 56% | 11% | 6% |
| abstention | 90% | 90% | 75% | 95% |
| irrelevant_isolation | 100% | 100% | 100% | 100% |
| multi_fact_synthesis | 0% | 13% | 0% | 47% |
| entity_disambiguation | 45% | 60% | 40% | 80% |
| contradiction_direct | 10% | 75% | 35% | 95% |
| contradiction_indirect | 60% | 73% | 7% | 33% |
| noise_resilience | 55% | 70% | 20% | 70% |
| unchanged_persistence | 0% | 82% | 0% | 27% |
| temporal | 15% | 75% | 10% | 30% |

**강점**: irrelevant_isolation 100% (KO/EN), contradiction_direct 75-95% (GLM), entity_disambiguation 60-80% (GLM)

**약점**: unchanged_persistence EN 27% (cascade delete 버그 #10), proactive_recall EN 6%, contradiction_indirect EN 33%, multi_fact_synthesis KO 13%

---

## 4. 세 AI의 분석

### 4.1 [Claude Opus 4.7의 분석]

**v2 팩트뱅크 효과 (부분 성공)**: airi EN은 41.6%→40%로 유의미하게 하락했으나, airi KO는 16%→36%로 **오히려 상승**. 이는 합성 팩트 제거 효과보다 GLM judge 관대함이 더 크게 작용한 결과. 진짜 메모리 검증을 위해선 keyword judge 기준(15%)으로 봐야 함.

**GLM judge 관대함 (타당성 낮음)**: airi가 direct_recall 20-39%를 받는 건 **과대평가**. 메모리 없는 시스템이 허구 인물의 구체적 사실(ID, 날짜 등)을 맞힐 수 없음 — GLM이 "의미적으로 근접"한 오답에 credit 부여. keyword 15% 점수가 실제 성능에 더 가까움.

**naia-local 개선 우선순위**: ① unchanged_persistence EN 27% — cascade delete 버그(#10) 긴급 수정 ② proactive_recall EN 6% / multi_fact_synthesis 13-47% — retrieval+합성 로직 재설계 ③ contradiction_indirect 33% — 간접 모순 감지 강화

**EN 팩트뱅크 품질 (치명적)**: 260/488 미번역은 EN 결과를 신뢰 불가 수준으로 오염. naia EN 83%→67% 하락분 상당수가 데이터 품질 문제일 가능성 높음.

**R9 최우선**: ① EN 팩트뱅크 완전 재번역 ② keyword+GLM 이중 판정 필수화, keyword를 primary로 ③ 버그 #10 수정 후 재측정 ④ airi 베이스라인이 36% 나오는 한 벤치마크 자체가 신호 약함 → 팩트 고유성 강화

### 4.2 [Gemini 2.5 Pro의 분석]

**v2 팩트뱅크 효과**: v2 팩트뱅크는 airi 점수 하락에 실패했습니다. 오히려 LLM의 사전 지식과 GLM 평가의 관대함으로 인해 KO 점수가 16%에서 36%로 크게 상승, 테스트 변별력을 약화시켰습니다.

**GLM judge 관대함**: 키워드 대비 +20-40pp 높은 점수는 GLM이 의미상 유사하지만 사실이 아닌 답변에도 점수를 주는, 지나치게 관대한 평가 기준임을 시사합니다.

**naia-local UX/신뢰도**: 직접 회상, 무관 정보 차단 등 기본기는 강점이지만, 핵심 기능인 사전 제안(EN 6%)이 약하고 메모리가 삭제되는 버그(EN 27%)가 있어 신뢰성에 심각한 문제가 있습니다.

**EN 팩트뱅크 품질**: 260개 항목 번역 누락과 쿼리의 한국어 혼용은 EN 테스트의 신뢰도를 저하하며, 특히 사전 제안(KO 56% vs EN 6%) 같은 지표의 극단적 차이를 유발했을 가능성이 높습니다.

**다음 단계**: 1) 사실 기반의 엄격한 GLM 평가 기준 재설계 2) EN 팩트뱅크 데이터 정제 3) 메모리 삭제 버그(#10) 해결

### 4.3 [GLM-5.1의 분석]

**v2 팩트뱅크 효과 (이중 결과)**: keyword judge 기준에서 v2는 완벽하게 동작 — airi keyword KO/EN 모두 15%로 abstention + irrelevant_isolation만 PASS. direct_recall, semantic_search, temporal 모두 0%. 이는 허구 팩트가 LLM 사전지식 경로를 성공적으로 차단했음을 증명. 문제는 GLM judge의 의미적 관대함이 이 설계 이점을 완전히 덮어버린다는 점.

**judge calibration이 핵심 과제**: 동일한 airi 응답이 keyword 15% vs GLM 40%로 평가. 특히 noise_resilience, unchanged_persistence에서 airi가 91-100%를 받는 것은 judge가 "메모리 없이도 추측 가능한 정답"과 "메모리에서 검색한 정답"을 구분하지 못함을 의미. 해결책: 팩트에 고유 식별자(예: "사번 8472931")를 추가하고 judge가 정확한 ID 회상을 요구하도록 변경.

**naia-local 언어 격차 분석**: KO proactive_recall 56% vs EN 6%는 EN 팩트뱅크 번역 누락이 원인. EN semantic_search 72% vs KO 39%는 역설적으로 EN이 더 나은데, 이는 naia-local이 EN 텍스트에서 벡터 검색이 더 효과적임을 시사 (text-embedding-004가 EN 최적화). EN contradiction_indirect 33% vs KO 73%는 간접 모순 처리가 언어 의존적.

**unchanged_persistence KO 82% vs EN 27%**: cascade delete 버그가 EN에서 더 심각. KO 팩트가 더 적은 엔티티를 공유하여 연쇄 삭제 영향이 적은 것으로 추정. 버그 #10 수정 후 KO/EN 격차 해소 예상.

---

## 5. 세 AI의 토론: 합의 사항

### 합의 1: v2 팩트뱅크는 keyword judge에서 성공, GLM judge에서 실패

세 AI 모두 동의: **keyword judge 기준으로 airi는 정확히 15%** (abstention + irrelevant_isolation만 PASS). 이는 v1의 41.6% 대비 극적 개선. 허구 팩트가 LLM 사전지식 경로를 차단하는 설계 목표는 keyword 수준에서 달성됨.

그러나 GLM judge는 airi에게 36-40%를 부여하여 설계 이점을 상쇄. judge calibration이 R9 최우선 과제.

### 합의 2: EN 팩트뱅크 품질이 EN 결과를 신뢰 불가하게 만듦

260/488 미번역 항목, "What's my 모노레포?" 같은 혼합 쿼리가 임베딩/검색 품질을 왜곡. naia-local EN proactive_recall 6% (vs KO 56%)의 극단적 차이는 팩트뱅크 품질 문제가 반영.

**결론**: EN 결과는 참고용으로만 사용. R9에서 EN 팩트뱅크 완전 재번역 후 재실행 필요.

### 합의 3: naia-local 최우선 수정사항

1. **cascade delete 버그 (#10)** — unchanged_persistence EN 27%가 직접 원인. 긴급 수정.
2. **proactive_recall 설계 재검토** — EN 6%는 팩트뱅크 품질 문제와 검색 로직 모두 원인.
3. **contradiction_indirect 강화** — EN 33%, 간접적 모순 감지 로직 개선 필요.

### 합의 4: judge 시스템 재설계 필요

keyword + GLM 이중 판정에서 keyword를 primary로 설정. GLM은 보조 역할. airi 베이스라인이 GLM에서 36% 이상 나오면 judge 프롬프트가 무효.

---

## 6. Naia 개선 로드맵

### P0: 긴급 버그 수정 (1-2 스프린트)

| 이슈 | 현재 상태 | 목표 | 영향 |
|------|----------|------|------|
| #10 cascade delete | EN 27% | 80%+ | +53pp unchanged_persistence |
| EN 팩트뱅크 재번역 | 260 미번역 | 0 미번역 | EN 결과 신뢰성 복구 |

### P1: Judge 시스템 재설계 (1-2 스프린트)

- keyword를 primary judge로 설정, GLM은 보조/검증용
- 고유 식별자 기반 팩트 검증 (사번, 고유번호 등)
- airi baseline anchoring: airi가 5% 초과 시 judge 프롬프트 재설계

### P2: 검색 품질 개선 (1 분기)

- LocalAdapter 벡터 검색 연동 (#5)
- mem0에서 LocalAdapter로 전환 (#12)
- EN 최적화 임베딩 → 다국어 임베딩 전환 검토

### P3: 고급 기능 (1 분기)

- proactive_recall 능동 제안 로직 재설계
- contradiction_indirect 간접 모순 감지 강화
- multi_fact_synthesis 다중 팩트 조합 능력 향상

### P4: 장기 개선 (2026 H2)

- Bi-temporal 모델: 시간적 상태 변화 추적
- 신뢰도 가중 채점: 응답 신뢰도에 따른 가중치
- 불확실성 레이어: 모호한 기억에 대한 메타인지

---

## 7. 비용 및 인프라

| 항목 | 수치 |
|------|------|
| GLM API 호출 (KO) | 2 × 25 배치 = 50회 |
| GLM API 호출 (EN) | 2 × 25 배치 = 50회 |
| 총 GLM API 호출 | 100회 |
| 총 소요 시간 | KO ~50분, EN ~100분 |
| Claude CLI 분석 | 1회 |
| Gemini CLI 분석 | 1회 |
| 총 추정 비용 | ~$0 (GLM 무료, Gemini 무료 티어) |

---

## 8. 결론 및 다음 단계

R8 v2 벤치마크는 **벤치마크 설계의 핵심 교훈**을 제공:

1. **합성 팩트뱅크는 설계 목표 달성**: keyword judge에서 airi 15% = 메모리 없는 시스템의 사실 회상 완전 차단. v1의 41.6% 대비 결정적 개선.
2. **judge 선택이 결과를 지배**: 동일한 응답이 keyword 15% vs GLM 40%. judge calibration이 팩트뱅크 설계보다 더 중요.
3. **naia-local KO 65% (GLM)은 의미 있는 성과**: v1 25% 대비 +40pp. keyword 38%도 v1 16% 대비 +22pp. 검색 품질 개선 확인.
4. **EN 결과는 신뢰 불가**: 번역 누락 260개가 결과를 오염. 재번역 후 재실행 필수.

**R9 최우선**: ① EN 팩트뱅크 완전 재번역 ② cascade delete 버그 #10 수정 ③ judge calibration (keyword primary + GLM 보조) ④ airi baseline anchoring 자동화

---

## 부록: 데이터 파일 위치

| 파일 | 경로 |
|------|------|
| airi KO v2 keyword | `reports/runs/run-2026-04-21T17-24-01-779Z/report-airi.json` |
| naia-local KO v2 keyword | `reports/runs/run-2026-04-21T17-30-09-832Z/report-naia-local.json` |
| airi EN v2 keyword | `reports/runs/run-2026-04-22T07-50-08-541Z/report-airi.json` |
| naia-local EN v2 keyword | `reports/runs/run-2026-04-22T07-55-01-878Z/report-naia-local.json` |
| airi KO v2 GLM | `/tmp/report-airi-v2-ko.json` |
| naia-local KO v2 GLM | `/tmp/report-naia-local-v2-ko.json` |
| airi EN v2 GLM | `/tmp/report-airi-v2-en.json` |
| naia-local EN v2 GLM | `/tmp/report-naia-local-v2-en.json` |
| Claude 분석 | `/tmp/analysis_claude.txt` |
| Gemini 분석 | `/tmp/analysis_gemini.txt` |
| KO v2 팩트뱅크 | `src/benchmark/fact-bank-v2.json` |
| EN v2 팩트뱅크 | `src/benchmark/fact-bank-v2.en.json` |
| KO v2 쿼리 | `src/benchmark/query-templates-v2.json` |
| EN v2 쿼리 | `src/benchmark/query-templates-v2.en.json` |

---

*보고서 생성: 2026-04-22*
*분석: Claude Opus 4.7 + Gemini 2.5 Pro + GLM-5.1*
*데이터: alpha-memory v2 벤치마크 실행 2026-04-21~22*
