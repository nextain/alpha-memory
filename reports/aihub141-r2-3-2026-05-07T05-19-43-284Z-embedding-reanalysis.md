# AI Hub 141 R2.3 — Embedding Cosine 재해석

**Source**: `reports/aihub141-r2-3-2026-05-07T05-19-43-284Z.json`
**Adapter**: naia-local

> Hard match 0% 의 진짜 의미 측정. naia atomic fact paraphrase 가 의미 보존했는지 embedding cosine 로 검증.

## Embedding setup

- Provider: vertexai:gemini-embedding-001 (3072d)
- Unique facts: 2564
- Embed time: 159.3s
- Cost: $0.0054 (26 calls, 35933 tokens)

## Cosine recall@K (threshold sweep)

| threshold | recall@5 | recall@10 | recall@20 |
|---|---|---|---|
| 0.5 | 99.9% | 99.9% | 99.9% |
| 0.6 | 95.0% | 98.9% | 99.5% |
| 0.65 | 60.7% | 83.7% | 89.5% |
| 0.7 | 44.1% | 66.9% | 76.8% |
| 0.75 | 35.1% | 56.6% | 67.3% |
| 0.8 | 27.0% | 43.5% | 53.2% |

## 의미 분석

- threshold 0.5 = *느슨* (paraphrase 인정 폭 큼)
- threshold 0.7 = *통상* (semantic similarity 일반 cutoff)
- threshold 0.8 = *엄격* (거의 동일 의미만)

hard match 0% 의 진짜 의미 = surface 다르지만 의미 보존된 paraphrase 비율을 cosine 으로 측정 가능.
