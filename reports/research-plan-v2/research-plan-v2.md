# Naia Memory — Research Plan v2 (2026-04-30)

**Trigger**: 이슈 #5 LoCoMo full-pipeline 측정 후 자체 엔진의 18% accuracy 가 mem0 platform 91.6% / Synthius-Mem 94.4% 와 73-76pp 격차 확인. R8 v2 ~ R14 의 KO 자체 benchmark 결과만으로는 이 격차가 안 보였음.

## 1. 현재 좌표 — 우리는 어디에 있는가

### LoCoMo SOTA 지형 (2026-04-30 기준)

| 시스템 | LoCoMo top-200 | 특징 | 발표 |
|---|---:|---|---|
| **Synthius-Mem** | **94.37%** | 6 cognitive domains (persona) + CategoryRAG, 99.55% adv robust | 2026-04-13 |
| MemMachine | 91.69% | (Synthius baseline) | — |
| **mem0 platform** (cloud) | **91.6%** | structured fact extraction + ADD/UPDATE/DELETE/NOOP + dense retrieval | 2025 |
| Mem0+ paper | ~92% | (mem0 paper claim) | 2025-04 |
| **SuperLocalMemory Mode C** | 87.7% | 7-channel retrieval (semantic/keyword/entity graph/temporal/spreading/consolidation/Hopfield) + Ebbinghaus + FRQAD | 2026-04-09 |
| **Zep (Graphiti)** | 85.2% | bi-temporal KG + triple-modality search (vector + BM25 + graph) | — |
| SuperLocalMemory Mode A (zero-cloud) | 74.8% | math-only retrieval | — |
| Letta (MemGPT) | 74.0% | LLM-managed, file-based | — |
| **우리 (LocalAdapter)** | **18.1%** | self-built BM25+vector RRF + LLM fact extractor (timestamp 버그) | 2026-04-30 |

### 다른 벤치마크에서 mem0

| 벤치마크 | mem0 platform |
|---|---:|
| LoCoMo top-200 | 91.6% |
| LongMemEval top-50 | 90.4% |
| Beam-1M top-200 | 70.1% |
| Beam-10M top-200 | 50.5% |

→ **mem0 가 LoCoMo 에 오버피팅 안 됨**. LongMemEval 도 90%+. Beam scale 에서는 모두 무릎. Sweet spot = 수천~만 메모리.

### 중요한 사실 (그동안 흐려졌던)

- **현재 production = naia 자체 엔진 (LocalAdapter)**, mem0 코드 0줄
- 원래 설계 (2026-03-26 design session): **mem0 backbone + naia layer** (Mem0Adapter docstring)
- R6 (4월 13일) 발견 — mem0 LLM dedup KO 깨뜨림 → R8 v2 부터 LocalAdapter 로 전환
- 그 결과 **EN benchmark 에서 mem0 의 검증된 retrieval 인프라를 잃음**
- KO 자체 benchmark (R8~R14) 는 우리 차별점 (abstention, contradiction) 위주라 격차가 안 보였음

## 2. 우리가 놓치고 있는 것 (구체)

### 2-1. 단순 버그 (즉시 fix)

**B1. timestamp Unix s vs ms** — `llm-fact-extractor.ts:81`
```ts
new Date(ep.timestamp)  // ms 기대, LoCoMo 는 seconds
// 모든 fact 가 1970-01-19 로 저장됨
```
→ **temporal 2.7% 의 단독 원인**. fix: `new Date(ep.timestamp * 1000)`.

**B2. V8 max string length 537MB** — `local.ts:save()`
- JSON.stringify 가 V8 string limit 에서 throw
- store 분할 또는 binary serialization (msgpack/CBOR) 필수
- LoCoMo conv 8/9 에서 OOM 의 진짜 원인

**B3. save() throttle 패턴** (이미 fix 함) — debounce timer reset 무한루프 → throttle (max 2초 wait 보장)

**B4. fact 의 encodingContext 누락** (이미 fix 함) — search filter 가 빈 결과만 반환

### 2-2. 아키텍처 결정의 문제 (Gemini cross-review 진단)

