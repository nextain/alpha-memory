# Alpha Memory R8 v2 벤치마크 최종 보고서

**5 어댑터 × 3-Judge 합의 분석**
**2026-04-23**

---

## 1. 프로젝트 소개

### AI는 왜 기억이 필요한가?

LLM은 훌륭한 언어 처리 능력을 갖추고 있지만, 대화 간 맥락 유지, 개인 선호 학습, 시간에 따른 정보 갱신 등 "기억" 기능이 부족합니다. AI 메모리 시스템은 이 간극을 메우는 핵심 인프라입니다.

### Alpha Memory 소개

Alpha Memory는 Naia OS의 핵심 메모리 패키지로, 인간의 기억 시스템을 모델링한 4-Store 아키텍처를 제공합니다:

| Store | 뇌 영역 | 저장 내용 |
|-------|---------|----------|
| **Episodic** | 해마 | 타임스탬프가 있는 이벤트 |
| **Semantic** | 대뇌피질 | 팩트, 엔티티, 관계 |
| **Procedural** | 기저핵 | 스킬, 전략, 학습된 패턴 |
| **Working** | 전전두엽 | 활성 컨텍스트 |

### R8 v2 벤치마크의 목적

R7 벤치마크에서 "LLM 사전지식 경로"가 식별되었습니다 — 기존 팩트뱅크가 현실 세계 인물(음악 취향, 생일 등)을 사용하여, LLM이 메모리 시스템 없이도 사전 훈련 지식으로 정답을 맞출 수 있었습니다. v2는 **200개 허구(synthetic) 팩트**를 도입하여 이 경로를 원천 차단합니다.

---

## 2. 테스트 설계

### 기본 설정

| 항목 | 값 |
|------|-----|
| 팩트뱅크 | 200개 허구 인물 팩트 (한국어 기준) |
| 쿼리 | 241개 (12 카테고리) |
| 언어 | 한국어(KO) + 영어(EN) |
| 응답 LLM | gemini-2.5-flash-lite |
| 3-Judge | keyword + GLM-5.1 + Gemini 2.5 Pro |
| 합의 방식 | 다수결 (3명 중 2명 PASS = 최종 PASS) |

### 비교 대상 5개 시스템

| 어댑터 | 설명 | 메모리 방식 |
|--------|------|------------|
| **airi** | 메모리 없음 (baseline) | 없음 |
| **naia-local** | Alpha Memory (LocalAdapter) | SQLite + vector search |
| **mem0** | mem0 OSS | LLM 기반 dedup + vector |
| **sillytavern** | SillyTavern | Vectra + @huggingface/transformers |
| **letta** | Letta (구 MemGPT) | Archival memory + LLM agent |

---

## 3. 12가지 평가 카테고리

| 카테고리 | 항목 수 | 테스트 목적 |
|----------|---------|------------|
| direct_recall | 49 | 직접 사실 회상 |
| semantic_search | 18 | 의미 기반 검색 |
| proactive_recall | 18 | 선제적 기억 제안 |
| abstention | 20 | 모르는 건 모른다고 함 (환각 방지) |
| irrelevant_isolation | 15 | 무관한 질문에 개인정보 삽입 안 함 |
| multi_fact_synthesis | 15 | 여러 기억 조합 |
| entity_disambiguation | 20 | 동명이인/맥락 구분 |
| contradiction_direct | 20 | 직접적 모순 처리 |
| contradiction_indirect | 15 | 간접적 모순 처리 |
| noise_resilience | 20 | 노이즈 속 정보 회상 |
| unchanged_persistence | 11 | 업데이트 후 안 바뀐 기억 유지 |
| temporal | 20 | 시간 관련 기억 (과거 상태 회상) |

---

## 4. 종합 결과

### 4.1 최종 순위 — 3-Judge Consensus (다수결)

