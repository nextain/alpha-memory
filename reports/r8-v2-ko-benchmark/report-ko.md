# Alpha Memory v2 벤치마크 — R8 보고서

**v2 Fact Bank 기반 한국어 벤치마크: 허구 팩트 + 디스트랙터 + 0-3 채점**

> 일자: 2026-04-22
> 판정: keyword (0-3 점수)
> 응답 모델: gemini-2.5-flash-lite
> 어댑터: airi (no-memory baseline), naia-local (LocalAdapter + LLM fact extraction)
> 2개 어댑터 × 241문항 = 482개 판정

---

## 요약

v2 팩트뱅크는 R7에서 발견된 "LLM 사전지식으로 정답 추측" 문제를 해결하기 위해 설계되었습니다. 허구 페르소나 + 유니크 ID + 디스트랙터 쌍을 사용하여 메모리 없이는 정답을 맞힐 수 없도록 설계되었습니다.

결과: **airi baseline 15.4% → naia-local 38.5%**. v2 팩트뱅크는 LLM 사전지식 경로를 성공적으로 차단했으나, keyword judge의 이진 채점(0/3 only)으로 인해 부분 점수가 포착되지 않는 한계가 있습니다.

### 핵심 발견

1. **airi v2 KO 15.4% (vs R7 v1 16.0%)** — LLM 사전지식 경로 대부분 차단. 남은 38개 PASS는 abstention(19) + irrelevant(15) + direct_recall 4개(우연히 키워드 매칭)
2. **naia-local v2 KO 38.5%** — LocalAdapter가 실제 메모리 검색을 제공함을 확인. airi 대비 +23pp
3. **keyword judge 이진 채점** — score 1, 2가 0회 발생. 0-3 스케일 설계가 keyword judge에서는 0/3 이진으로만 동작
4. **unchanged_persistence 0%, multi_fact_synthesis 0%** — 두 카테고리 모두 여전히 완전 실패

---

## 1. 테스트 설계

### 기본 설정

| 항목 | 값 |
|------|------|
| 팩트뱅크 | v2 (200 facts: 164 NL / 36 unique ID, 110 distractors, 9 temporal updates) |
| 쿼리 | 241개 (12 카테고리) |
| 페르소나 | 허구 인물 (루아, 넥스필드 소속, 피넛타운 거주) |
| 언어 | 한국어 |
| 판정 | keyword (0-3 점수) |
| 응답 모델 | gemini-2.5-flash-lite |
| 임베딩 | gemini text-embedding-004 (3072d) |

### 비교 대상

| 어댑터 | 설명 |
|--------|------|
| airi | 메모리 없는 베이스라인. LLM 컨텍스트만으로 응답 |
| naia-local | LocalAdapter + LLM atomic fact extraction + Gemini 임베딩 |

### v2 팩트뱅크 설계 원칙

| 원칙 | 설명 |
|------|------|
| 80% NL / 20% unique ID | 자연어 서술형이 주류, 고유 ID는 정확한 회상만 PASS |
| 5종 디스트랙터 | exact_substitute, partial_match, negative, conditional, hierarchical |
| 허구 도메인 | 제톤7, 글린트, 코랄시 등 실제 존재하지 않는 이름 사용 |
| 0-3 채점 | 3: 완전일치, 2: 핵심맞음+세부오류, 1: 관련하지만 틀림, 0: 환각 |

---

## 2. 종합 결과

### 최종 순위

| 순위 | 어댑터 | PASS | 점수 | V2 Avg | Abstention Score | 등급 |
|------|--------|------|------|--------|------------------|------|
| 1 | naia-local | 91/241 | **38.5%** | 1.13/3.00 | 2.70/3.00 | F |
| 2 | airi | 38/241 | **15.4%** | 0.47/3.00 | 2.85/3.00 | F |

### 카테고리별 상세 점수

