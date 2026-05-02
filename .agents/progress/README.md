# `.agents/progress/` — 진행 상태 + Anti-Drift Anchors

**일자**: 2026-05-02
**Status**: R0 anchor 작성 완료, R1 슬라이스 시작 대기

## 📌 AI Session 시작 시 읽기 순서 (강제)

```
1. plan-v3-anchor-2026-05-02.md       ← 현 SoT (모든 작업의 anchor)
2. decision-matrix.md                  ← §A 채택 / §B 거부 / §C pending / §D 신규
3. gap-analysis-r0-2026-05-02.md       ← 기존 코드 vs plan, 모순 5건
4. cross-review-log-r0-anchor.md       ← §Y 결과 + 다수결 trail
```

## 파일 인덱스

### Anchor 문서 (변경 시 cross-review §Y 필수)

| 파일 | 역할 | 상태 |
|------|------|------|
| `plan-v3-anchor-2026-05-02.md` | **SoT** — 컨텍스트 잠금 + Phase 계획 | v1.1 PASS (2/3) |
| `decision-matrix.md` | §A/B/C/D 의사결정 매트릭스 | v1.0 |
| `gap-analysis-r0-2026-05-02.md` | 갭 분석 + 자가 수정 가이드 | v1.1 (cross-review 반영) |

### Cross-Review Log

| 파일 | 내용 |
|------|------|
| `cross-review-log-r0-anchor.md` | plan v1.1 §Y 다수결 trail |
| `plan-v3-anchor-cross-review-output.md` | Round 1 raw |
| `plan-v3-anchor-cross-review-output-v2.md` | Round 2 raw |
| `plan-v3-anchor-cross-review-output-v2-tiebreaker.md` | Tie-breaker (Claude 3.5 Haiku) |
| `gap-analysis-cross-review.md` | gap analysis 의 cross-review |

### Skeleton (R1.4 머지 대기)

| 파일 | 역할 |
|------|------|
| `AGENTS-v3-skeleton.md` | R1.4 슬라이스에서 기존 AGENTS.md 와 통합할 v3 스켈레톤 |

## 🚨 AI 흔들림 시 자가 수정 — 첫 참조점

이 섹션은 AI 가 confused 했을 때 즉시 참조.

| AI 의 confused 신호 | 권고 (decision-matrix 인용) |
|---|---|
| "naia 자체 엔진 강화하자" | §A06 (mem0 stack on top) + plan §2.3 |
| "v3 레이어 더 만들자" | §B04 (5-layer hybrid 거부) + plan §0.2.2 |
| "MemoryProvider 새로 정의" | §A01 (기존 채택) + plan §0.1.2 |
| "mem0 fork 해서 KO fix" | §B01 (fork 금지) + plan §0.2.1 |
| "naia-memory 가 자연어 파싱" | §B02 (자연어는 agent) + plan §2.2 |
| "abstention 우리가 결정" | §B03 (응답 결정은 agent) + plan §2.2 |

**규칙**: 큰 의사결정 전 위 항목 적어도 1개 인용 의무.

## 현재 상태 (2026-05-02)

### 완료
- ✅ Plan v1.1 작성 (cross-review §Y PASS)
- ✅ Decision matrix 작성 (8 §A / 6 §B / 5 §C / 5 §D)
- ✅ Gap analysis 작성 (cross-review §Y PASS, 추가 gap 반영)
- ✅ Cross-review log 4 round (1 anchor + 3 tie-breaker)

### 다음 작업 (R1 시작)

```
R1.0: AGENTS.md outdated 헤더 (anti-drift lockdown)   ← FIRST
  ↓
R1.1: server consolidation race fix (P0 bug)
  ↓
R1.2: v3/ 코드 정리 (12 파일 매핑)
  ↓
R1.3: NaiaMemoryProvider wrapper
  ↓
R1.4: AGENTS.md / CLAUDE.md 통합
  ↓
R1.5: agents-rules.json (machine-readable forbidden)
  ↓
R1.6: 벤치마크 시스템 현행화 (Gemini 추가 권고)
```

총 R1 시간: ~6일.

## Cross-Review 통계

| Round | 대상 | Reviewers | 다수결 |
|-------|------|-----------|--------|
| 1 (anchor v1.0) | plan-v3-anchor v1.0 | Gemini Pro + GLM | revisions 후 통과 |
| 2 (anchor v1.1) | plan-v3-anchor v1.1 | Gemini Pro + GLM + Claude 3.5 Haiku | **PASS (2/3)** |
| 3 (gap) | gap-analysis | Gemini Pro + GLM | **PASS (2/2)** + Benchmark Integrity gap 추가 |

## Risk + 완화

| Risk | 완화 |
|------|------|
| Architectural drift 재발 | 본 README + plan §0 anchor 가 첫 참조점 |
| AGENTS.md outdated | R1.0 슬라이스에서 헤더 update + R1.4 통합 |
| Server consolidation race | R1.1 슬라이스 P0 fix |
| 벤치마크 깨짐 (12→9 cat) | R1.6 슬라이스 현행화 |
| AI 안 읽음 (Mandatory Reads) | Enforcement (PR template, agents-rules.json) — R1.5 |

## SoT 우선순위

```
.agents/context/agents-rules.json (R1.5 후)
  > .agents/progress/plan-v3-anchor-2026-05-02.md  ← 현 SoT
  > AGENTS.md (R1.4 통합 후 SoT)
  > 본 README.md (인덱스)
  > 기존 R5~R14 컨텍스트 (archive)
```
