# Benchmark v2 Fact Bank Design

**Goal**: Make airi (no-memory baseline) score ~0% by using LLM-impossible fictional facts with unique identifiers and distractor pairs.

## Problem with Current Fact Bank

Current facts use real-world domains (TypeScript, Neovim, Next.js) that LLMs have pre-training knowledge about. Even without memory, LLMs can guess plausible answers:
- "What editor do you use?" → LLM guesses popular editors (VS Code, Neovim, etc.)
- "What language do you code in?" → LLM guesses popular languages
- airi EN scores 41.6% from reasoning/logic categories that don't require memory

## v2 Design Principles

### 1. Completely Fictional Persona with Impossible-to-Guess Facts

Replace "Kim Haneul, startup CEO" with a persona whose facts contain **random unique identifiers** that no LLM could guess:

```
Current: "에디터는 Neovim 쓰고 있어"         → LLM can guess from common editors
v2:      "에디터는 Zepton-7 쓰고 있어"        → Impossible to guess (fictional product)
v2 alt:  "사번은 NX-4827-QZ야"               → Random ID, must be recalled exactly
```

### 2. Distractor Pairs for Every Fact

For each target fact, inject a **similar but conflicting** fact that tests precise retrieval:

```
Target:     "내 동생이 가장 좋아하는 과일은 두리안이야"  (F103)
Distractor: "내 동생이 가장 좋아하는 과일은 망고스틴이야" (F103d)
Query:      "내 동생이 좋아하는 과일 뭐야?"
Correct:    두리안 (NOT 망고스틴)
```

### 3. Fact Structure (v2)

```json
{
  "id": "F01",
  "domain": "identity",
  "statement": "나는 루아야. 회사 코드는 XR-7291이야",
  "entities": ["루아", "XR-7291"],
  "extractable_facts": ["이름: 루아", "회사코드: XR-7291"],
  "distractor": {
    "id": "F01d",
    "statement": "나는 미카야. 회사 코드는 ZL-3847이야",
    "shared_concept": "이름과 회사코드"
  },
  "temporal_updates": [
    {
      "id": "F01u1",
      "statement": "회사 코드가 QW-0053으로 바뀌었어",
      "replaces_extractable": "회사코드: XR-7291 → QW-0053"
    }
  ]
}
```

### 4. Domain Distribution (same 10 domains, 100 facts each)

| Domain | Example Facts (fictional) | Unique IDs |
|--------|--------------------------|------------|
| identity | 이름: 루아, 사번: NX-4827-QZ, 혈액형: AB- (random) | 사번, 코드 |
| tech | 에디터: Zepton-7, 언어: Glint, 프레임워크: Vapor | 버전: 3.14.7 |
| preference | 좋아하는 색: 틸(teal-#36B5A0), 영화: "별의 속삭임" | RGB코드 |
| personal | 거주지: 블루문시 선로구 42번길 17, 반려동물: 고양이 "모카" | 주소번호 |
| work | 회사: 넥스필드, 부서: 데이터솔루션팀, 층: 17층 | 내선번호 |
| hobby | 취미: 키라미(보드게임), 등산: 블루크릭 산맥 | 랭킹: 3.14 |
| temporal | 입사: 2023년 3월 14일, 이사: 2024년 8월 21일 | 구체 날짜 |
| finance | 월세: 157만원, 적금: 매월 83만원 | 구체 금액 |
| social | 친구: 시은, 하준, 유나 — 직업 각각 다름 | 전화번호 뒷자리 |
| health | 알레르기: 메밀, 약: 글루코핀 25mg | 병원등록번호 |

### 5. Query Template Changes

Each query must require **exact recall of unique identifiers**:

```json
{
  "query": "회사 코드 뭐야?",
  "fact": "F01",
  "expected_contains": ["XR-7291"],
  "expected_not_contains": ["ZL-3847"],
  "fail_signal": ["모르", "기억에 없"]
}
```

For distractor-aware queries:
```json
{
  "query": "내 동생이 좋아하는 과일 뭐야?",
  "fact": "F103",
  "expected_contains": ["두리안"],
  "expected_not_contains": ["망고스틴"],
  "distractor_note": "F103d states 망고스틴 — must distinguish"
}
```

### 6. Expected Impact

| Metric | Current (v1) | Expected (v2) |
|--------|-------------|---------------|
| airi EN score | 41.6% | ~0-2% |
| airi KO score | 16.0% | ~0-2% |
| Judge agreement (EN) | 14-84% | 85-99% |
| Distractor detection | N/A | New metric |
| Exact recall required | ~60% | ~95% |

### 7. Peer Review Feedback (Claude Opus + Gemini CLI, 2026-04-20)

**공통 지적 (양쪽 모두 동의):**

1. **고유 ID 과다 위험**: 랜덤 ID(NX-4827-QZ)가 "문자열 회수 테스트"로 변질. 토크나이저 편향 발생. → **해결: ID 팩트 20%로 제한, 80%는 자연어 서술형**
2. **Distractor 유형 다양화 필요**: 동일 스키마 다른 값만 있음. → **해결: 부분 일치, 부정, 조건부, 계층적 유사성 distractor 추가**
3. **0-3점 채점 척도**: 이진 PASS/FAIL이 disagreement 근원. → **해결: 0(환각) / 1(관련은 하지만 틀림) / 2(핵심 맞으나 세부 오류) / 3(완전 일치)**
4. **생태적 타당성**: 허구 팩트가 실제 사용자 메모리 패턴과 유사해야 함. → **해결: 실제 메모리 로그 분포 기반 도메인/복잡도 매칭**
5. **추론형 문항 부재**: 단순 회수뿐 아니라 "기억 기반 추론" 필요. → **해결: "사번 마지막 숫자", "동생 알레르기 있는 과일" 등 추론 문항 추가**
6. **저장 품질 미측정**: 실패의 절반이 저장 단계에서 발생. → **해결: Storage quality 별도 축 (중복률, 모순 탐지율, 저장 엔트리 수)**

### 8. Implementation Plan

1. Generate v2 fact bank with Python script (1000 facts × 2 distractors each)
2. Generate matching query templates
3. Run airi baseline first — if > 5%, tighten prompts
4. Run all 8 adapters on v2
5. Compare v1 vs v2 scores — expect score drops across the board (more honest measurement)

---

*Design document: 2026-04-20*
*Status: Design phase — implementation pending approval*