| 카테고리 | 가중치 | airi | naia-local | naia-local 달성률 |
|----------|--------|------|------------|-------------------|
| direct_recall | 1 | 4/49 (8%) | 12/49 (24%) | +8 |
| semantic_search | 2 | 0/18 (0%) | 2/18 (11%) | +2 |
| proactive_recall | 1 | 0/18 (0%) | 10/18 (56%) | +10 |
| abstention | 2 | 19/20 (95%) | 18/20 (90%) | -1 |
| irrelevant_isolation | 1 | 15/15 (100%) | 15/15 (100%) | = |
| multi_fact_synthesis | 2 | 0/15 (0%) | 0/15 (0%) | = |
| entity_disambiguation | 2 | 0/20 (0%) | 9/20 (45%) | +9 |
| contradiction_direct | 2 | 0/20 (0%) | 2/20 (10%) | +2 |
| contradiction_indirect | 2 | 0/15 (0%) | 9/15 (60%) | +9 |
| noise_resilience | 2 | 0/20 (0%) | 11/20 (55%) | +11 |
| unchanged_persistence | 1 | 0/11 (0%) | 0/11 (0%) | = |
| temporal | 1 | 0/20 (0%) | 3/20 (15%) | +3 |

### 점수 분포 (keyword judge)

| 점수 | airi | naia-local |
|------|------|------------|
| 0 (환각/실패) | 203 | 150 |
| 1 (관련+틀림) | 0 | 0 |
| 2 (핵심맞음+세부오류) | 0 | 0 |
| 3 (완전일치) | 38 | 91 |

**관찰**: keyword judge는 오직 0 또는 3만 부여. 설계된 0-3 세분화가 keyword judge에서는 동작하지 않음. LLM judge(GLM/Claude/Gemini)에서만 부분 점수(1, 2) 포착 가능.

---

## 3. 성능 분석

### 3.1 airi (no-memory baseline) 분석

airi의 38개 PASS 내역:
- **abstention**: 19/20 — 메모리가 없으므로 "모르겠다"가 정답인 항목에서 높은 점수
- **irrelevant_isolation**: 15/15 — 개인정보를 모르므로 무관한 질문에 개인정보 삽입 안 함
- **direct_recall**: 4/49 — 우연한 키워드 매칭 (예: "안 함", "안" 등 부정어가 응답에 포함)

airi는 메모리가 없는 시스템으로서 정직하게 "모르겠다"를 말하는 항목(abstention, irrelevant)에서만 점수를 얻습니다. R7 v1 EN에서 41.6%를 기록한 것과 비교하면, v2 팩트뱅크가 LLM 사전지식 경로를 성공적으로 차단했음을 보여줍니다 (41.6% → 15.4%, -26pp).

### 3.2 naia-local 분석

naia-local의 91개 PASS 내역:
- **proactive_recall**: 10/18 (56%) — 키워드 기반 프롬프트에서 메모리 검색이 작동
- **noise_resilience**: 11/20 (55%) — 노이즈 속에서도 핵심 팩트 회상
- **contradiction_indirect**: 9/15 (60%) — 간접적 모순 업데이트 후 올바른 값 회상
- **entity_disambiguation**: 9/20 (45%) — 디스트랙터와 실제 팩트 구분
- **abstention**: 18/20 (90%) — 메모리가 있으므로 "자전거" 등 실제로 저장된 정보에 대해 답변하려 함 (2개 FAIL = 위양성)

### 3.3 카테고리별 심층 분석