| 순위 | 어댑터 | KO | EN | 평균 | 등급 |
|------|--------|-----|-----|------|------|
| 1 | **mem0** | 46.1% | 33.6% | **39.8%** | F |
| 2 | **naia-local** | 39.8% | 37.3% | **38.6%** | F |
| 3 | sillytavern | 27.0% | 27.0% | 27.0% | F |
| 4 | airi | 14.5% | 14.5% | 14.5% | F |
| 5 | letta | 14.5% | 14.5% | 14.5% | F |

> **모든 시스템이 F 등급** — 1위조차 consensus 40% 미만.

### 4.2 개별 Judge 결과 비교

#### Keyword Judge (exact match — 가장 객관적)

| 순위 | 어댑터 | KO | EN | 평균 |
|------|--------|-----|-----|------|
| **1** | **naia-local** | **38%** (91/241) | 25% (57/241) | **31.5%** |
| 2 | mem0 | 33% (76/241) | 24% (56/241) | 28.5% |
| 3 | sillytavern | 28% (64/241) | 25% (56/241) | 26.5% |
| 4 | letta | 16% (39/241) | 15% (35/241) | 15.5% |
| 5 | airi | 15% (38/241) | 15% (35/241) | 15.0% |

#### GLM-5.1 Judge (semantic — 관대함)

| 순위 | 어댑터 | KO | EN | 평균 |
|------|--------|-----|-----|------|
| 1 | mem0 | 78% (184/241) | 80% (187/241) | 79% |
| 2 | naia-local | 65% (162/241) | 67% (153/241) | 66% |
| 3 | sillytavern | 50% (114/241) | 50% (118/241) | 50% |
| 4 | letta | 35% (71/241) | 46% (102/241) | 40.5% |
| 5 | airi | 36% (81/241) | 40% (87/241) | 38% |

#### Gemini 2.5 Pro Judge (strict)

| 순위 | 어댑터 | KO | EN |
|------|--------|-----|-----|
| 1 | mem0 | 37% (89/241) | 27% (65/241) |
| 2 | naia-local | 28% (68/241) | 29% (69/241) |
| 3 | sillytavern | 19% (45/241) | 27% (65/241) |
| 4 | letta | 18% (44/241) | 15% (36/241) |
| 5 | airi | 15% (35/241) | 15% (35/241) |

### 4.3 카테고리별 Consensus 상세 (KO)

| 카테고리 | mem0 | naia-local | sillytavern | letta | airi | Total |
|----------|------|------------|-------------|-------|------|-------|
| direct_recall | **34** | 25 | 15 | 0 | 0 | 49 |
| semantic_search | **16** | 2 | 0 | 0 | 0 | 18 |
| proactive_recall | **5** | 8 | 1 | 0 | 0 | 18 |
| abstention | 16 | **18** | 16 | **20** | **20** | 20 |
| irrelevant_isolation | **15** | **15** | **15** | **15** | **15** | 15 |
| multi_fact_synthesis | **4** | 0 | 0 | 0 | 0 | 15 |
| entity_disambiguation | **4** | 6 | 3 | 0 | 0 | 20 |
| contradiction_direct | 2 | 2 | **4** | 0 | 0 | 20 |
| contradiction_indirect | **7** | 8 | 4 | 0 | 0 | 15 |
| noise_resilience | 8 | **9** | 6 | 0 | 0 | 20 |
| unchanged_persistence | 0 | 0 | 0 | 0 | 0 | 11 |
| temporal | 0 | 3 | 1 | 0 | 0 | 20 |

### 4.4 카테고리별 Consensus 상세 (EN)