**A1. Write-time 에 lossy fact extraction**
- Original: "blue Toyota Camry alternator replaced"
- Atomic fact: "User went to dealership"
- 잃어버림: blue, Toyota, Camry
- Future Q: "What color is your car?" → 0% single-hop 의 정확한 설명
- **Gemini 진단**: "Premature commitment — forcing LLM to guess at write-time what facts will matter for unknown future questions"
- **R14 review round 1 결론과 일치**: "consolidation 을 source of truth 가 아닌 index/cache 로 격하"

**A2. Raw episode retrieval 미통합**
- 우리는 fact 만 retrieve. mem0 도 fact 만 — 그런데 우리는 18%, mem0 는 91%
- 차이: mem0 의 fact extraction 이 더 정교 (write-time 대신 read-time 처럼 동작)
- 또는 mem0 가 implicitly raw chunks 도 함께 활용
- 우리 LocalAdapter 의 episodic store 는 디스크에 raw 보존하지만 **retrieval 에 미사용**

**A3. KG 가 retrieval 에 통합 안 됨**
- 우리: knowledge-graph.ts 에 spreadingActivation 있음
- 그러나 LoCoMo run 에서 entity bonus 로만 쓰고 retrieval primary signal 아님
- Zep Graphiti 는 KG 가 retrieval primary modality (vector + BM25 + **graph**)

**A4. Temporal index 부재**
- mem0 platform LoCoMo temporal: 92.8%
- 우리: 2.7% (timestamp 버그도 있지만 fix 후에도 temporal index 없음)
- Zep: bi-temporal KG (event-time + system-time)

### 2-3. 외부 SOTA 추적 미흡

**E1. Synthius-Mem (2026-04-13!) 같은 새 paper 누락**
- 6 cognitive domains (biography/experiences/preferences/social circle/work/psychometrics) — content-based categorization
- CategoryRAG (21.79ms latency) — category-aware routing
- 우리 4-store (episodic/semantic/procedural/working) 와 다른 angle: type-based vs content-based

**E2. SuperLocalMemory V3.3 (2026-04-09) — 우리와 가장 비슷한 철학**
- "full cognitive memory taxonomy"
- **7-channel retrieval**: semantic, keyword, entity graph, temporal, spreading activation, consolidation, Hopfield associative
- 우리는 이 중 2개 (vector, BM25) + a (KG spreading activation, partial)
- Ebbinghaus Adaptive Forgetting + Fisher-Rao Quantization-Aware Distance
- Mode A (zero-cloud) 74.8% — 우리가 자체 엔진으로 가야 할 베이스라인

**E3. Zep Graphiti (85.2%) — temporal + KG 결합**
- bi-temporal knowledge graph
- Triple-modality (vector + BM25 + graph traversal)
- 우리 KG 가 retrieval first-class 가 아닌 결정적 차이

**E4. Mem0 의 4 operations (ADD/UPDATE/DELETE/NOOP)**
- 우리 contradiction detection 와 유사하나 우리는 status field 만 update (cascade delete 회피로)
- mem0 는 적극적 DELETE 도 함

### 2-4. 실험적 검증 부족

**X1. mem0 OSS LoCoMo 미측정**
- mem0 platform 91.6% 와 OSS 의 격차 알 수 없음
- "mem0 backbone 으로 돌아가기" 의 ROI 가 불확실
- **즉시 측정 필요**

**X2. 자체 benchmark 만 의존**
- R8 v2 ~ R14 모두 자체 KO benchmark
- LoCoMo 같은 표준 EN benchmark 미진행 (이번 처음)
- 그동안 점수 격차 안 보임 → 자체 system 의 EN retrieval 약점 미인지

**X3. Cross-review 미운영**
- 외부 AI (Gemini, GLM) 진단이 즉시 핵심 root cause 짚음 (lossy fact extraction)
- R8~R14 의 자체 review round 도 좋았지만 **외부 SOTA 와 비교** 부족

## 3. 연구 계획 v2 — 3-Tier 전략

### Tier 1: EN Standard Benchmarks (LoCoMo, LongMemEval) — mem0 backbone 부활

**목표**: LoCoMo top-200 90%+ 달성 (mem0 OSS + naia layer 패턴)

**기간**: 1주 (단기 검증) → 1개월 (production)

