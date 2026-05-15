# Naia Memory (formerly Alpha Memory)

> # ✅ STATUS: SHIP-READY for naia-agent integration (2026-05-07)
>
> **Phase A 한국어 R2.3 measurement 완료** (#23):
> - 100 conv (AI Hub 141 한국어 멀티세션 대화), recall@20 cosine 0.7 = **76.8%**
> - 사용자 directive "1등 X, 한국어 쓸만함" 정확 부합
>
> **확장성 강화 완료 (Hardened SQLite, #221)**:
> - **SqliteAdapter 도입**: R-Tree(시계열), FTS5(키워드), vec0(네이티브 벡터) 통합.
> - **성능**: 10,000건 기준 검색 속도 5.4배 향상, 1M+ 데이터 스케일 지원 준비 완료.
> - **정직한 랭킹**: SQL-level RRF를 통해 투명하고 수학적인 기억 인출 구현.
>
> **자가 개선 철학 (Self-Improvement Philosophy)**:
> - **내부적 엄격함 우선**: SOTA 집착보다 스스로의 기준에 정직한 발전을 지향한다.
> - **적대적 리뷰 루프**: [실험 → 적대적 리뷰 → 정직한 개선 → 동기화] 무한 루프 가동.
> - **과적합 경계**: 벤치마크 점수를 위한 꼼수나 과적합을 철저히 배제한다.

## Mandatory Reads (Project Level)

1. `.agents/progress/cognitive-memory-gold-standard.md` ← **최상위 목표**
2. `.agents/progress/plan-v3-anchor-2026-05-02.md` ← **현 아키텍처 SoT**
3. `.agents/progress/decision-matrix.md` ← 의사결정 이력

## 핵심 잠금 사항 (Anti-Drift Anchors)

1. **MemoryProvider interface 충실 구현** (`@nextain/agent-types`)
2. **mem0 위에 stack on top** — 코드 결합 X
3. **자연어 의도 파악 및 대화 제어는 naia-agent 책임** — naia-memory는 인지적 회상/공고화 로직만 담당.
4. **로컬 모델 백엔드(ko-serve 등)와 분리**: `naia-minicpm-ko-serve`는 순수 모델 추론만 담당하며, RAG/장기기억 주입은 `naia-agent`가 `naia-memory`를 사용하여 수행한다. ko-serve가 보고하는 'turn-accumulation drift' 등의 성능 지표를 기반으로, `naia-memory`가 적시에 과거 맥락을 주입(Spike)하여 모델 레이어의 한계를 agent 레이어에서 보완한다.
5. **Capability pattern** — `isCapable<>()` graceful degradation
6. **Adapter swap 가능** — 어떤 backend든 contract-tests 통과
7. **보존 우선 + 정직한 망각**: 데이터 보존을 원칙으로 하되, '의미적 공고화'를 통해 지혜로 압축한다.

## Project Structure

```
src/
├── memory/                    # Core cognitive memory system
│   ├── index.ts               # MemorySystem — orchestrator (Spike, Consolidation)
│   ├── adapters/
│   │   ├── local.ts           # 현행 엔진: SQLite(전환중) + BM25 + KG
│   │   └── ...
```

## Key Commands

```bash
pnpm install
# Tests
pnpm exec vitest run
# SQLite Migration Tracking
cat .agents/progress/issue-221-scalability-hardening-loop.json
```

## Conventions

- TypeScript ESM, Node ≥ 22, strict
- Package: `@nextain/naia-memory`
- **Anti-overfitting**: 범용 단일 전략만 허용, 카테고리별 적응형 가중치 금지