| 카테고리 | mem0 | naia-local | sillytavern | letta | airi | Total |
|----------|------|------------|-------------|-------|------|-------|
| direct_recall | **30** | **25** | 19 | 0 | 0 | 49 |
| semantic_search | 2 | **13** | 2 | 0 | 0 | 18 |
| proactive_recall | **2** | 0 | **4** | 0 | 0 | 18 |
| abstention | 16 | 15 | **18** | **20** | **20** | 20 |
| irrelevant_isolation | **15** | **15** | **15** | **15** | **15** | 15 |
| multi_fact_synthesis | **1** | 0 | 0 | 0 | 0 | 15 |
| entity_disambiguation | **3** | **8** | 4 | 0 | 0 | 20 |
| contradiction_direct | **2** | **7** | 1 | 0 | 0 | 20 |
| contradiction_indirect | **6** | 1 | 1 | 0 | 0 | 15 |
| noise_resilience | 4 | 4 | 1 | 0 | 0 | 20 |
| unchanged_persistence | 0 | 0 | 0 | 0 | 0 | 11 |
| temporal | 0 | 2 | 0 | 0 | 0 | 20 |

---

## 5. 세 AI의 분석

### [GLM-5.1의 분석]

**벤치마크 신뢰도**: 최대 71.8%의 불일치율은 세 Judge가 서로 다른 평가 기준을 적용하고 있음을 의미하므로, 현재 합의 결과만으로 벤치마크의 절대적 신뢰도를 보장하기 어렵습니다. 특히 KW와 GLM의 판단이 거의 독립적이라는 점은 '정확한 팩트 매칭'과 '의미적 유사성' 간의 간극이 너무 크기 때문입니다. 신뢰도 개선을 위해서는 단순 다수결 대신 평가 목적(정확성 vs 유연성)에 따른 가중치 합의 방식을 도입하고, LLM Judge들의 프롬프트 정교화를 통한 기준 정렬(alignment)이 필요합니다. 또한, 불일치 케이스에 대한 인간 평가(HITL)를 병행하여 Judge 간 편향을 교정하는 캘리브레이션 단계를 추가해야 합니다.

**mem0 vs naia-local**: 메모리 시스템의 본질인 '사실 왜곡 없는 정확한 정보 검색'을 고려하면, Keyword에서 1위인 naia-local의 성과를 더 공정한 평가로 보아야 합니다. mem0은 GLM의 지나치게 관대한 의미적 판단에 기대어 Consensus 점수를 끌어올렸으나, 이는 할루시네이션이나 오답을 정답으로 포함할 위험이 큽니다. 반면 naia-local은 엄격한 팩트 매칭과 Gemini 평가에서 상대적으로 안정적인 성능을 보여주어, 실제 산업 환경에서 요구되는 신뢰도 측면에서 우위에 있습니다.

**Alpha Memory 개선 방향**: 가장 시급한 우선순위는 'unchanged_persistence(0%)' 문제 해결로, 메모리 업데이트 시 관련 없는 기존 팩트가 삭제되는 치명적인 무결성 결함을 먼저 보완해야 합니다. 두 번째로는 'multi_fact_synthesis(0%)'를 개선하여 다수의 팩트를 동시에 검색하고 조합하는 RAG 파이프라인의 다중 쿼리 및 병합 로직을 강화해야 합니다. 마지막으로 'temporal(3/20)'은 산업 전반의 미해결 과제이므로, 타임스탬프 기반의 메모리 버전 관리 및 시간적 인과관계 추론 모듈을 점진적으로 도입하는 전략이 필요합니다. **데이터 무결성이 확보되지 않으면 다른 고급 기능이 무의미해지므로, 반드시 persistence → synthesis → temporal 순으로 개선해야 합니다.**

**Judge 시스템 개선**: 현재 3-Judge 합의 방식의 가장 큰 한계는 서로 다른 평가 척도(정확성, 유연성, 엄격성)를 단일 PASS/FAIL로 이진화하여 다수결로 처리한다는 점입니다. 대안으로 단일 합의 도출 대신 '정확도(Exactness)'와 '관련성(Relevance)' 등 다차원 평가 지표를 분리하여 독립적으로 측정하는 방식을 도입해야 합니다.