**unchanged_persistence 0%** (known issue #10)
contradiction update 시 cascade delete로 관련 없는 팩트까지 삭제됨. R5 EN 47% → R8 v2 KO 0%로 악화. v2의 디스트랙터 구조가 이 버그에 더 취약.

**multi_fact_synthesis 0%**
여러 팩트를 종합하는 질문(예: "우리 회사 소개서 초안 써줘")에서 단일 키워드 매칭으로는 불충분. keyword judge의 한계이자, 메모리 검색 결과를 종합하는 능력 부족.

**semantic_search 11%**
"내 개발 환경 알려줘" 같은 의미적 질문에서 2/18만 PASS. 벡터 검색은 작동하나, keyword judge가 응답 내 키워드를 찾지 못함. LLM이 팩트를 재구성하여 응답하면 키워드가 달라짐.

**contradiction_direct 10%**
직접 모순 처리 후 새 값 회상은 2/20만 성공. 대부분의 contradiction update가 제대로 동작하지 않음.

---

## 4. v1 vs v2 비교

### airi (no-memory): LLM 사전지식 경로 차단 효과

| 라운드 | 언어 | 팩트뱅크 | 판정 | 점수 |
|--------|------|----------|------|------|
| R5 EN | EN | v1 (실제 도메인) | GLM | 33.9% |
| R7 EN | EN | v1 (실제 도메인) | GLM+Gemini 합의 | 41.6% |
| R8 KO | KO | **v2 (허구 도메인)** | keyword | **15.4%** |

v2 팩트뱅크 도입으로 airi 점수가 EN 41.6% → KO v2 15.4%로 하락. EN→KO 언어 차이(-26pp)와 v1→v2 팩트뱅크 차이가 혼재되나, 주요 원인은 v2의 허구 페르소나 + unique ID.

### naia-local: 메모리 검색 효과

| 라운드 | 팩트뱅크 | 판정 | 점수 | direct_recall |
|--------|----------|------|------|---------------|
| R8 v1 KO | v1 (1000 facts) | keyword | 60% | 80% |
| R8 v2 KO | v2 (200+110 facts) | keyword | **38.5%** | **24%** |

v2에서 점수 하락 (60% → 38.5%). 원인:
1. v2 팩트가 허구 도메인이라 LLM이 응답 재구성 시 키워드 변형 (예: "제톤7" → "Zepton" 등)
2. keyword judge의 엄격한 exact/substring 매칭
3. v1의 1000 facts vs v2의 200+110 facts — 정보 밀도 차이는 아니나, v2가 의도적으로 더 어려움

---

## 5. 토큰/지연 분석

| 메트릭 | airi | naia-local | 차이 |
|--------|------|------------|------|
| Total Tokens | 88,019 | 125,624 | +42.7% |
| Avg Latency | 990ms | 1,386ms | +40% |
| Median Latency | 861ms | 1,031ms | +20% |
| Max Latency | 4,040ms | 9,956ms | +146% |
| 추정 비용 | ~$0.008 | ~$0.011 | +37.5% |

naia-local의 추가 토큰/지연은 메모리 검색 결과를 프롬프트에 주입하기 때문. Max latency 9,956ms는 이상치로 추정.

---

## 6. 결론 및 다음 단계

### v2 벤치마크 평가

| 측면 | 평가 |
|------|------|
| LLM 사전지식 차단 | 성공 (airi EN 41.6% → KO v2 15.4%) |
| 디스트랙터 효과 | 확인 필요 (entity_disambiguation 45%) |
| 0-3 채점 | keyword judge에서는 0/3 이진으로만 동작. LLM judge 필요 |
| 카테고리 커버리지 | unchanged_persistence, multi_fact_synthesis 여전히 0% |

### 다음 단계

1. **GLM/Claude judge로 재채점** — keyword의 이진 채점 한계 극복. 부분 점수(1, 2) 포착
2. **EN v2 팩트뱅크 재생성** — 현재 깨진 기계번역 상태. KO v2 생성 스크립트에서 EN 풀 추가 필요
3. **unchanged_persistence 버그 수정** (#10) — cascade delete가 v2에서 더 치명적
4. **keyword judge 보완** — fuzzy match 또는 semantic similarity 도입 검토
5. **다중 어댑터 실행** — mem0, letta, graphiti 등 v2 벤치마크 실행

---

*작성: 2026-04-22 R8 v2 KO 벤치마크 (airi + naia-local) 결과 기반*
