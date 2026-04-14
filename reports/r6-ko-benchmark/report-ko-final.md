# Alpha Memory 벤치마크 R6 종합 보고서

**AI 메모리 시스템 비교 평가 — 한국어 환경 (2026년 4월)**

> 이 보고서는 Alpha Memory R6 한국어 벤치마크의 공식 결과 보고서입니다.
> 영어(R5, 2026-04-12)에 이어 한국어 환경에서 9개 AI 메모리 시스템을 비교했습니다.

---

## 1. 프로젝트 소개

### AI는 왜 기억이 필요한가?

사람과 오래 대화한 AI일수록 더 도움이 됩니다. 처음 만나는 사람에게 직업, 취미, 가족 이야기를 매번 반복해야 한다면 피곤하듯, AI도 사용자를 기억하지 못하면 진정한 조력자가 될 수 없습니다.

하지만 단순히 "기억을 많이 하는 것"이 답이 아닙니다. 기억을 너무 많이 하면 엉뚱한 정보를 꺼내거나, 없는 사실을 만들어내는 "환각(hallucination)" 문제가 생깁니다. **Alpha Memory**는 이 문제를 해결하기 위해 인간의 인지과학에서 영감을 받은 AI 메모리 시스템입니다.

### Alpha Memory 소개

Alpha Memory는 **Naia OS**(넥스테인의 오픈소스 AI 데스크탑 OS) 프로젝트의 핵심 메모리 패키지입니다. 인간의 뇌를 모방한 4개의 기억 저장소로 구성됩니다:

| 저장소 | 뇌 유사 부위 | 무엇을 저장하나 |
|--------|------------|----------------|
| **에피소딕(Episodic)** | 해마 | 시간 순서가 있는 경험과 사건 |
| **시맨틱(Semantic)** | 대뇌피질 | 사실, 개념, 관계 |
| **절차적(Procedural)** | 기저핵 | 기술, 전략, 학습된 패턴 |
| **작업(Working)** | 전전두엽 | 현재 대화의 활성 컨텍스트 |

---

## 2. 테스트 설계

### 어떻게 테스트했나?

**기본 설정:**

| 항목 | 설정 |
|------|------|
| 언어 | 한국어 (KO) |
| 이전 벤치마크 | R5 EN — 영어 (2026-04-12) |
| 페르소나 | 가상 인물에 대한 **1,000개 한국어 사실** |
| 쿼리 | **240개** (12개 카테고리 × 20개) |
| Judge | **keyword** (키워드 매칭) |
| 응답 모델 | Gemini 2.5 Flash Lite (모든 시스템 동일) |
| 실행일 | 2026-04-13 ~ 2026-04-14 |

**비교 대상 9개 시스템:**

| 시스템 | 유형 | 저장소 | 특징 |
|--------|------|--------|------|
| **naia** (Alpha Memory) | 4-store 인지 메모리 | SQLite + mem0 | Nextain 개발, 이번 벤치 주인공 |
| **letta** | 에이전트 메모리 OS | 자체 DB | Letta AI, 다국어 LLM 내장 |
| **mem0** | 장기 메모리 OSS | 벡터 DB + 그래프 | Mem0 AI, naia의 백엔드 |
| **sillytavern** | 캐릭터 AI 메모리 | 파일 기반 | SillyTavern 생태계 |
| **openclaw** | 에이전트 프레임워크 | SQLite | NanoClaw 기반 |
| **open-llm-vtuber** | 버추얼 AI 캐릭터 | 파일 기반 | VTuber AI 오픈소스 |
| **sap** | 기업형 메모리 | 자체 구조 | SAP 방식 영감 |
| **graphiti** | 시간-인식 KG | Neo4j | Zep AI, 시간축 지식그래프 |
| **airi (baseline)** | 메모리 없음 | — | LLM 사전학습만 의존 |

**채점 기준:**
- 카테고리별 가중치 × PASS 항목 수 합산
- 총점 = 425점 만점 (240개 쿼리 × 가중치)
- 등급: A(90%+), B(75%+), C(60%+), F(<60%)
- F(abs): abstention 카테고리 실패 시 (메모리 과신 위험)