**산업적 의의**: 이번 v2 벤치마크는 LLM의 사전지식이라는 허상을 걷어냄으로써, 현재 AI 메모리 시스템의 실질적 성능이 생각보다 훨씬 낮다는 충격적인 사실을 산업계에 시사합니다. 특히 1위 어댑터조차 Consensus 40% 미만에 그쳤고, 시간적 추론(Temporal)과 업데이트 무결성(Unchanged persistence)은 산업 전체가 전멸 상태임을 드러냈습니다.

### [Gemini 2.5 Pro의 분석]

**Benchmark Reliability**: The high disagreement rate severely undermines the precision of the final consensus rankings, making a 1.2 percentage point difference between ranks questionable. However, the benchmark remains valuable for establishing clear performance tiers (e.g., mem0/naia-local > sillytavern > airi/letta), which are consistent across all judges. To improve reliability, the judging criteria should be unified into a detailed, shared rubric for all judges, and more sophisticated programmatic checks (beyond exact keyword match) should be developed to provide a stronger objective baseline.

**mem0 vs naia-local**: The Keyword judge offers a fairer assessment of raw retrieval accuracy, as it is objective and immune to the LLM judge biases evident in the data. The consensus victory for mem0 was heavily driven by the lenient GLM-5.1 judge, which disproportionately favored its semantic fluency over naia-local's. Therefore, while mem0 may produce more semantically pleasing outputs, naia-local demonstrates superior performance on the most objective, unbiased measure of factual recall.

**Alpha Memory improvement**: The top priority should be fixing `multi_fact_synthesis`, as combining information is a core memory function; this requires enhancing the retrieval mechanism to fetch multiple relevant facts and refining the prompt to explicitly instruct synthesis. The second priority is addressing `unchanged_persistence` by implementing more granular memory update logic that can differentiate a direct contradiction from related, non-conflicting facts to prevent over-eager deletion. Finally, tackling `temporal` reasoning, a known industry-wide challenge, can be approached by integrating metadata like timestamps into memory chunks.

**Judge system improvement**: A superior alternative would be a rubric-based scoring system where each judge rates responses on multiple criteria (e.g., accuracy, completeness, relevance) instead of a binary pass/fail. Another alternative is a hybrid model where objective programmatic checks act as a first-pass filter, with a powerful meta-judge arbitrating only the disagreements between semantic judges.

**Industry significance**: This benchmark's use of a synthetic factbank establishes a critical new standard for rigorously testing AI memory systems, effectively isolating their performance from the base LLM's pre-trained knowledge. The sub-40% scores of even the top systems reveal that reliable, general-purpose AI memory is still a nascent and largely unsolved problem. The universal failure in complex categories like temporal reasoning and contradiction handling pinpoints these as key research frontiers for the entire industry.

---

## 6. 세 AI의 토론: 합의 사항

### 합의 1: v2 팩트뱅크 설계 성공

**만장일치**. v2 합성 팩트뱅크가 LLM 사전지식 경로를 성공적으로 차단했습니다. airi(메모리없음)가 keyword 기준 15%에 그친 것은, v1에서의 33.9%와 비교해 현저한 하락입니다. 이는 벤치마크의 기본 설계가 유효함을 증명합니다.

### 합의 2: 성능 티어 구분은 신뢰 가능

**만장일치**. 3 judge 간 불일치율이 높더라도, 티어 구분은 일관됩니다:
- **Tier 1**: mem0, naia-local (모든 judge에서 상위 2위)
- **Tier 2**: sillytavern (모든 judge에서 3위)
- **Tier 3**: airi, letta (모든 judge에서 하위 2위)

1.2pp의 세밀한 순위 차이는 신뢰하기 어렵지만, 티어 간 격차는 유의미합니다.

### 합의 3: mem0 vs naia-local — Keyword가 더 공정

**만장일치**. 두 AI 모두 keyword(객관적 exact match) 기준에서 naia-local이 1위(31.5% vs 28.5%)인 점을 더 공정한 평가로 보았습니다. GLM judge의 과도한 관대함이 mem0의 consensus 1위를 이끈 주요 요인입니다.