**Phase 1.1 (즉시, 1일)**:
1. timestamp 버그 fix (`new Date(ep.timestamp * 1000)`)
2. Mem0Adapter (`mem0.ts`) 빌드 검증, 환경변수로 adapter 전환 가능하게
3. LoCoMo conv 0~2 만 mem0 OSS adapter 로 측정
4. mem0 OSS 의 LoCoMo 점수 확인 (가설: 80-90% 사이)

**Phase 1.2 (1주)**:
1. mem0 OSS 위에 naia rerank layer 얹기
   - importance × strength × recency × decay 로 top-200 → top-K re-rank
   - contradiction detection 으로 status field active 만 출력
2. LoCoMo full run (10 conv) — mem0 + naia layer
3. naia layer 의 추가 효과 측정 (+α)

**Phase 1.3 (1개월)**:
1. SuperLocalMemory 의 7-channel retrieval 채택 (entity graph, temporal, Hopfield 등 추가)
2. Zep 의 bi-temporal KG 도입
3. CategoryRAG 식 router 실험 (2-stage retrieval: type/category 분류 → 카테고리별 retrieval)
4. 목표: 91-94% (mem0/Synthius 수준)

### Tier 2: KO Production (Naia OS users) — LocalAdapter 유지 + 개선

**목표**: KO 자체 benchmark 60%+ (현재 R14 49% gemini judge), R10 의 abstention/contradiction 우위 유지

**기간**: 1-2개월

**Phase 2.1 (1주)**:
1. timestamp 버그 fix (Tier 1 과 공통)
2. V8 string limit 우회 — store 분할 (per-conv 또는 chunked JSON) 또는 msgpack/CBOR 도입
3. save() throttle 검증 (이미 fix)
4. fact 의 encodingContext 통합 (이미 fix)

**Phase 2.2 (1개월)**:
1. P3 로드맵 (Dual-Path Retrieval) 구현
   - Episode raw retrieval 채널 추가
   - Fact 와 episode 결과 RRF 통합
2. P4 Query decomposition (multi-hop)
3. Temporal index (event-time vs storage-time)

**Phase 2.3 (지속)**:
1. KO LLM dedup 우회 — Korean-aware tokenizer/normalizer
2. naia 의 차별점 (importance, contradiction, decay) 강화
3. Korean LongMemEval 같은 KO standard benchmark 만들기 (자체 v2 외에)

### Tier 3: Scale Frontier (Beam-1M, Beam-10M) — 진짜 R&D 차별점

**목표**: 백만~천만 메모리 scale 에서 mem0 (50-70%) 위로

**기간**: 6개월~

**Phase 3.1 (1개월)**:
1. SQLite 또는 Qdrant backend (LocalAdapter 의 file-based JSON 한계 돌파)
2. Hierarchical memory (4-store 의 진짜 구현 — episodic archive, semantic active, etc.)
3. Lifecycle management (decay → archive → forget)

**Phase 3.2 (3개월)**:
1. Cognitive quantization (SuperLocalMemory FRQAD 식 압축)
2. 7-channel retrieval 모두 production 통합
3. Beam-1M 측정 + iteration

**Phase 3.3**: 학술 publication 가능 영역

## 4. 즉시 액션 (이번 주)

### 우선순위 1: 검증 실험 (1-2일)
1. ✅ timestamp 버그 fix (5분)
2. ✅ V8 string limit 진단 (이미 함)
3. **새**: Mem0Adapter 부활 + conv 0~2 만 LoCoMo predict 측정
   - mem0 OSS 의 LoCoMo 점수 확인 (Tier 1 ROI 결정)
4. **새**: 우리 (timestamp fix 후) LoCoMo predict 재측정
   - timestamp fix 만으로 얼마 개선되나 (가설: temporal 2.7% → 50%+)

### 우선순위 2: 외부 SOTA 추적 (지속)
1. SuperLocalMemory V3.3 GitHub 분석 (Open source under Elastic License 2.0)
2. Zep Graphiti 의 bi-temporal KG 구현 분석
3. Synthius-Mem 의 6 domains + CategoryRAG 디테일 (paper PDF 다른 경로 시도)

### 우선순위 3: 인프라 (1주)
1. V8 string limit fix — msgpack 또는 store 분할
2. Mem0Adapter 환경변수 전환 (NAIA_ADAPTER=mem0 또는 local)
3. dual-track LoCoMo run script (mem0 vs local 비교용)

## 5. 의사결정 기준