---

## 3. 12가지 평가 카테고리

| # | 카테고리 | 가중치 | 항목 수 | 테스트 목적 |
|---|---------|--------|--------|------------|
| 1 | `direct_recall` | ×1 | 25 | 직접 사실 회상 — "내 이름이 뭐야?" |
| 2 | `semantic_search` | ×2 | 25 | 의미 기반 검색 — "내 기술 스택 알려줘" |
| 3 | `proactive_recall` | ×2 | 20 | 선제적 기억 제안 — 상황에 맞게 기억 꺼내기 |
| 4 | `abstention` | ×2 | 20 | 모르는 건 모른다고 함 — 환각 방지 |
| 5 | `irrelevant_isolation` | ×1 | 15 | 무관한 질문에 개인정보 삽입 안 함 |
| 6 | `multi_fact_synthesis` | ×2 | 20 | 여러 기억 조합하여 답변 |
| 7 | `entity_disambiguation` | ×2 | 20 | 동명이인/맥락 구분 |
| 8 | `contradiction_direct` | ×2 | 20 | 직접적 모순 처리 (A→B 업데이트 후 B만 반환) |
| 9 | `contradiction_indirect` | ×2 | 15 | 간접적 모순 처리 (시간 경과 후 변경) |
| 10 | `noise_resilience` | ×2 | 20 | 노이즈 속 실제 정보 회상 |
| 11 | `unchanged_persistence` | ×1 | 15 | 업데이트 후 안 바뀐 기억 유지 |
| 12 | `temporal` | ×2 | 25 | 시간 관련 기억 — 과거 상태 회상 |

---

## 4. 종합 결과

### 최종 순위 (KO R6 vs EN R5)

| 순위 | 어댑터 | **KO R6** | 등급 | **EN R5** | EN→KO 변화 | 평균 순위 |
|------|--------|-----------|------|-----------|-----------|----------|
| 1 | letta | **67.5%** | F(abs) | 87.5% | -20pp | **1.0** |
| 2 | **naia** | **24.7%** (KW) / **24.0%** (GLM) | F(abs) | 84.0% | **-60pp** | **2.5** |
| 3 | mem0 | **24.0%** | F(abs) | 83.1% | **-59pp** | **3.5** |
| 4 | sillytavern | **17.6%** | F(abs) | 79.8% | -62pp | **4.0** |
| 5 | airi(baseline) | **16.0%** | F(abs) | 33.9% | -18pp | **5.0** |
| 6 | openclaw | **14.8%** | F | 43.3% | -29pp | **7.0** |
| 7 | open-llm-vtuber | **14.4%** | F | 85.2% | **-71pp** | **4.5** |
| 8 | sap | **12.9%** | F(abs) | 74.1% | -61pp | **7.0** |
| 9 | graphiti | **4%** | F(abs) | 55.8% | **-52pp** | **8.0** |

> 모든 시스템 F등급. 메모리 유무와 무관하게 한국어 환경에서 공통 실패.

### 카테고리별 상세 점수

| 카테고리 (가중치) | letta | **naia** | mem0 | silly | airi | openclaw | olv | sap | graphiti |
|----------------|-------|---------|------|-------|------|----------|-----|-----|----------|
| direct_recall (×1) | **88%** | 20% | 16% | 28% | 4% | 0% | 8% | 0% | 0% |
| semantic_search (×2) | **48%** | 12% | 12% | 0% | 4% | 0% | 0% | 0% | 0% |
| proactive_recall (×2) | **65%** | 5% | 10% | 0% | 0% | 10% | 0% | 5% | 0% |
| abstention (×2) | ⚠️40% | ⚠️100% | 90% | 70% | 95% | 100% | 100% | 85% | 0% |
| irrelevant_isolation (×1) | 93% | **100%** | **100%** | 93% | **100%** | **100%** | **100%** | **100%** | **100%** |
| multi_fact_synthesis (×2) | **65%** | 5% | 15% | 10% | 5% | 5% | 5% | 5% | 0% |
| entity_disambiguation (×2) | **80%** | 10% | 20% | 15% | 5% | 0% | 5% | 5% | 0% |
| contradiction_direct (×2) | **55%** | 15% | 5% | 5% | 5% | 5% | 0% | 0% | 0% |
| contradiction_indirect (×2) | **67%** | 7% | 7% | 0% | 7% | 0% | 0% | 0% | 0% |
| noise_resilience (×2) | **65%** | 15% | 15% | 10% | 5% | 0% | 0% | 0% | 0% |
| unchanged_persistence (×1) | **87%** | 27% | 20% | 13% | 0% | 0% | 0% | 0% | 0% |
| temporal (×2) | **92%** | 20% | 20% | 16% | 4% | 0% | 0% | 0% | 0% |
| **TOTAL** | **67.5%** | **24.0%** | **24.0%** | **17.6%** | **16.0%** | **14.8%** | **14.4%** | **12.9%** | **4%** |