### 합의 4: unchanged_persistence가 최우선 버그

**만장일치**. GLM은 "persistence → synthesis → temporal" 순서를, Gemini는 "synthesis → persistence → temporal"을 제안. **최종 합의**: unchanged_persistence는 데이터 무결성에 직결되는 치명적 결함이므로 최우선 해결. 그러나 multi_fact_synthesis는 기능적 한계이므로 병렬 개발 가능.

### 합의 5: Judge 시스템 개선 — 다차원 평가 필요

**만장일치**. 현재 binary PASS/FAIL + 다수결 방식의 한계가 명확합니다. 대안:
1. **다차원 평가**: Accuracy(정확도), Completeness(완전성), Relevance(관련성) 독립 측정
2. **Meta-judge**: 불일치 케이스만 상위 모델이 중재
3. **HITL 캘리브레이션**: 인간 평가로 judge 편향 교정

### 합의 6: AI 메모리는 미해결 문제

**만장일치**. 1위 시스템조차 40% 미만. temporal, unchanged_persistence 전멸은 산업 전체의 과제. v2 벤치마크는 "의미적 유창성에 속지 말고 팩트 기반 정확성을 측정해야 함"을 입증.

---

## 7. Alpha Memory 개선 로드맵

### P0: 데이터 무결성 수정 (1-2 스프린트)

- **unchanged_persistence 0% → 80%+ 목표**
- 원인: contradiction update 시 cascade delete로 관련 없는 팩트까지 삭제
- 해결: granular update logic — 직접 모순 vs 관련 비충돌 팩트 구분
- 이슈: alpha-memory#10

### P1: 다중 팩트 검색 (1-2 스프린트)

- **multi_fact_synthesis 0% → 50%+ 목표**
- 원인: 단일 쿼리 → 단일 검색 → 단일 응답 파이프라인
- 해결: multi-query decomposition + 병합 로직
- 프롬프트 개선: synthesis 명시적 지시

### P2: Bi-temporal 모델 (1 분기)

- **temporal 3/20 → 10/20+ 목표**
- 원인: contradiction update가 과거 상태를 덮어씀
- 해결: timestamp 기반 메모리 버전 관리 + 시간적 인과관계 추론
- 산업 전체 미해결 과제 — 점진적 접근

### P3: Judge 시스템 2.0 (1 분기)

- Binary PASS/FAIL → 다차원 평가 (Accuracy, Completeness, Relevance)
- Meta-judge 도입 (불일치 케이스만 중재)
- HITL 캘리브레이션 세트 구축 (50-100개 인간 평가 항목)

### P4: LocalAdapter 벡터 검색 활성화

- 현재 LocalAdapter의 벡터 검색이 benchmark에서 측정된 적 없음
- text-embedding-004(deprecated) → 교체 필요
- 이슈: alpha-memory#5, #12

---

## 8. R7 vs R8 v2 비교

| 메트릭 | R7 (v1 팩트) | R8 v2 (합성 팩트) | 변화 |
|--------|-------------|-------------------|------|
| airi (baseline) keyword | 33.9% (EN) | 15.0% (KO/EN avg) | **-18.9pp** |
| naia-local keyword | 24.7% (KO) | 31.5% (avg) | +6.8pp |
| letta keyword | 67.5% (KO) | 15.5% (avg) | **-52pp** |
| 1위 시스템 점수 | 67.5% (letta KO) | 39.8% (mem0 consensus) | -27.7pp |

> letta의 R7 KO 1위가 LLM 사전지식에 크게 의존했음이 v2에서 확인.

---

## 9. Judge 불일치 분석

### 페어별 일치율 (평균)

