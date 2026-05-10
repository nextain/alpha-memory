# Decision Matrix — naia-memory v3

**Format**: §A (채택) / §B (거부) / §C (pending) / §D (신규)
**Origin**: naia-agent 의 ref-adoption-matrix 패턴 차용

## §A 채택 (변경 금지, 증거 있음)

| ID | 결정 | 근거 | 일자 |
|----|------|------|---|
| A01 | MemoryProvider interface 채택 (`@nextain/agent-types/memory`) | 이미 정의됨, naia-agent 와 계약 | 2026-04-30 |
| A02 | Capability pattern (BackupCapable, ImportanceCapable, etc.) | agent-types 가 이미 정의 | 2026-04-30 |
| A03 | Adapter pattern — LocalAdapter, Mem0Adapter, QdrantAdapter | 기존 src/memory/adapters/ 존재 | 2026-04-15 |
| A04 | Importance gating (3-axis: importance × surprise × emotion) | CraniMem 2025 + R8 v2 검증 | 2026-04-23 |
| A05 | Ebbinghaus decay (formula: e^(-k·t/stability)) | 기존 src/memory/decay.ts | 2026-04-15 |
| A06 | mem0 위에 stack on top (코드 결합 X) | 사용자 directive 2026-05-02 | 2026-05-02 |
| A07 | Cross-review §Y (2 different-profile clean) | naia-agent 룰 차용 | 2026-04-25 |
| A08 | Slice 머지 4 게이트 (실행 명령 + 단위 + 통합 + CHANGELOG) | naia-agent 룰 차용 | 2026-04-25 |

## §B 거부 (도입 금지, 명시적 No)

| ID | 결정 | 근거 | 일자 |
|----|------|------|---|
| B01 | mem0 코드 fork / vendor 금지 | Careti-Cline 식 maintenance 부담, 사용자 직접 경고 | 2026-05-02 |
| B02 | naia-memory 가 자연어 의도 파악 (예: "어제" 파싱) | naia-agent 책임 영역 | 2026-05-02 |
| B03 | naia-memory 가 abstention decision (응답 결정) | agent + LLM 책임 영역 | 2026-05-02 |
| B04 | mem0 + naia "5-layer hybrid" — codebase 결합 | 사용자 directive 2026-05-02 | 2026-05-02 |
| B05 | LocalAdapter 무시 + mem0 만 의존 | mem0 upstream 깨질 시 위험 | 2026-05-02 |
| B06 | LLM judge 만으로 평가 (keyword judge 없이) | calibration 필수 (R6 검증) | 2026-04-13 |

## §C Pending (결정 필요)

| ID | 질문 | 후보 | 누구가 결정 |
|----|------|------|---|
| C01 | KO 형태소 분석기: lite vs konlpy vs khaiii | lite (의존 X) / konlpy (정확) | R3 시작 시 |
| C02 | Embedding 모델 (KO 친화): multilingual-e5-large / Xenova / 다른 | 측정 후 | R3.3 결과 |
| C03 | mem0 OSS K-MemBench latency 해결 방법 | 배치 / 캐싱 / 작은 OSS LLM 교체 | R1 후반 |
| C04 | npm publish 시점 | 로컬 file: 의존 → semver | R5 이후 (안정화 후) |
| C05 | Voyage 결제 옵션 검토 | 사용자 환경 변경 시 | 사용자 결정 |

## §D 신규 (이번 세션 추가)

| ID | 항목 | 일자 |
|----|------|---|
| D01 | server consolidation race condition 발견 + per-user_id queue 권고 | 2026-05-02 |
| D02 | mem0 OSS 의 KO LLM dedup 영어 변환 버그 회피 wrapper 패턴 | 2026-05-02 |
| D03 | Capability `ForgetByQueryCapable` 신규 제안 (agent-types 에 추가) | 2026-05-02 |
| D04 | EngineCapabilities 플래그 → `isCapable<>()` 타입 가드로 통일 권고 | 2026-05-02 (Gemini cross-review) |
| D05 | LocalAdapter data schema 진화 마이그레이션 전략 (R2 backlog) | 2026-05-02 (Gemini cross-review) |

---

## 변경 정책

- §A 변경 시 별도 ADR + 사용자 승인 + cross-review §Y
- §B 도입 시 별도 ADR + 사용자 승인 (강한 근거 필요)
- §C 결정 시 본 표에서 §A 또는 §B 로 이동
- §D 의 항목은 다음 cross-review 후 §A/B/C 중 하나로 분류

## §A 채택 — 2026-05-08 추가

| ID | 항목 | 일자 |
|----|------|---|
| **A07** | **삭제 보수적 + 보존 우선 + recall latency 수용** — 모든 mechanism 데이터 영구 보존. status 변경 + recall priority 약화 만. 임계 도달 시 (#29) 만 strength-weighted forget. | 2026-05-08 (사용자 directive) |
| **A08** | **Background brain + Active brain 책임 분리** — naia-memory = consolidation + replay + spike emit + priority adjust. naia-agent = subscribe + source monitor + pragmatic gate. CLS / Sharp-wave ripples / Source monitoring 학계 정합. | 2026-05-08 (사용자 directive) |
| **A09** | **Retrieval ranking 강화 우선** — preservation-first 의 짝. mem0 "97.8% junk" 회피 위해 HyDE / cross-encoder / threshold 필수. (#27) | 2026-05-08 (cross-review) |
| **A10** | **Privacy 5 차원 분리** — confidence + project scope + irrelevant = naia-memory; PII redaction + source/pragmatic = naia-agent. cross-project leak 의 진짜 위험은 LLM 발화. | 2026-05-08 (사용자 통찰) |

## §A 추가 — 2026-05-10 (Phase B-γ + #27 + #50 측정 종결)

| ID | 항목 | 일자 |
|----|------|---|
| **A09 (revised)** | **Retrieval ranking 강화 *priority 재평가*** — chain dominate 가설 검증 (#27 Step 1 sweep + #50 5 conv). 모든 ranking axis (threshold / HyDE / MMR / cross-encoder) noise band ±2pp. naia 의 base retrieval (cosine + BM25 + RRF + KG + R2.5 v2 chain) 이 이미 attribute 별 1개로 압축한 set 위에서 작동 → 후단 ranking 강화 redundant. mem0 "97.8% junk" 회피 가설은 naia 와 무관 (76.8% cosine 강함). #27 후속 step 우선순위 ↓, R4 Background brain + naia-agent 통합 우선. | 2026-05-10 (cross-review 2 reviewer 일치) |
| **A11** | **합성 측정의 한계 인정** — Phase A (crowdworker prefab) + Phase B-α (의도 contradiction 37.5% 밀도) 모두 synthetic. *진짜 daily 가치* 측정은 naia-os 통합 후만 가능. mock agent loop / synthetic 위 R4 시뮬레이션 = yak shaving (cross-review 거부). | 2026-05-10 |
| **A12** | **naia 의 *novel first* 영역** — (1) Background brain spike timing-precision 측정 framework (외부 부재 — Letta sleep-time 은 math task 만), (2) 한국어 일반 daily-life multi-session memory ground (CareCall 의료 외 부재). naia-agent 통합 후 *first 측정* 이 진짜 차별화. | 2026-05-10 (cross-review 외부 비교) |