**Tier 1 (mem0 backbone) 선택 시점**:
- mem0 OSS LoCoMo conv 0~2 측정 결과 80%+ → 즉시 채택
- 60-80% → naia layer 보강해서 시도
- 60% 미만 → mem0 OSS 자체 한계, Tier 2/3 집중

**production switch 기준**:
- Naia OS KO 사용자: LocalAdapter 유지 (KO 호환성)
- Naia OS EN 사용자 / 영어 agent: Mem0Adapter
- Adapter 추상 layer 통일 (이미 MemoryAdapter interface 있음)

## 6. 회고 — 우리가 어떻게 길을 잃었나

**4월 26일 ~ 4월 29일 흐름**:
1. R6 (4/13) mem0 KO 깨짐 발견 → LocalAdapter 로 production 전환
2. R8 v2 (4/23) 자체 v2 benchmark 도입 — 자체 system 우위 보임
3. R10 (4/24) Two-Stage Retrieval — 자체 retrieval 개선
4. R14 (4/25) P0+P1+P2 통합 — KO 자체 benchmark 49% 달성
5. **(누락된 단계)** EN standard benchmark (LoCoMo) 측정
6. 4/28~29 LoCoMo 첫 측정 시도 — P0-C 잔여 버그로 facts 0개 → 무효
7. 4/30 (오늘) LoCoMo 정상 측정 — 18% 발견, mem0 91% 와 73pp 격차

**놓친 결정**:
- LocalAdapter 로 전환할 때 **EN benchmark 영향** 미평가 (KO 호환성만 봄)
- 자체 KO benchmark 점수가 좋아지자 자체 retrieval 인프라가 mem0 만큼 다듬어졌다고 **암묵적 가정**
- **외부 SOTA 추적** 미운영 — Synthius (4/13), SuperLocalMemory (4/9) 같은 신규 paper 누락
- **자체 review round 의 한계** — 우리 시스템 안에서만 비교

**교훈**:
- 매월 외부 SOTA tracking + LoCoMo/LongMemEval 같은 표준 benchmark 정기 측정
- production trade-off 결정 (LocalAdapter 전환 같은) 시 다중 axis 측정
- 외부 AI cross-review 정기 운영 (Gemini, GLM)

## 7. 차별점 (포기하지 않는 것)

LoCoMo 점수만 추구하면 mem0/Synthius copy. **naia 의 진짜 IP**:

1. **Abstention 90%** (R8 v2) — Synthius 99.55% 보다 낮지만 우리 핵심 차별
2. **Contradiction detection** (reconsolidation.ts) — mem0 4 operations 와 다른 접근
3. **3-axis importance (importance × surprise × emotion)** — 진짜 brain-inspired
4. **4-Store Architecture** — episodic/semantic/procedural/working 분리
5. **Knowledge Graph 와 spreading activation**
6. **Ebbinghaus decay** — write 후 자연 forgetting

→ 이걸 **읽기-시간(read-time) 에 활성화**해야 함. 현재 write-time 에만 적용되는 게 정보 손실의 핵심.

---

**다음 단계**: 이 계획을 Gemini + GLM 에 cross-review 의뢰 → 약점/누락/대안 수렴 → 이슈 #5 통합 코멘트 → Phase 1.1 즉시 실행.

---

## Appendix: Cross-Review (Gemini 2.5 Pro + GLM-4 Plus, 2026-04-30 저녁)

두 AI 모두 **3-tier 전략 거부**, single path 강요.

### 일치된 비판

1. **"mem0 + naia layer" 비현실적**
   - 73pp gap (mem0 91% vs 우리 18%) 은 reranking 으로 못 메움
   - rerank 는 보통 +α (precision 살짝 개선) — recall 격차 안 메움
   - mem0 도 자체 ranking + update 로직 — naia layer 와 conflict 위험 (Franken-stack)

2. **Differentiation claims 대부분 standard**:
   - 4-Store Architecture: Tulving (1972), ACT-R 등 표준
   - KG + Spreading Activation: Zep Graphiti 가 더 잘 함
   - Ebbinghaus Decay: SuperLocalMemory 도 명시적 사용
   - **유일한 잠재 unique IP**: Contradiction Detection (mem0 ADD/UPDATE/DELETE/NOOP 와 다른 angle 가능)