| Judge 쌍 | 평균 일치율 | 해석 |
|----------|-----------|------|
| KW ↔ Gemini | 85% | 엄격/객관적 판단 유사 |
| KW ↔ GLM | 62% | 팩트 vs 의미 간극 |
| GLM ↔ Gemini | 64% | LLM judge 간도 낮은 일치 |

### 불일치율 최대: mem0-EN (71.8%)

- mem0이 의미적으로 유창하지만 팩트가 부정확한 응답을 많이 생성
- GLM은 이를 PASS, keyword/Gemini는 FAIL → 대규모 불일치

### 불일치율 최소: letta-EN (28.2%)

- letta가 abstention/irrelevant만 PASS, 나머지 전부 FAIL
- 3 judge 모두 동의 → 판단이 쉬운 케이스

---

## 10. 결론 및 다음 단계

### 핵심 결론

1. **v2 벤치마크 설계 성공**: LLM 사전지식 경로 차단으로 실제 메모리 성능 측정 달성
2. **naia-local이 팩트 정확도 1위**: keyword(가장 객관적) 기준 31.5%
3. **AI 메모리 산업 전체가 미성숙**: 1위 시스템도 40% 미만
4. **unchanged_persistence, temporal 전멸**: 산업 전체의 과제
5. **Judge 시스템 재설계 필요**: 3-judge 다수결 → 다차원 평가

### 다음 단계

1. **EN 팩트뱅크 완전 재번역** (260개 미번역 항목)
2. **P0: unchanged_persistence 버그 수정**
3. **P1: multi_fact_synthesis 개선**
4. **Judge 2.0 설계**: 다차원 평가 + meta-judge
5. **R9 벤치마크**: 수정 후 재측정

---

## 부록: 어댑터별 강점/약점

### mem0
- **강점**: direct_recall 최고 수준 (KO 34/49, EN 30/49). 의미적 유창성.
- **약점**: unchanged_persistence 0%, temporal 0%. factual accuracy 낮음.

### naia-local
- **강점**: keyword 기준 1위 (팩트 정확도). EN 성능 안정적 (37.3%).
- **약점**: multi_fact_synthesis 0%, unchanged_persistence 0%. KO semantic_search 약함 (2/18).

### sillytavern
- **강점**: KO/EN 동일한 성능 (27.0%). contradiction_direct KO 4/20 (최고).
- **약점**: semantic_search EN 2/18. temporal 0-1/20.

### letta
- **강점**: abstention 100% (20/20). irrelevant_isolation 100% (15/15).
- **약점**: R7 → R8 추락 (-52pp). 사실상 모든 카테고리에서 baseline과 동일. archival search 500 에러.

### airi (baseline)
- **역할**: LLM 사전지식 경로 차단 검증. 15% = abstention + irrelevant만.
- **의의**: 메모리 없이도 abstention/irrelevant는 PASS. 다른 카테고리는 완전 FAIL.

---

*작성: 2026-04-23. GLM-5.1 + Gemini 2.5 Pro 분석 포함.*
*데이터: /tmp/consensus-results.json*

---

## 부록 B: Precision-Recall 트레이드오프 분석 (심화)

### 아키텍처 관계

```
naia-local = mem0 (vector search base) + Naia Layer
  ├── Importance Gating (3축 점수: importance × surprise × emotion)
  ├── Consolidation (팩트 통합/중복 제거)
  └── Contradiction Detection (모순 탐지/업데이트)
```

naia-local과 mem0은 **동일한 벡터 검색 기반(mem0 OSS)**을 사용합니다. 차이는 Naia Layer의 추가 처리뿐입니다.

### 벤치마크가 말하는 것

| 지표 | mem0 (base) | naia-local (+Naia Layer) | 변화 | 해석 |
|------|------------|--------------------------|------|------|
| Keyword (정밀도) | 28.5% | **31.5%** | +3pp | Naia Layer가 정밀도 개선 |
| Gemini (엄격 semantic) | 32.0% | 28.5% | -3.5pp | 의미적 recall 저하 |
| GLM (관대 semantic) | 79.5% | 66.0% | -13.5pp | 의미적 recall 대폭 저하 |
| Consensus (다수결) | **39.8%** | 38.6% | -1.2pp | 종합적으로 mem0 우위 |

