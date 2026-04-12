# Alpha Memory 벤치마크 보고서 템플릿

**이 파일은 벤치마크 보고서 작성 절차와 구조에 대한 컨텍스트입니다.**

---

## 보고서 작성 절차

### 1. 데이터 수집

```python
# 모든 어댑터 결과 조회
python3 << 'PYEOF'
import json, os
adapters = [('adapter-name', '/tmp/glm-adapter.json'), ...]
for name, f in adapters:
    d = json.load(open(f))
    r = d['results'][0]
    no_judge = sum(1 for d2 in r['details'] if 'NO_JUDGE' in str(d2.get('reason','')))
    print(f'{name}: {r["core"]["passed"]}/{r["core"]["total"]}={r["core"]["rate"]*100:.1f}% NJ={no_judge}')
PYEOF
```

### 2. 세 AI 호출 방법

**데이터 브리핑 (상세 프롬프트):**
- `/tmp/bench_data_brief.txt` 에 벤치마크 실제 데이터 저장
- 어댑터 이름과 실제 수치를 **반드시** 제공해야 할루시네이션 방지
- 매트릭스/종합 순위 포함

**Claude 호출 (claude CLI):**
```bash
cat /tmp/prompt_claude.txt | claude -p --dangerously-skip-permissions > /tmp/analysis_claude.txt
```
- 배치 데이터 포인 영문으로 700자 제한 프롬프트
- 서명: [Claude Sonnet의 분석]

**Gemini 호출 (gemini CLI):**
```bash
cat /tmp/prompt_gemini.txt | gemini -p "" -m gemini-2.5-pro -o text > /tmp/analysis_gemini.txt
```
- UX/생태계 사용 충돌/신뢰도 관점 요청
- 서명: [Gemini의 분석]

**GLM 호출 (Z.AI API):**
```bash
GLM_API_KEY="xxx" node -e "
const fs = require('fs');
const prompt = fs.readFileSync('/tmp/prompt_glm.txt', 'utf8');
const url = 'https://api.z.ai/api/coding/paas/v4/chat/completions';
(async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.GLM_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'glm-5.1', messages: [{ role: 'user', content: prompt }], max_tokens: 8000, temperature: 0.5 })
  });
  const data = await res.json();
  fs.writeFileSync('/tmp/analysis_glm.txt', data.choices[0].message.content);
})();
"
```
- 구현/아키텍처 분석, Graphiti 이상 현상, 벤치마크 비판 요청
- **max_tokens=8000 필수** (글루ー5.1은 reasoning_content가 토큰 소모)
- **batch-size=5 권장** (GLM-5.1 지연 보상)
- 서명: [GLM-5.1의 분석]

### 3. 보고서 저장 위치

```
reports/
├── REPORT_TEMPLATE.md      ← 이 파일 (절차/템플릿)
├── r5-en-benchmark/
│   ├── report-ko.md         ← 한국어 보고서
│   └── report-en.md         ← 영문 보고서
├── r6-ko-benchmark/       ← 다음 번 (Korean R6)
│   ├── report-ko.md
│   └── report-en.md
└── runs/                  ← 원시 JSON 결과 파일
    ├── run-2026-04-11T.../
    └── ...
```

---

## 보고서 구조 (표준 섹션 순서)

### 한국어 버전 (report-ko.md)

```
1. 프로젝트 소개
   - AI는 왜 기억이 필요한가?
   - Alpha Memory 소개
   - 4-store 구조 표
2. 테스트 설계
   - 기본 설정 (언어/페르소나/항목수/Judge/응답 모델)
   - 비교 대상 N개 시스템 표
   - 채점 기준
3. 12가지 평가 카테고리 상세 설명
   - 카테고리명, 데이터 항목 수, 테스트 목적
   - 구체적인 예시 포함
4. 종합 결과
   - 최종 순위 표
   - 카테고리별 상세 점수 표
5. 세 AI의 분석
   - [Claude Sonnet의 분석]
   - [Gemini 2.5 Pro의 분석]
   - [GLM-5.1의 분석]
6. 세 AI의 토론: 합의 사항
   - 합의 1: abstention 역설
   - 합의 2: Graphiti 평가
   - 합의 3: Naia 개선 방향
7. Naia 개선 방향 상세 로드맵
   - P0: 버그 수정 (1-2 스프린트)
   - P1: 확신 게이트 (1-2 스프린트)
   - P2: Bi-temporal 모델 (1 분기)
   - P3: Dual-path retrieval (1 분기)
   - P4: 불확실성 레이어 (2026 H2)
8. 결론 및 다음 단계
9. 부록: 어댑터별 강점/약점
```

### 영문 버전 (report-en.md)

한국어 버전과 동일한 섹션 구조. 문체만 영문 번역.

---

## 중요 교훈

### GLM-5.1 호출 주의사항

1. **GLM-5.1은 reasoning 모델**: `reasoning_content`에 CoT 사고를 먹는다. `max_tokens=2000`이면 `content`가 비어 NO_JUDGE 발생
2. **보고서 작성 시 데이터 그라운딩 필수**: 프롬프트에 실제 어댑터 이름+수치 포함 안 하면 할루시네이션 발생
3. **배치=5 권장**: 더 큰 배치는 스탄 문제 발생 가능성 있음
4. **빈 컨텐츠 재시도**: 3번 시도, `2s/4s/6s` 백백오프 포함

### 완료 게이지 테스트 확인 방법

```python
# NO_JUDGE=0이면 완료
no_judge = sum(1 for d in r['details'] if 'NO_JUDGE' in str(d.get('reason','')))
if no_judge == 0: print(f'{name}: DONE {passed}/{total}={rate:.1f}%')
else: print(f'{name}: RUNNING NJ={no_judge}')
```

### 벤치마크 실행 명령

```bash
# 채점 (GLM-5.1, 배치=5)
\
GLM_API_KEY="xxx" pnpm exec tsx src/benchmark/comparison/judge.ts \
--input=/tmp/glm-ADAPTER.json --judge=glm-api --batch-size=5 \
> /tmp/glm-ADAPTER.log 2>&1 &

# 보고서 생성 (원본 맞을 때)
pnpm exec tsx src/benchmark/comparison/run-comparison.ts \
--adapters=naia,mem0,... --judge=keyword --lang=ko --cache-id=cache-ko
```

---

*작성: 2026-04-12 R5 EN 벤치마크 종료 후 도출*