> olv = open-llm-vtuber. abstention ⚠️ = 기억 풍부할수록 모른다고 안 함 (paradox)

---

## 5. 핵심 발견

### 발견 1: 한국어 장벽은 LLM 레이어 문제

9개 시스템 중 8개가 동일한 임베딩(Gemini text-embedding-004, 768d)을 사용합니다. 임베딩 자체는 한국어를 처리할 수 있으나, LLM 처리 레이어에서 실패합니다.

```
영어 기반 LLM 파이프라인의 한국어 처리 경로:
  한국어 입력 → [LLM: entity extraction] → 영어 스키마로 저장
              → [LLM: 검색] → 영어 쿼리로 변환
              → [LLM: 응답 생성] → keyword judge 매칭 실패
```

결과: open-llm-vtuber(-71pp), sillytavern(-62pp), sap(-61pp) 등 EN 상위권이 KO에서 붕괴.

### 발견 2: letta 독주 — 다국어 내부 처리

letta는 내부 task manager가 Gemini API를 직접 호출하여 한국어 end-to-end 처리. KO에서도 -20pp에 그치며 유일하게 의미 있는 성능 유지.

- `temporal 92%`: 시간 관련 기억 EN(90%) 대비 오히려 향상
- `direct_recall 88%`: EN과 동일 수준 유지
- `unchanged_persistence 87%`: 업데이트 후 기억 보존 완벽

### 발견 3: 메모리 시스템이 기준선을 못 넘기는 역전 현상

airi(메모리 없음, 16.0%)가 openclaw(14.8%), open-llm-vtuber(14.4%), sap(12.9%)보다 높습니다. LLM의 사전학습 지식만으로도 메모리 시스템보다 한국어에서 더 나은 결과를 냅니다. **메모리가 한국어를 망가뜨리는 현상**.

### 발견 4: abstention 역설 — 메모리 실패가 역설적으로 abstention 높임

| 시스템 | KO abstention | KO recall | 해석 |
|--------|--------------|-----------|------|
| open-llm-vtuber | 100% | ~0% | 아무것도 못 찾으니 "모른다" |
| openclaw | 100% | ~0% | 동일 |
| naia | 100% | ~20% | 검색 실패 시 "모른다" |
| letta | **40%** ⚠️ | **67.5%** | 기억이 많으니 틀리게 답함 |

역설: **기억을 잘 할수록 abstention 점수가 낮아짐.** 실제 production에서는 letta의 40%가 더 위험할 수 있음 (틀린 답을 확신).  

