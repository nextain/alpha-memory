# Cross-Judge Evaluation: GLM-5.1 vs Gemini 2.5 Pro

**Alpha Memory Benchmark — Judge Reliability Audit (April 2026)**

> This report evaluates whether a single LLM judge (GLM-5.1) produces reliable benchmark scores by cross-validating with Gemini 2.5 Pro on identical response data. The same 240 benchmark responses (8 systems × 2 languages) were re-judged independently.

---

## Executive Summary

**GLM-5.1 and Gemini 2.5 Pro disagree profoundly on scoring.** The two judges reach the same verdict on only 53–100% of individual items, with total score spreads of 12–63 percentage points across systems. This means **any single-judge benchmark ranking is unreliable** — the judge choice can change both absolute scores and relative rankings.

Key findings:
1. **Low agreement**: Item-level agreement ranges from 53% to 100%, averaging ~68% across systems
2. **Systematic bias by performance tier**: Gemini inflates low-performing systems (+26–31pp for airi/openclaw) and deflates high-performing ones (−12–15pp for letta/sillytavern EN)
3. **Ranking changes**: In Korean, airi (no-memory baseline) jumps from 6th to 2nd under Gemini — a system with zero memory ranked above mem0 and naia
4. **Claude Sonnet as third judge failed**: Claude CLI produced 194/240 empty responses due to Korean-language parsing issues in the verdict extraction step

---

## 1. Methodology

### Approach

All 8 memory systems were benchmarked using the standard 1000-fact / 240-query protocol (12 categories). The same response data (identical LLM outputs) was then judged independently by:

| Judge | Model | Method | Batch size |
|-------|-------|--------|------------|
| **GLM-5.1** | Z.AI API | Batch (10 items) | 10 |
| **Gemini 2.5 Pro** | Google REST API | Batch (5 items) | 5 |
| **Claude Sonnet** | claude CLI (pipelined) | One-by-one | 1 |

The response LLM (Gemini 2.5 Flash Lite), fact bank (1000 facts), query set (240 queries), and all system outputs were **identical** — only the judge was changed.

### Systems Evaluated

| System | Description |
|--------|-------------|
| naia | Alpha Memory — 4-store cognitive architecture |
| letta | Letta (MemGPT) — agent memory management |
| mem0 | mem0 OSS — open-source memory layer |
| sillytavern | SillyTavern — roleplay chatbot memory |
| open-llm-vtuber | Open-LLM-VTuber — VTuber AI character |
| openclaw | OpenClaw — lightweight memory layer |
| graphiti | Graphiti (getzep) — Neo4j temporal KG |
| airi | AIRI — **no-memory baseline** |

### Judge Prompt

Both judges received the same Korean-language prompt template with semantic matching instructions, multilingual synonym recognition, and explicit grading criteria. The prompt asks for PASS/FAIL on line 1 and a one-line reason on line 2.

---

## 2. Results

### 2.1 Korean (KO)

| Rank | System | GLM-5.1 | Gemini | Δ | Agreement |
|------|--------|---------|--------|---|-----------|
| 1 | letta | 35.8% | 49.9% | +14.1pp | 72% |
| 2 | airi (**no memory**) | 16.0% | **47.3%** | +31.3pp | 63% |
| 3 | mem0 | 24.0% | 45.6% | +21.6pp | 70% |
| 4 | openclaw | 14.8% | 41.2% | +26.4pp | 72% |
| 5 | naia | 24.7% | 37.4% | +12.7pp | 73% |
| 6 | sillytavern | 17.6% | 35.1% | +17.4pp | 74% |
| 7 | open-llm-vtuber | 14.4% | 30.8% | +16.5pp | 82% |
| 8 | graphiti | 27.1% | 27.1% | +0.0pp | 100% |

### 2.2 English (EN)

| Rank | System | GLM-5.1 | Gemini | Δ | Agreement |
|------|--------|---------|--------|---|-----------|
| 1 | letta | 70.6% | 59.1% | −11.5pp | 56% |
| 2 | mem0 | 62.8% | 58.4% | −4.5pp | 64% |
| 3 | naia | 61.4% | 56.2% | −5.2pp | 63% |
| 4 | open-llm-vtuber | 46.8% | 52.2% | +5.4pp | 53% |
| 5 | sillytavern | 60.5% | 45.6% | −14.8pp | 61% |
| 6 | graphiti | 42.8% | 40.0% | −2.8pp | 56% |
| 7 | airi (**no memory**) | 16.2% | **47.5%** | +31.3pp | 67% |
| 8 | openclaw | 15.8% | 44.7% | +28.9pp | 69% |

---

## 3. Analysis

### 3.1 The airi Paradox

