# R3+ Cognitive Architecture — Plan (2026-05-08)

**Status**: Phase A 한국어 R2.3 완료 (76.8% cosine). 사용자 directive 5개 + cross-review 결론 위에서 R3+ 단계 정의.
**Anchor**: CLAUDE.md anti-drift §6 (보존 우선 + latency 수용) + §7 (Background/Active brain 책임 분리).

## 0. 사용자 directive 5개 (immutable)

1. **시간 연관 회상 + 장기기억 보존** (R2.5 v2, #24)
2. **모든 mechanism 에서 삭제 보수적** (#25 audit, #29 임계 망각)
3. **recall latency 수용** — 꺼내는데 오래 걸려도 OK
4. **Background brain** — sleep replay + spike emit + priority adjust (#26) — naia-memory 측
5. **Active brain** — source monitor + pragmatic gate (naia-agent#26) — naia-agent 측

학계 정합:
- Complementary Learning Systems (CLS) — McClelland 1995
- Memory replay / Sharp-wave ripples — Buzsáki 1996
- Source monitoring — Johnson 1993
- Pragmatic gating — Grice 1975
- Default Mode Network — Raichle 2001
- Reconsolidation — Nader 2000

## 1. Phase 정의

### Phase R3 — preservation-first foundation

| Issue | 내용 | LOC | 우선순위 |
|---|---|---|---|
| **#25 + #24 합본** | 삭제 보수적 audit + R2.5 v2 chain (data model 함께) | ~400 | P1 |
| **#27** | Retrieval ranking 강화 (HyDE / cross-encoder / threshold / MMR) | ~400 | P1 |
| #9 | abstention threshold (#27 의 axis A 와 결합) | ~80 | P1 |
| #29 | 임계 망각 logic (cost 무한 시) | ~200 | P3 |

R3 의 핵심 = **preservation-first 의 인프라**. mem0 \"97.8% junk\" 회피 위해 ranking 강화 필수.

### Phase R4 — Background brain

| Issue | 내용 | LOC | 우선순위 |
|---|---|---|---|
| naia-agent#27 | SpikeEvent / ActiveContext schema in `@nextain/agent-types` | ~80 | P2 (prerequisite) |
| **#26** | Background brain (replay + spike emit + priority adjust) | ~400 | P2 |
| **naia-agent#26** | Active brain (subscribe + source monitor + pragmatic gate) | ~500 | P2 |

R4 의 핵심 = **CLS + sleep replay + DMN 학계 모델 구현**. naia 의 *novel differentiation*.

### Phase R5 — Privacy + Long-term

| Issue | 내용 | LOC | 우선순위 |
|---|---|---|---|
| **#28** | Privacy 5 차원 (project scope + irrelevant isolation) | ~250 | P2 |
| **#30** | 장기 측정 framework (사용자 daily ledger + weekly self-eval) | ~500 | P2 |

R5 의 핵심 = **naia-os 통합 후 daily 사용 ground 위 진짜 측정**.

## 2. 진행 순서 권고

```
[현재] Phase A 완료 + Phase B-α 완료
   ↓
[현재 진행 중] Phase B-γ — A/B mechanism (importance / KG / hybrid) — task #47
   ↓
[다음] R3 Phase — #25+#24 합본 PR + #27 retrieval ranking
   ↓
[그 다음] R4 Phase — agent-types#27 → #26 → naia-agent#26
   ↓
[병행] naia-os#240 통합 (사용자 측 진행 중)
   ↓
[통합 후] R5 Phase — #28 privacy + #30 long-term measurement
```

## 3. 각 Phase 의 벤치마크 + 테스트

### R3 벤치마크

- Phase A 100 conv 재측정 — preservation-first 변경 후 recall@k 회복 확인
- 새 axis: **F-1 HyDE recall** / **F-2 cross-encoder precision** / **F-3 abstention accuracy**
- Cost axis (issue #25 audit) — embedding 누적 + disk footprint 추적

### R3 테스트

- Unit: shouldArchive threshold, status transition, supersede chain integrity
- Integration: 1000 fact + chain 100 depth 위 recall@k
- Regression: 기존 caller 동작 변경 X (default mode='latest')

### R4 벤치마크

- 새 Phase D: replay efficacy / spike precision-recall / priority drift
- Phase B-α ledger 위에서 spike emit 확인

### R4 테스트

- Unit: replay-worthy 선정, spike rule, scope partition
- Integration: real consolidation cycle 위에서 spike emit + subscribe e2e
- Regression: spike 없는 상태 (consolidation 만) 기존 동작 변경 X

### R5 벤치마크

- **G-1** Cross-project leak rate (목표: 0%)
- **G-2** Within-project recall (degradation 5pp 미만)
- **G-3** Intent precision
- 사용자 weekly self-eval (Likert 5점)
- Monthly snapshot diff

### R5 테스트

- Unit: project scope filter, intent classifier, PII redaction
- Integration: cross-project leak 시나리오
- Long-term: 사용자 동의 후 A/B (mechanism on/off 1주 단위)

## 4. Anti-overfit guard (지속)

- *prompt iteration X, measurement only* (Phase A retro)
- 합성 ledger 결과 → daily ground 가 진짜 검증 (R5)
- 카테고리별 적응형 가중치 X — 범용 단일 전략

## 5. 책임 분리 (Background ↔ Active)

| 책임 | naia-memory | naia-agent |
|---|---|---|
| Background consolidation cycle | ✓ | |
| Replay-worthy fact 선정 | ✓ | |
| Spike detection + emit | ✓ | |
| Fact priority dynamic adjust | ✓ | |
| ActiveContext store (받음) | ✓ | |
| Spike subscribe | | ✓ |
| Source monitor (LLM 판단) | | ✓ |
| Pragmatic gate (LLM 판단) | | ✓ |
| ActiveContext push (보냄) | | ✓ |
| 자연어 \"history\" → recall mode 변환 | | ✓ |
| PII redaction (발화 시) | | ✓ |

공유 schema (SpikeEvent, ActiveContext) = `@nextain/agent-types` (naia-agent#27).

## 6. 진짜 차별화 (cross-review 결론)

| 영역 | naia 결과 |
|---|---|
| Spike emit → Active brain inject | ✅ **진짜 새로움** — Letta/OpenClaw/mem0 모두 passive consolidation |
| Preservation-first system-wide invariant | ✅ **부분 차별** — Zep facts only / LangMem default only |
| Background consolidation 자체 | ❌ 재발명 (Letta sleeptime, OpenClaw Dreaming) |
| CLS / sleep replay 자체 | ❌ 재발명 (2025-2026 wave: SleepGate / SCM / NeuroDream / SuRe) |
| Source monitor framing | ❌ 학계 relabel |

⚠️ **위험**: preservation-first 만으로는 mem0 \"97.8% junk\" 같은 retrieval 약점 위험. **#27 retrieval ranking 강화 가 prerequisite**.

## 7. 측정 framework — unit / integration / long-term

### Unit (naia-memory 단독)
- Phase A AI Hub 141 (76.8% cosine 완료)
- Phase B-α R2.5 ledger (53.3% Gemini 완료)
- Phase B-γ A/B mechanism (in_progress, task #47)
- Phase B-δ 다른 KO dataset (task #48)

### Integration (naia-memory + naia-agent)
- naia-agent#26 의 source-monitor + pragmatic gate 측정
- spike subscribe e2e

### Long-term (naia-os daily ground)
- #30 사용자 daily ledger
- weekly self-eval
- monthly snapshot diff
- mechanism A/B (사용자 동의 시)

## 8. 빠진 항목 정리 (cross-review)

| 항목 | 위치 |
|---|---|
| Episode 보존 정책 명시 | #25 sub-task |
| Skill (procedural) R2.5 v2 적용 | #24 sub-task |
| Spike trigger 4개 추가 (DMN 등) | #26 update |
| PII redaction (naia-agent) | naia-agent issue 신설 필요 |
| 자연어 \"history\" → mode 변환 | naia-agent issue 신설 필요 |
| Working memory boundary | naia-agent context-manager + #6 |

## 9. Out of scope (R5+)

- LoCoMo 영어 직접 측정 (#17 — 별도)
- B-β R2.3 forgetting curve (사용자 directive: 컨텍스트 압축 작업과 결합, future)
- Multilingual (영어 외) — 우선 한국어 working baseline

## 10. Decision gate

각 Phase 의 진행 결정:
- **R3 → R4**: #25+#24 ship 후 Phase A 재측정 결과 *recall 변화 ≤ 5pp* (보존-first 가 정확도 손상 X 확인)
- **R4 → R5**: spike emit + subscribe 의 *unit 측정* 통과 (precision ≥ 80%)
- **R5 시작**: naia-os#240 통합 완료 + daily ledger 수집 1주 시작

## 11. naia-agent / naia-os 측 mirror

본 plan 의 R3+ 작업 중 naia-agent 책임:
- naia-agent#26 (Active brain)
- naia-agent#27 (schema)
- 신설 필요: PII redaction, NL \"history\" → mode

naia-os 측:
- naia-os#240 (통합)
- 신설 필요: 사용자 daily ledger 수집 (R5 prerequisite)