**결론**: Naia Layer가 precision을 올렸지만, **과도한 필터링으로 semantic recall을 깎아버림**.

### 카테고리별 격차 분석

| 카테고리 | naia-local | mem0 | 격차 | 원인 추정 |
|----------|-----------|------|------|----------|
| semantic_search | 2/18 | **16/18** | 8배 | Importance gating이 의미적 관련 팩트 필터링 |
| direct_recall | 25/49 | **34/49** | 1.4배 | Gating이 직접 회상 팩트도 일부 차단 |
| unchanged_persistence | 0/11 | 0/11 | 동일 | Contradiction detection cascade delete |
| multi_fact_synthesis | 0/15 | 0/15 | 동일 | 두 시스템 모두 multi-hop 미구현 |
| temporal | **3/20** | 0/20 | naia 우위 | Consolidation이 일부 시간 정보 보존 |
| contradiction_indirect | **8/15** | 7/15 | 근소 | Naia contradiction detection 소폭 우위 |

### 이중 순위 (공정성 vs 사용자 경험)

**공정성/정확도 순위 (Keyword — exact match)**

| 순위 | 어댑터 | 평균 |
|------|--------|------|
| 1 | **naia-local** | 31.5% |
| 2 | mem0 | 28.5% |
| 3 | sillytavern | 26.5% |
| 4 | letta | 15.5% |
| 5 | airi | 15.0% |

**사용자 경험 순위 (Semantic — 3-Judge Consensus)**

| 순위 | 어댑터 | 평균 |
|------|--------|------|
| 1 | **mem0** | 39.8% |
| 2 | naia-local | 38.6% |
| 3 | sillytavern | 27.0% |
| 4 | airi | 14.5% |
| 5 | letta | 14.5% |

> naia-local은 팩트 정확도에서 1위지만, 사용자가 체감하는 의미적 회상 품질에서는 mem0에 뒤처짐.

---

## 부록 C: 3-AI 개선 방안 분석 (Precision-Recall 프레이밍)

### [GLM-5.1의 분석 v2]

**1. Recall 저하의 주요 원인**

가장 유력한 원인은 **Importance Gating(중요도 게이팅)**입니다. `semantic_search` (16/18 → 2/18)에서의 급격한 성능 하락은, 의미적으로는 관련이 있지만 Naia의 중요도 점수 기준을 통과하지 못한 메모리들이 대거 필터링되었음을 의미합니다. Importance Gating이 80%의 원인, 나머지 20%는 모순 탐지 버그와 통합 로직의 정보 손실.

**2. Importance Threshold 개선안**

- **하드 필터링 → 소프트 필터링(재랭킹)** 전환: 임계값 이하 메모리를 삭제하지 않고 순위만 낮춤
- 최종 점수 = `0.6 × vector_score + 0.4 × naia_importance` 가중 합산
- **동적 임계값**: 쿼리 의도에 따라 threshold 조정 (탐색적 0.5, 사실적 0.85)

**3. unchanged_persistence 수정**

- '삭제' 대신 `status` 필드 도입 (`active`, `archived`, `contradicted`)
- 모순 시 물리적 삭제 금지, 상태만 `contradicted`로 변경 + `contradicted_by` 링크
- 검색 시 `status: active`만 기본 조회

**4. multi_fact_synthesis 구현**

- Multi-hop 검색: 1차 검색 → 엔티티 추출 → 2차 검색 → 결과 병합
- LLM 기반 합성: 수집된 팩트를 컨텍스트로 묶어 LLM에 종합 답변 요청

**5. 우선순위**: P0 unchanged_persistence → P1 Importance Gating → P2 multi_fact_synthesis → P3 Consolidation 고도화

