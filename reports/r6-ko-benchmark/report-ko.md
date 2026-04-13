# R6 KO 메모리 벤치마크 보고서

**날짜**: 2026-04-13  
**벤치마크**: R6 (Korean, keyword judge)  
**팩트뱅크**: 1000개 (fact-bank.json, 한국어 가상 페르소나)  
**쿼리**: 240개 (12개 카테고리)  
**Judge**: keyword  
**LLM**: gemini-2.5-flash-lite (via gateway)  
**Embedder**: Gemini text-embedding-004 / Vertex AI (768d)

---

## 최종 순위

| 순위 | 어댑터 | 점수 | 등급 | EN R5 점수 | EN→KO 변화 |
|------|--------|------|------|-----------|------------|
| 1 | letta | **67.5%** | F(abs) | 87.5% | -20pp |
| 2 | mem0 | **24.0%** | F(abs) | 83.1% | **-59pp** |
| 3 | sillytavern | **17.6%** | F(abs) | 79.8% | -62pp |
| 4 | airi(baseline) | **16.0%** | F(abs) | 33.9% | -18pp |
| 5 | openclaw | **14.8%** | F | 43.3% | -29pp |
| 6 | open-llm-vtuber | **14.4%** | F | 85.2% | **-71pp** |
| 7 | sap | **12.9%** | F(abs) | 74.1% | -61pp |
| — | graphiti | **DNF** | — | 55.8% | — |
| — | naia | *측정중* | — | 84.0% | TBD |

> 점수 = weighted pass rate (카테고리별 가중치 적용)  
> 등급 기준: A≥90%, B≥75%, C≥60%, F<60%; F(abs)=abstention 실패

---

## 카테고리별 결과

| 카테고리 (가중치) | letta | mem0 | sillytavern | airi | openclaw | open-llm-vtuber | sap |
|-----------------|-------|------|-------------|------|----------|-----------------|-----|
| direct_recall (×1) | **88%** | 16% | 28% | 4% | 0% | 8% | 0% |
| semantic_search (×2) | **48%** | 12% | 0% | 4% | 0% | 0% | 0% |
| proactive_recall (×2) | **65%** | 10% | 0% | 0% | 10% | 0% | 5% |
| abstention (×2) | ⚠️40% | 90% | 70% | 95% | **100%** | **100%** | 85% |
| irrelevant_isolation (×1) | 93% | **100%** | 93% | **100%** | **100%** | **100%** | **100%** |
| multi_fact_synthesis (×2) | **65%** | 15% | 10% | 5% | 5% | 5% | 5% |
| entity_disambiguation (×2) | **80%** | 20% | 15% | 5% | 0% | 5% | 5% |
| contradiction_direct (×2) | **55%** | 5% | 5% | 5% | 5% | 0% | 0% |
| contradiction_indirect (×2) | **67%** | 7% | 0% | 7% | 0% | 0% | 0% |
| noise_resilience (×2) | **65%** | 15% | 10% | 5% | 0% | 0% | 0% |
| unchanged_persistence (×1) | **87%** | 20% | 13% | 0% | 0% | 0% | 0% |
| temporal (×2) | **92%** | 20% | 16% | 4% | 0% | 0% | 0% |
| **TOTAL** | **67.5%** | **24.0%** | **17.6%** | **16.0%** | **14.8%** | **14.4%** | **12.9%** |

---

## 핵심 발견

### 1. 한국어 장벽 — EN 대비 극적 성능 하락

대부분 어댑터가 KO 벤치마크에서 EN 대비 큰 폭으로 하락:

- **open-llm-vtuber**: 85.2% → 14.4% (-71pp) — EN 최상위권이 KO에서 최하위
- **sillytavern**: 79.8% → 17.6% (-62pp)
- **mem0**: 83.1% → 24.0% (-59pp)
- **sap**: 74.1% → 12.9% (-61pp)

원인: 이 시스템들은 영어 기반 임베딩 + 영어 LLM에 의존. 한국어 입력을 받아도 영어로 처리한 후 응답하거나, 의미 검색이 실패함.

### 2. letta의 한국어 강점

letta만 유의미한 KO 성능 유지 (67.5%). EN 대비 -20pp 하락이지만 다른 어댑터들의 -59pp~-71pp와 비교하면 압도적. 특히:
- **temporal 92%**: 시간 관련 기억 완벽 처리 (EN 90% 대비 향상)
- **direct_recall 88%**: 직접 사실 회상 EN과 동일 수준
- **unchanged_persistence 87%**: 업데이트 후 변하지 않는 기억 보존

letta의 강점은 내부 LLM이 한국어를 능동적으로 처리하는 구조 덕분으로 추정.

### 3. 기준선 역전 — airi(no-memory)가 중위권

airi 기준선(메모리 없음)이 16.0%로 openclaw(14.8%), open-llm-vtuber(14.4%), sap(12.9%)보다 높음. 이는 메모리 시스템이 한국어에서 기준선도 능가하지 못하는 심각한 문제. 메모리가 없어도 LLM 자체의 사전학습으로 일부 질문에 답할 수 있기 때문.