반대로 naia의 abstention 100%는 성공이 아닌 **검색 실패의 결과** (alpha-memory#9 진단 참고).

### 발견 5: naia KO — Mem0Adapter 파이프라인 공유 확인

naia KO 24.0% = mem0 KO 24.0%. 동일한 Mem0Adapter 파이프라인을 사용하므로 **한국어 LLM dedup 문제**가 동일하게 적용됨을 수치로 확인.

### 발견 6: graphiti KO — 검색 구조 부재

graphiti는 세 가지 인프라 버그 수정 후 완주했지만 **4%**. Neo4j 지식그래프는 vector 검색 없이 keyword/semantic 회상이 불가능. KO에서 더 심화 (EN에서도 semantic_search 4%, KO에서 0%).

irrelevant_isolation 100%는 "메모리를 쓰지 않아도 통과"하는 구조적 특성에 기인.

---

## 6. naia 상세 분석

### R6 확정 결과

| 벤치 | Judge | 점수 | 순위 |
|------|-------|------|------|
| EN R5 | GLM-5.1 | **84.0%** | 3위 |
| EN R6 (버그 수정 재실행) | GLM-5.1 | **83.5%** | — |
| EN R6 | keyword | **61%** | — |
| KO R6 | keyword | **24.7%** | 2위 |
| KO R6 | GLM-5.1 | **24.0%** | 2위 |

버그 수정(cacheId + per-query consolidation 제거)이 EN 성능에 영향 없음 확인 (84.0% → 83.5%, 노이즈 범위).

### KO 카테고리별 강점/약점

**강점:**
- `irrelevant_isolation` 100%: 무관한 질문에 개인정보 삽입 안 함 (EN과 동일)
- `unchanged_persistence` 27%: 모순 업데이트 후에도 일부 기억 유지
- `contradiction_direct` 15%: 일부 직접 업데이트 처리

**약점:**
- `proactive_recall` 5%, `multi_fact_synthesis` 5%: 복합 기억 연결 실패
- `semantic_search` 12%: EN 88% 대비 -76pp (한국어 쿼리 임베딩 매칭 저하)
- `abstention` 100%: **거짓 양성** — 실제 confidence gating이 아닌 검색 실패의 결과

### R6에서 수정된 버그

1. **cacheId 분리**: KO는 `cache-ko`, EN은 `cache-en` DB 사용 (이전: 동일 `stable` DB 공유)
2. **per-query consolidation 제거**: 쿼리마다 `consolidateNow(force=true)` 3회 호출 → O(n²) 제거

---

## 7. graphiti 상세

### R6 KO 완주 결과: 4% (15/240)

graphiti는 R6 KO에서 세 가지 근본 버그를 수정하여 완주에 성공했습니다:

| 버그 | 증상 | 수정 |
|------|------|------|
| Community Edition routing | group_id → DB 라우팅으로 hang | `driver.clone = λ → self.driver` |
| per-request FastAPI dep | background worker가 닫힌 driver 사용 | 앱 수준 싱글턴 패턴 |
| gemini-2.0-flash deprecated | 새 계정에서 404 → hang | .env에서 2.5-flash로 교체 |

**카테고리별:**
- `irrelevant_isolation`: 15/15 ✅ (100%) — 유일한 PASS
- 나머지 11개 카테고리: 전멸 (0%)

**근본 원인**: Neo4j KG는 vector 검색 없이 keyword/semantic 회상 불가. KG traversal만으로는 자연어 질의 대응 불가능.

EN R5에서 `contradiction 100%`는 구조적 덕분(최신 엣지가 이전 것을 무효화), `semantic_search 4%`는 우연한 KG 경로 매칭. KO에서는 그 경로도 실패.

---

## 8. 한국어 메모리 시스템을 위한 조건

R6 KO 결과에서 도출한 한국어 처리 성공 요인:

### 필수 조건

1. **다국어 LLM** — 한국어 entity extraction, relation parsing, 응답 생성을 한국어로 수행
   - letta: Gemini API 직접 호출 → 한국어 end-to-end
   - 나머지: 영어 전제 파이프라인 → 한국어에서 붕괴

2. **다국어 임베딩** — 현재 text-embedding-004(768d, EN 최적화)가 병목
   - 개선 옵션: `gemini-embedding-001` (3072d, MTEB 다국어 #1)
   - letta가 이를 사용하는 것으로 추정됨

3. **언어별 LLM dedup 전략** — mem0의 영어 기반 중복 제거가 한국어 의미 손실
   - naia = mem0와 동일 24%가 이를 증명

### 충분 조건 (추가 개선)

4. **vector search 활성화** — 임베딩 저장만 하고 검색을 안 하면 의미 없음
5. **cosine similarity threshold** — abstention의 진정한 confidence gating
6. **양방향 temporal 모델** — 과거 상태 보존 (현재는 덮어쓰기)

---

## 9. R7 로드맵

### naia KO 24% → 55%+ 목표

| 우선순위 | 작업 | 이슈 | 예상 효과 |
|---------|------|------|----------|
| P0 | LocalAdapter 전환 + gemini-embedding-001 | alpha-memory#5 | +20pp (KO LLM dedup 우회) |
| P0 | vector search 활성화 | alpha-memory#5 | +15pp (semantic/recall 카테고리) |
| P1 | cosine similarity abstention gate | alpha-memory#9 | abstention 거짓양성 해소 |
| P1 | unchanged_persistence 버그 수정 | alpha-memory#10 | +5pp |
| P2 | bi-temporal 모델 | alpha-memory#8 | temporal 카테고리 개선 |

### 벤치마크 진화 (R7)

- **retrieval latency 측정** — 응답 품질뿐 아니라 속도도 평가
- **per-query token cost** — 경제성 비교
- **GLM judge** — keyword judge의 KO 정확도 보정
- **starnion 추가** — 한국어 특화 메모리 시스템 비교

---

## 10. 결론

### 핵심 메시지

**한국어 AI 메모리는 선택 사항이 아닌 인프라 문제다.**

9개 시스템 중 letta를 제외한 8개가 KO에서 -18pp ~ -71pp 하락. EN에서 80% 이상인 시스템들(mem0, sap, open-llm-vtuber)이 KO에서 12-24%로 붕괴하는 건 "마이너 이슈"가 아닙니다.

**메모리가 있어도 한국어를 망가뜨리는 시스템이 메모리가 없는 기준선보다 낮다면**, 그 메모리는 한국어 환경에서 해가 됩니다.

### 각 시스템 요약

| 시스템 | 한 줄 평가 |
|--------|----------|
| **letta** | 유일한 한국어 실용 범위 진입. abstention 40%가 유일한 약점. |
| **naia** | 2위지만 mem0와 동일 파이프라인이 문제. R7 LocalAdapter 전환으로 letta 추격 가능. |
| **mem0** | naia와 동일 24%, 동일 원인. 영어 LLM dedup이 한국어 적의 |
| **sillytavern** | 파일 기반 단순 저장 — 한국어도 저장하지만 검색 실패. |
| **airi(baseline)** | 메모리 없이 LLM 사전학습만으로 16%. 메모리 시스템의 최소 기준선. |
| **openclaw** | 메모리 있어도 기준선 못 넘김. 한국어 파이프라인 부재. |
| **open-llm-vtuber** | EN 2위→KO 7위(-71pp). EN 최상위권이 KO에서 최악 — 영어 최적화 극단 사례. |
| **sap** | 기업형 구조지만 한국어 미지원. |
| **graphiti** | 4% 완주. Neo4j KG 단독으로는 한국어 recall 불가. |

### 다음 단계

1. **R7 구현**: alpha-memory#5 LocalAdapter + gemini-embedding-001
2. **R7 벤치마크**: latency + token cost 추가, GLM judge 적용
3. **starnion 포함**: 한국어 특화 시스템과 비교
4. **naia 포스팅**: naia.nextain.io에 R6 KO 결과 공개

---

## 부록: EN R5 vs KO R6 대조표

```
어댑터              EN R5    KO R6    EN→KO    평균순위

letta              87.5%   67.5%   -20pp    1.0
airi(baseline)     33.9%   16.0%   -18pp    5.0
openclaw           43.3%   14.8%   -29pp    7.0
graphiti           55.8%    4.0%   -52pp    8.0
mem0               83.1%   24.0%   -59pp    3.5
naia               84.0%   24.0%   -60pp    2.5
sap                74.1%   12.9%   -61pp    7.0
sillytavern        79.8%   17.6%   -62pp    4.0
open-llm-vtuber    85.2%   14.4%   -71pp    4.5
```

---

*보고서 작성: Claude Sonnet 4.6 (2026-04-14)*  
*데이터: Alpha Memory R6 KO 벤치마크 실행 결과 (nextain/alpha-memory)*