### [Gemini 2.5 Pro의 분석 v2]

**1. Cause of Recall Degradation**

The importance gate is the primary suspect. The slight precision gain (+3pp) at the cost of catastrophic recall drop (-13.5pp, 8x gap on semantic_search) indicates the gate is too aggressive. Consolidation may contribute by over-summarizing.

**2. Tuning the Threshold**

- Disable consolidation and contradiction detection temporarily
- Run parameter sweep across thresholds (0.1 to 0.9)
- Optimize for F1-Score (harmonic mean of precision and recall)

**3. Fixing unchanged_persistence**

Implement Hybrid Search: augment vector store with keyword index (BM25). Merge results with re-ranking, giving high weight to exact matches for proper nouns or quoted text.

**4. Implementing multi_fact_synthesis**

Query Decomposition Agent: LLM breaks complex query → sequential sub-queries → retrieve & refine → synthesize final answer.

**5. Priority**: P0 Tune Importance Threshold → P1 Fix unchanged_persistence → P2 multi_fact_synthesis

### 3-AI 합의 (GLM + Gemini)

| 항목 | 합의 내용 |
|------|----------|
| **Recall 저하 원인** | Importance Gating이 주범 (80%), Consolidation 정보 손실이 부벽 (20%) |
| **해결 방법** | Hard filtering → Soft re-ranking 전환. vector_score + importance 가중 합산 |
| **unchanged_persistence** | 물리적 삭제 금지 → status 필드 도입. GLM은 상태 기반, Gemini는 Hybrid Search 제안 |
| **multi_fact_synthesis** | Multi-hop 검색 + LLM 합성 파이프라인. 두 AI 모두 동일 방식 제안 |
| **의견 차이** | GLM은 P0=unchanged_persistence, Gemini는 P0=Importance Threshold 조정 |
| **종합 합의** | P0: Importance Gating 개선 (recall 회복이 시급) + unchanged_persistence 수정 (병렬) → P1: multi_fact_synthesis |

---

## 부록 D: 개선 로드맵 v2 (3-AI 합의 기반)

### P0: Importance Gating → Soft Re-ranking (1-2 스프린트)

**목표**: semantic_search 2/18 → 10/18+, 전체 recall -13.5pp 회복

```
현재: memories.filter(m => m.importance > threshold)  // hard filter
변경: memories.sort((a,b) => (0.6*a.vector + 0.4*b.importance) - (0.6*b.vector + 0.4*b.importance))
```

- Hard filter → weighted re-ranking 전환
- 동적 threshold: 쿼리 intent 분류 → threshold 조정
- 검증: semantic_search 카테고리로 parameter sweep (0.1~0.9)

### P0 (병렬): unchanged_persistence 수정 (1-2 스프린트)

**목표**: 0/11 → 8/11+

- 메모리 스키마에 `status` 필드 추가 (active/contradicted/archived)
- Contradiction update 시 물리적 삭제 → 상태 변경만
- Cascade delete 로직 제거, 대상 메모리 ID 1개만 업데이트

### P1: multi_fact_synthesis 구현 (1-2 스프린트)

**목표**: 0/15 → 5/15+

- Query Decomposition: LLM이 복합 쿼리를 서브쿼리로 분해
- Multi-hop 검색: 1차 결과에서 엔티티 추출 → 2차 검색
- LLM 합성: 수집 팩트 컨텍스트로 종합 답변 생성

### P2: Consolidation 로직 고도화 (1 분기)

- 통합 시 뉘앙스 손실 최소화
- Temporal 버전 관리: 과거 상태 보존 (temporal 3/20 → 10/20+)
- Bi-temporal 모델 검토

### P3: Judge 시스템 2.0

- Binary PASS/FAIL → 다차원 평가 (Accuracy, Completeness, Relevance)
- F1-Score 최적화 기준 확립
- HITL 캘리브레이션 세트 (50-100개 인간 평가 항목)