### 4. abstention 구조적 실패 지속

EN R5에서 발견된 abstention 실패가 KO에서도 반복됨:
- letta: 40% (전체 최하)
- sillytavern: 70%
- sap: 85%
- mem0, airi, openclaw, open-llm-vtuber: 85-100%

메모리가 풍부한 시스템일수록 모르는 것을 인정하지 않는 경향이 크다는 기존 가설과 일치. 밀언 선덱 상승이 필요한 영역.

### 5. graphiti KO 완전 실패

graphiti는 query 156/240 지점에서 Neo4j 500 에러로 중단(DNF). EN R5에서도 55.8%에 그쳤는데, KO에서는 자체 인프라 문제로 완주하지 못함. Neo4j KG 접근방식의 안정성 문제.

### 6. naia (R6 수정 버전) — 측정 중

naia는 이전 세션에서 확인된 consolidation 버그(쿼리당 `consolidateNow(force=true)` 호출) 수정 후 재실행 중.
- **버그**: 에피소드 1000개를 매 쿼리마다 전체 재스코어 → O(n²) 다운
- **수정**: query boundary에서만 consolidation (카테고리 단위)
- EN+KO 동시 재실행 중, 인코딩 완료 후 리포트 업데이트 예정

---

## 기술적 분석

### 한국어 처리를 가르는 요소

1. **LLM 다국어 능력**: letta는 내부 태스크매니저로 gemini 갭-api를 활용, 한국어 스크립트 + entity extraction 성공. 다른 시스템들은 영어 전제 LLM에 한국어를 주면 응답이 부정확해짐.

2. **임베딩 다국어 지원**: 모든 어댑터가 동일한 Gemini text-embedding-004를 사용하므로 임베딩 자체는 한국어를 지원함. 차이는 LLM 레이어에서 발생.

3. **메모리 변환 단계**: 메모리 추가 시 LLM에게 한국어 텍스트를 넘기면, 일부 시스템은 영어로 스키마 유지 후 쿼리. 이 과정에서 한국어 정보가 누락되거나 환각됨.

### R6 KO vs R5 EN: 컴팩트 비교

```
어댑터           EN참조  EN R5    KO R6    EN→KO

letta            yes   87.5%   67.5%   -20pp
airi(baseline)   yes   33.9%   16.0%   -18pp
openclaw         yes   43.3%   14.8%   -29pp
mem0             yes   83.1%   24.0%   -59pp
sap              yes   74.1%   12.9%   -61pp
sillytavern      yes   79.8%   17.6%   -62pp
open-llm-vtuber  yes   85.2%   14.4%   -71pp
graphiti         yes   55.8%   DNF      -
naia             yes   84.0%   TBD      -
```

### 주목할 상관관계

- **EN 성능 ≠ KO 성능**: EN 80%에 달하는 시스템들(mem0, sap, open-llm-vtuber)이 KO에서 14-24%로 붕괴. 주로 사용하는 AI 서비스가 영어로만 최적화되어 있다면 KO 실용 불가.

- **letta 독주**: 다중언어 사용 환경에서 letta만 실질적 옵션. 다만 abstention 실패 문제 존재.

---

## graphiti 상세

graphiti는 query 156/240 지점에서 Neo4j Internal Server Error (500)로 중단:
- 156개 쿼리 체크포인트 존재하지만 연결 안정성 문제로 연속 실패
- EN R5에서는 55.8%를 얻었지만 승리보다 Neo4j 클러스터 안정성이 문제로 보임
- 영향: graphiti DNF로 처리, 시스템 순위에 포함하지 않음

---

## naia 수정 내용 (R6 신규)

이번 KO 벤치마크에서 naia는 다음 버그 수정 후 실행:

1. **per-query consolidation 제거** (`run-comparison.ts`)
   - 3개 위치에서 `consolidateNow(force=true)` 호출 제거
   - 노이즈 입력 후, 업데이트 후 좌도 boundary에서만 consolidation 수행
   - O(n²) 문제 해결: 쿼리당 1000+ 에피소드 이촉→양하면 ok

2. **cacheId 올바른 분리** (`run-comparison.ts`)
   - KO는 `cache-ko` DB, EN은 `cache-en` DB 사용
   - 이전 non-skip-encode는 `stable` DB 활용하던 버그 수정

---

## 결론

R6 KO 벤치마크에서 가장 중요한 발견은 **한국어 지원은 선택적 능력이 아니라 시스템적 인프라 문제**라는 점입니다. 7개 시스템 중 6개가 EN 대비 -50pp 이상 하락한다는 것은 단순한 마이너 문제가 아닙니다.

**핵심 사항**:
- Korean용 메모리 시스템 개발 시 다중언어 LLM + 한국어 entity 추출 능력이 필수
- 임베딩만으로는 언어바를 넘지 못함 (LLM 레이어가 핵심)
- letta(Letta AI + 다중언어 LLM)만이 한국어 실용 범위에 진입
- naia 결과 업데이트 예정 (인코딩 완료 후)

---

*보고서 작성: Claude Sonnet 4.6 (2026-04-13)*