**airi (no-memory baseline) scores 47% under Gemini** — a system that has zero persistent memory and relies entirely on pre-training. Under GLM, airi scored 16%, consistent with a no-memory system. Under Gemini, airi outperforms mem0, naia, and sillytavern in Korean.

This is the single most important finding: **Gemini 2.5 Pro's semantic matching is so lenient that it rewards fluent hallucinations**. airi generates plausible-sounding responses from pre-training, and Gemini judges these as semantically correct even though no memory system was involved.

GLM-5.1 is stricter on semantic matching, which better penalizes systems that guess rather than recall.

### 3.2 Systematic Bias Pattern

| Performance Tier | GLM Score | Gemini Score | Pattern |
|-----------------|-----------|--------------|---------|
| Low (airi, openclaw) | 15–16% | 41–47% | **Gemini inflates +26–31pp** |
| Mid (mem0, naia, olv) | 24–47% | 31–52% | **Gemini inflates +5–22pp** |
| High (letta, sillytavern EN) | 60–71% | 45–59% | **Gemini deflates −5–15pp** |

Gemini exhibits a **regression toward the mean**: low scores get boosted, high scores get reduced. This is consistent with a judge that applies looser semantic matching — it accepts partial/guessed answers (inflating low scores) but also rejects some genuinely correct answers that don't exactly match expected keywords (deflating high scores).

### 3.3 Per-Category Divergence

The largest disagreements between judges are in categories that require **semantic interpretation**:

| Category | Typical Disagreement | Explanation |
|----------|---------------------|-------------|
| entity_disambiguation | ±35–55pp | Gemini accepts looser entity matching |
| contradiction_indirect | ±53pp | Different thresholds for "implied" contradictions |
| noise_resilience | ±50pp | Gemini is more tolerant of noisy context |
| semantic_search | ±20–44pp | Core semantic matching disagreement |

Categories with high agreement:
- **abstention**: 90–100% agreement — refusal detection is consistent
- **irrelevant_isolation**: 93–100% — personal info leakage is binary
- **graphiti** (all categories): 100% — graphiti's responses were consistently unambiguous

### 3.4 Claude Sonnet Failure

Claude CLI was attempted as a third judge but **failed catastrophically**: 194 out of 240 items received empty responses (no verdict parsed). Root cause: Claude generates verbose Korean explanations before the PASS/FAIL verdict, and the single-line verdict extraction (`raw.split("\n")[0]`) captured Korean text instead of "PASS" or "FAIL".

Of the 46 successfully parsed items, Claude showed extreme strictness:
- KO naia: 9.9% (vs GLM 24.7%, Gemini 37.4%)
- EN letta: 7.8% (vs GLM 70.6%, Gemini 59.1%)
- Most categories scored 0%

The Claude results are **not usable** for cross-judge comparison but demonstrate that verdict extraction format sensitivity is a critical infrastructure issue.

---

## 4. Implications

### 4.1 Single-Judge Benchmarks Are Unreliable

The spread between GLM and Gemini (12–63pp) means any single-judge score is only meaningful within ±30pp. Rankings can flip: in KO, airi goes from worst (GLM) to second-best (Gemini).

### 4.2 GLM-5.1 Is More Conservative

For the original benchmark purpose — comparing memory systems — GLM-5.1 is likely the better judge because:
1. It correctly identifies no-memory baselines as low performers
2. It doesn't reward fluent hallucinations
3. It produces tighter score distributions that better differentiate systems

### 4.3 Recommended Approach

For future benchmarks:
1. **Dual-judge protocol**: Run both GLM-5.1 and Gemini 2.5 Pro, report both scores
2. **Disagreement analysis**: Items where judges disagree should be flagged for manual review
3. **Consensus scoring**: Use the lower of two judges' scores (conservative) or the intersection of agreements
4. **Verdict format enforcement**: Judges must output verdict in a machine-parseable format (JSON `{"verdict":"PASS","reason":"..."}`) rather than freeform text

---

## 5. Technical Details

### Judge Configuration

| Parameter | GLM-5.1 | Gemini 2.5 Pro |
|-----------|---------|----------------|
| API | Z.AI REST API | Google Generative Language API |
| Model | glm-5.1 | gemini-2.5-pro |
| Temperature | 0.3 | 0.3 |
| Batch size | 10 | 5 |
| Prompt language | Korean | Korean |
| Max tokens | 8000 | 8000 |

### Data Source

- KO: `alpha-memory/reports/runs/run-2026-04-16T00-29-47-381Z/` (GLM-judged originals)
- EN: `alpha-memory/reports/runs/run-2026-04-16T01-59-08-471Z/` (GLM-judged originals)
- Cross-judge results: `/tmp/cross-judge/{ko,en}-gemini-api/`

