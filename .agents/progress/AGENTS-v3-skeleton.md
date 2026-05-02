# AGENTS.md v3 — 스켈레톤 (R1.4 머지 대기)

**상태**: Plan v1.1 cross-review PASS 후 작성. 기존 `AGENTS.md` 와 병합 필요 (R1.4 슬라이스).

> **참고**: 본 파일은 R1.4 슬라이스에서 기존 `naia-memory/AGENTS.md` (535 lines, 옛날 R5/R8/R9 컨텍스트) 와 병합 → 통합 AGENTS.md 작성. 그 전까지 본 파일은 progress/ 안의 reference.

---

# naia-memory

4-repo Naia 생태계의 **MemoryProvider 레퍼런스 구현**.

| 레포 | 역할 |
|---|---|
| `naia-os` | Host (Tauri shell + 3D avatar + OS 이미지) |
| `naia-agent` | Runtime 엔진 + 공개 인터페이스 SoT (`@nextain/agent-types`) |
| `naia-adk` | 워크스페이스 포맷 + 스킬 표준 |
| **`naia-memory`** (이 레포) | MemoryProvider 레퍼런스 구현 |

원칙: **Interfaces, not dependencies** — 공개 인터페이스로만 결합, 런타임 결합 금지.

---

## Mandatory Reads (every session start)

코드를 만지기 전에 다음을 순서대로 읽는다 — 순서 중요:

1. **현 plan + anchor**: `.agents/progress/plan-v3-anchor-2026-05-02.md` ← 모든 작업의 SoT
2. **결정 매트릭스**: `.agents/progress/decision-matrix.md`
3. **상위 directive**: `../../.agents/progress/direction-2026-04-25.md`
4. **MemoryProvider interface**: `../naia-agent/packages/types/src/memory.ts`
5. **wire spec**: `../naia-agent/docs/naia-memory-wire.md`

룰 데이터: `.agents/context/agents-rules.json` (있으면, 없으면 본 파일이 SoT).

---

## 핵심 원칙 (변경 금지)

1. **MemoryProvider interface 충실 구현** — 재정의 X
2. **mem0 위에 stack on top** — 코드 결합 X (사용자 directive 2026-05-02)
3. **자연어 의도 파악은 naia-agent 책임** — naia-memory 는 검색 로직만
4. **Capability pattern 사용** — `isCapable<>()` graceful degradation
5. **Adapter swap 가능** — 어떤 backend 든 contract-tests 통과

---

## 책임 경계

| 책임 | 위치 |
|---|---|
| MemoryProvider interface 정의 | naia-agent (`@nextain/agent-types`) |
| encode + recall + 랭킹 + decay + importance gating | **naia-memory** |
| compact (장기 대화 요약) | naia-memory (CompactableCapable) |
| 모순 감지 (findContradictions) | naia-memory (ReconsolidationCapable) |
| 시간 decay + atTimestamp recall | naia-memory (TemporalCapable) |
| **자연어 의도 파악** ("어제" → ts) | naia-agent |
| **Abstention decision** | naia-agent (memory score 받아 LLM 판단) |
| Interface 호출 + 결과 inject | naia-agent |
| Adapter swap / fallback | host (naia-os) |

---

## 작업 규칙

### 코드 변경 전 필수 (체크 4건)

1. `plan-v3-anchor-2026-05-02.md` 의 §0 (anchor) 와 §3 (개발 표준) 읽었는가?
2. 변경하려는 패턴이 `decision-matrix.md` §A 에 있는가? (있으면 따른다)
3. §B (거부) 항목이 아닌가?
4. §C (pending) 결정 필요한가?

### Slice 머지 차단 게이트 (4 모두 필수)

1. **새 실행 가능 명령** — `pnpm exec ...` 사용자 가치 1줄
2. **단위 테스트 1+** — vitest, no I/O
3. **통합 검증 1+** — fixture-replay 또는 real-LLM smoke
4. **README/CHANGELOG entry** — 사용자 향한 변화

(c) 통합 검증 부재 = **머지 거부** (NO EXCEPTIONS).

### Cross-Review §Y

소스/테스트 변경 시 2 다른 reviewer (다른 AI 모델) clean 통과 필수.
"clean" 8 체크리스트는 plan §3.2 참조.
충돌 시 3차 reviewer → 다수결.

---

## 절대 금지 (forbidden_actions)

| ID | 항목 |
|---|---|
| F-MEM-01 | mem0 코드 결합 금지 (fork / vendor / private API X) |
| F-MEM-02 | MemoryProvider interface 재정의 금지 |
| F-MEM-03 | naia-memory 안에서 자연어 의도 파악 금지 |
| F-MEM-04 | PII raw 로깅 금지 (hash 만) |
| F-MEM-05 | API key 노출 금지 (env var 이름만 OK) |
| F-MEM-06 | Architectural drift 시 머지 차단 |

---

## 빌드 / 테스트 / 명령

| 명령 | 동작 |
|---|---|
| `pnpm install` | 의존성 설치 |
| `pnpm build` | tsc --build |
| `pnpm test:unit` | vitest unit (no I/O) |
| `pnpm test:fixture` | fixture-replay |
| `pnpm test:contract` | adapter contract tests (R4) |
| `pnpm test:smoke` | real-LLM smoke (KEY 필요) |
| `pnpm bench` | K-MemBench + LoCoMo subset |

---

## 진행 트래킹

- **Master plan**: `.agents/progress/plan-v3-anchor-2026-05-02.md`
- **Decision matrix**: `.agents/progress/decision-matrix.md`
- **Cross-review logs**: `.agents/progress/cross-review-log-r{N}.md`

---

## 컨텍스트 SoT 우선순위 (2026-05-02 현재)

```
.agents/context/agents-rules.json (있으면)
  > .agents/progress/plan-v3-anchor-2026-05-02.md  ← 현 SoT
  > AGENTS.md (이 파일, R1.4 후)
  > 기존 R5/R8/R9 컨텍스트 (archive)
```

---

## 기존 AGENTS.md 와의 관계

기존 `naia-memory/AGENTS.md` (535 lines) 는 R5-R14 시기 컨텍스트:
- 4-store cognitive memory (유지)
- 12 카테고리 벤치마크 (R6/R8/R9/R10/R14)
- 기존 알려진 이슈 (alpha-memory#5, #8, #9, #12)

**R1.4 슬라이스에서 병합 작업**:
1. 본 v3 skeleton 의 컨텍스트 잠금 + 책임 경계 + Slice 게이트 등 보존
2. 기존 AGENTS.md 의 4-store / 벤치마크 결과 / 알려진 이슈 → archive 또는 통합
3. plan-v3-anchor 가 SoT 임을 명시
4. cross-review §Y PASS 후 머지

본 파일은 R1.4 머지 시까지 reference.