3. **Timeline 비현실**:
   - Tier 1.3 (1개월에 SuperLocalMemory + Zep + Synthius 다 채택) = fantasy
   - Tier 3 (6개월에 Beam-10M SOTA) = research question, 안전한 roadmap 아님

### 놓친 기술 / 평가

**Retrieval 기술**:
- ColBERT (late-interaction retrievers) — RRF 보다 일관 우위
- SPLADE (learned sparse) — sparse + dense 통합
- Graph RAG reasoning (LLM 이 KG 위 walk) vs 단순 KG retrieval mixing
- Query decomposition (multi-hop) — RAGatouille 등

**평가 메트릭**:
- NIAH (Needle-in-a-Haystack) — pure long-context retrieval 측정
- Recall@K — 200 위에 답이 있는 비율
- MRR (Mean Reciprocal Rank)
- Latency (Synthius 21.79ms 대비 우리 2초)
- Memory footprint (production critical)

**시스템 / 패러다임**:
- ACT-R declarative memory + activation-based retrieval (foundational, 우리 KG spreading activation 이 그 일부)
- Vector DB feature set (Weaviate, Pinecone) — 우리가 LocalAdapter 만들 가치가 있는가
- MemGPT (Letta) 의 file-based memory + LLM tool use — 74% 만으로 simple architecture 의 가능성

### 두 AI 의 1주 결정 실험 (수렴)

**Gemini**: `Naia best-case (Dual-Path) vs mem0 OSS` LoCoMo 점수 비교 → 결정 강요
**GLM**: `Raw chunk extractive vs Lossy fact retrieval` A/B → 아키텍처 결정

**통합 실험** (가장 information-dense):
1. **Track A — Naia Best-Case**: timestamp fix + V8 fix + Dual-Path Retrieval (raw + fact RRF) → LoCoMo 측정
2. **Track B — mem0 OSS**: Mem0Adapter 부활 (수정 없이) → LoCoMo 측정
3. **Track C — Pure Raw Retrieval**: fact extraction 끄고 raw episode chunk 만 retrieve → LoCoMo 측정

세 점수로 4분면 결정:
- A 우월 → naia rebuild (Path B in Cross-Review)
- B 우월 → mem0 backbone 채택, LocalAdapter deprecate (Path A)
- C 우월 → 우리 fact extraction 자체가 lossy 함 증명 — read-time extractive 로 pivot
- 셋 다 약함 → 더 깊은 문제, SuperLocalMemory backbone 도 후보

### 결정 (Plan v3 으로 evolve)

**3-Tier 폐기 → Sequential Single-Path**

**Phase 1 (2주): Stabilize & Benchmark**
- 모든 알려진 버그 fix (timestamp, V8, encodingContext)
- Track A/B/C 세 실험 동시 진행
- LoCoMo top-50 / top-200 + Recall@K + MRR + Latency 모두 측정

**Phase 2 (1일): The Decision**
- 세 점수 + 외부 baselines (mem0 91%, Synthius 94%, SuperLocalMemory Mode C 87%) 와 대조
- Single path 채택 — 다른 path 는 확실히 종료

**Phase 3 (3-6개월): Execute & Differentiate**
- 채택 path 으로 SOTA parity (90%+) 달성
- Contradiction Detection 만이라도 잘 layering — naia 의 진짜 차별점 protect

### 즉시 폐기되는 가정

- ❌ "naia 4-store 가 unique IP" — Tulving 1972, ACT-R 표준
- ❌ "KG + spreading activation 이 차별" — Zep Graphiti 가 더 잘 함
- ❌ "1개월에 7-channel 통합 가능" — 각 채널 독립 R&D 필요
- ❌ "mem0 + naia layer 로 91%+α 가능" — rerank 만으론 73pp 못 메움
- ❌ "Tier 3 Beam-10M 에서 mem0 위로" — 6개월 안에 검증 불가능 한 research question

### 보존되는 (조건부) IP

- ✅ **Contradiction Detection** — mem0/Zep 와 angle 다름. 잘 implement 시 진짜 차별점
- ✅ **3-axis importance (surprise + emotion 부분)** — implementation 정교 시 unique
- ⚠️ **4-Store, KG, Decay** — 컨셉 표준. **implementation quality 만 차별**. 그 quality 가 18% 점수로 의심됨.