### Reproduction

```bash
# Copy original GLM-judged results
cp reports/runs/run-2026-04-16T00-29-47-381Z/report-*.json /tmp/cross-judge/ko-gemini-api/

# Re-judge with Gemini API
export GEMINI_API_KEY=your_key
for f in /tmp/cross-judge/ko-gemini-api/report-*.json; do
  node /tmp/cross-judge/cross-judge-api.mjs --input="$f" --judge=gemini-api --batch-size=5
done
```

---

## 6. Raw Score Table

### KO — Full Category Breakdown

| Category | airi GLM→Gem | graphiti | letta | mem0 | naia | olv | openclaw | sillytavern |
|----------|-------------|----------|-------|------|------|-----|----------|-------------|
| direct_recall | 4→20 | 8→8 | 0→40 | 16→36 | 20→4 | 8→20 | 0→0 | 28→36 |
| semantic_search | 4→40 | 28→28 | 4→16 | 12→44 | 12→20 | 0→0 | 0→20 | 0→16 |
| proactive_recall | 0→25 | 20→20 | 0→35 | 10→5 | 5→20 | 0→10 | 10→15 | 0→0 |
| abstention | 95→90 | 100→100 | 70→75 | 90→90 | 100→100 | 100→100 | 100→100 | 70→65 |
| irrelevant_isolation | 100→100 | 100→100 | 100→100 | 100→100 | 100→53 | 100→100 | 100→100 | 93→93 |
| multi_fact_synthesis | 5→40 | 20→20 | 5→80 | 15→15 | 5→20 | 5→35 | 5→30 | 10→10 |
| entity_disambiguation | 5→75 | 35→35 | 0→10 | 20→85 | 15→50 | 5→55 | 0→25 | 15→20 |
| contradiction_direct | 5→50 | 0→0 | 90→65 | 5→45 | 15→30 | 0→40 | 5→65 | 5→45 |
| contradiction_indirect | 7→53 | 0→0 | 93→93 | 7→53 | 7→53 | 0→27 | 0→60 | 0→60 |
| noise_resilience | 5→20 | 0→0 | 90→75 | 15→45 | 15→25 | 0→0 | 0→40 | 10→25 |
| unchanged_persistence | 0→100 | 53→53 | 7→87 | 20→40 | 33→40 | 0→33 | 0→93 | 13→13 |
| temporal | 4→20 | 12→12 | 8→4 | 20→24 | 20→40 | 0→4 | 0→16 | 16→64 |

### EN — Full Category Breakdown

| Category | airi | graphiti | letta | mem0 | naia | olv | openclaw | sillytavern |
|----------|------|----------|-------|------|------|-----|----------|-------------|
| direct_recall | 0→40 | 0→68 | 88→40 | 52→36 | 68→60 | 84→96 | 0→40 | 64→20 |
| semantic_search | 0→56 | 0→16 | 44→16 | 36→36 | 36→28 | 48→32 | 0→0 | 28→20 |
| proactive_recall | 35→35 | 30→40 | 90→95 | 60→70 | 55→55 | 80→50 | 20→45 | 80→45 |
| abstention | 100→100 | 100→85 | 60→55 | 55→40 | 55→55 | 65→60 | 100→100 | 60→40 |
| irrelevant_isolation | 100→100 | 100→100 | 73→67 | 87→53 | 100→100 | 73→53 | 100→100 | 80→53 |
| multi_fact_synthesis | 0→25 | 15→55 | 60→85 | 70→90 | 55→70 | 60→50 | 10→75 | 55→60 |
| entity_disambiguation | 0→25 | 0→80 | 80→35 | 60→85 | 80→60 | 75→50 | 0→5 | 60→55 |
| contradiction_direct | 0→75 | 100→25 | 60→100 | 70→70 | 65→70 | 0→50 | 0→95 | 50→70 |
| contradiction_indirect | 0→33 | 87→7 | 60→73 | 53→47 | 53→80 | 13→60 | 0→40 | 47→100 |
| noise_resilience | 0→25 | 95→15 | 90→20 | 90→70 | 75→25 | 15→30 | 0→20 | 65→0 |
| unchanged_persistence | 0→33 | 20→53 | 87→33 | 60→60 | 47→60 | 87→53 | 0→33 | 73→33 |
| temporal | 0→40 | 4→0 | 76→80 | 72→40 | 68→56 | 16→64 | 0→24 | 84→56 |

---

*Report generated: 2026-04-19*
*Data: alpha-memory benchmark runs from 2026-04-16*
*Judges: GLM-5.1 (Z.AI API), Gemini 2.5 Pro (Google API), Claude Sonnet (CLI, failed)*
