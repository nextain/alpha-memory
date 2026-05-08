# R3 Phase Comparison — backward compat verification (2026-05-08)

R2.5 v2 (chain + bi-temporal validity) + 보존 우선 (decay/prune/delete →
status archived + episode 보존 + KG/association weight 약화) 변경 후
Phase A 30 conv 재측정 결과.

## Recall axis 비교

| Axis | baseline (R2.5 v1, prune) | R3 변경 후 | Δ | 결론 |
|---|:-:|:-:|:-:|---|
| keyword recall@20 | 67.1% (492/733) | **67.9%** (498/733) | +0.8pp | noise band ✓ |
| cosine 0.7 recall@5 | 44.1% (100 conv) | 45.3% | +1.2pp | noise band ✓ |
| cosine 0.7 recall@10 | 66.9% | 65.8% | -1.1pp | noise band ✓ |
| **cosine 0.7 recall@20** | **76.8%** | **77.4%** | **+0.6pp** | noise band ✓ |
| Per-session S2 | 75.1% | 76.9% | +1.8pp | noise band ✓ |
| Per-session S3 | 70.4% | 70.4% | 0pp | identical |
| Per-session S4 | 68.2% | 66.8% | -1.4pp | noise band ✓ |

**모든 axis ±2pp noise band 안** — R3 변경의 *backward compat 완전 검증*.

## 시간 / cost

| Axis | baseline | R3 |
|---|:-:|:-:|
| Per-conv | 132초 | 131초 |
| LLM calls | 240 | 240 |
| Embed calls | 2823 | 2827 |
| Cost USD | $0.0416 | $0.0415 |

거의 동일. 보존 우선 변경 (status='archived' + 데이터 보존) 의 *runtime
overhead 미미*. 사용자 directive (\"recall latency 수용\") 의 trade-off
실제 발현 X — 즉 *현재 store 크기* 에서는 latency 증가 없음.

## R3 Phase 변경 사항 (review)

| Step | 변경 | 검증 |
|---|---|:-:|
| 1 | Fact schema (chain + bi-temporal validity) | ✓ optional fields, backward compat |
| 2 | R2.5 v2 supersede flow (index.ts 2 위치) | ✓ chain pointer 추가, status 유지 |
| 3-4 | recall mode option (latest/history/at-time) | ✓ + adversarial fix 3개 |
| 5-6 | decay/prune 보수적 + episode 보존 | ✓ + adversarial fix (Episode filter, KG/assoc 보존) |
| 7 | Phase A 재측정 — backward compat verify | ✓ noise band 안 |

## 사용자 directive 정합 (2026-05-08)

- ✅ 시간 연관 회상 + 장기기억 보존 — chain pointer + bi-temporal validity 추가
- ✅ 모든 mechanism 에서 삭제 보수적 — splice 제거 (decay, KG, association)
- ✅ recall latency 수용 — 현재 store 크기에선 미미, 임계 도달 (#29) 시 발현 예정
- 🟨 자연어 의도 파악 (\"history 보여줘\") = naia-agent 책임 — recall mode 옵션 노출 완료
- ✅ Background brain / Active brain 책임 분리 — 본 R3 단계는 인프라만, R4 가 mechanism

## 남은 후속 (별도 issue / R4-R5 phase)

| 항목 | 위치 |
|---|---|
| qdrant/mem0 adapter 의 decay 도 보수적 | 별도 issue (cross-adapter consistency) |
| rolling summary evict — working memory boundary | naia-agent 측 책임 |
| ConsolidationResult.memoriesPruned → memoriesArchived rename | minor refactor |
| delete() API deprecation marker 또는 archive(id) rename | minor refactor |
| factsValidAtTime() 의 validFrom/validTo 활용 | adversarial review fix #4 |
| history mode 의 chain group 단위 slice | adversarial review fix #5 |

## 다음 — #27 (Retrieval ranking 강화)

R3 (data model + 보존 우선) 완료. 다음 prerequisite:
- **#27 Retrieval ranking 강화** (HyDE / cross-encoder / threshold / MMR)
- preservation-first 의 *짝* — mem0 \"97.8% junk\" 회피
- 사용자 directive A09 (decision-matrix)
