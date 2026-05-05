/**
 * ContradictionFilterProvider — dual-process contradiction detection.
 *
 * Implements retrieval-rerank: a broad candidate set (entity / cosine match)
 * is narrowed down to actual contradictions by a small reasoning model.
 * Mirrors human ACC (conflict detection) → PFC (resolution) division of
 * labour, in line with naia-memory's brain-inspired architecture
 * (`types.ts` Tulving + CLS, importance.ts CraniMem, decay.ts Ebbinghaus).
 *
 * Implementations:
 * - HeuristicFilter        — keyword / state-verb patterns (existing logic)
 * - GeminiFlashLiteFilter  — small cloud LLM (default when GEMINI_API_KEY set)
 * - VllmReasoningFilter    — local Gemma via vLLM (future, GPU-bound)
 *
 * Selection priority (env, see `selectFilter`):
 *   VLLM_REASONING_BASE > GEMINI_API_KEY > heuristic
 *
 * Refs: nextain/alpha-memory#14, plan-v3-anchor §4 R2.5
 */

import {
	type ReconsolidationResult,
	checkContradiction as heuristicCheckContradiction,
} from "./reconsolidation.js";
import type { Fact } from "./types.js";

export interface ContradictionCandidate {
	existing: Fact;
	newInfo: string;
}

export interface ContradictionVerdict {
	/** Index into the input candidates array (preserved for caller correlation). */
	index: number;
	result: ReconsolidationResult;
}

export interface ContradictionFilterProvider {
	readonly name: string;
	/** Inspect candidate (existing fact, new info) pairs and return non-"keep" verdicts.
	 *  "keep" verdicts may be filtered out — caller treats absent index as "keep". */
	filter(candidates: readonly ContradictionCandidate[]): Promise<ContradictionVerdict[]>;
}

// ─── Heuristic ─────────────────────────────────────────────────────────────

/** Wraps the existing keyword-pattern `checkContradiction` for contract parity.
 *  Acts as both the offline default and the fallback for cloud-LLM unavailable. */
export class HeuristicContradictionFilter implements ContradictionFilterProvider {
	readonly name = "heuristic";

	async filter(
		candidates: readonly ContradictionCandidate[],
	): Promise<ContradictionVerdict[]> {
		const verdicts: ContradictionVerdict[] = [];
		for (let i = 0; i < candidates.length; i++) {
			const c = candidates[i]!;
			const result = heuristicCheckContradiction(c.existing, c.newInfo);
			if (result.action !== "keep") verdicts.push({ index: i, result });
		}
		return verdicts;
	}
}

// ─── Gemini Flash Lite ─────────────────────────────────────────────────────

export interface GeminiFlashLiteFilterOptions {
	apiKey: string;
	baseURL?: string;
	model?: string;
	/** Per-call candidate cap (large batches degrade JSON adherence). Default: 10 */
	batchSize?: number;
}

const GEMINI_DEFAULT_BASE_URL =
	"https://generativelanguage.googleapis.com/v1beta/openai/";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash-lite";
const GEMINI_DEFAULT_BATCH_SIZE = 10;

/** LLM-based contradiction filter using Gemini Flash Lite (cloud).
 *  Sends candidate pairs in a structured prompt and asks the model to
 *  decide, per pair, whether the new info contradicts the existing fact
 *  *for the same entity / attribute*.
 */
export class GeminiFlashLiteContradictionFilter
	implements ContradictionFilterProvider
{
	readonly name = "gemini-flash-lite";
	private readonly apiKey: string;
	private readonly baseURL: string;
	private readonly model: string;
	private readonly batchSize: number;

	constructor(options: GeminiFlashLiteFilterOptions) {
		this.apiKey = options.apiKey;
		this.baseURL = options.baseURL ?? GEMINI_DEFAULT_BASE_URL;
		this.model = options.model ?? GEMINI_DEFAULT_MODEL;
		this.batchSize = options.batchSize ?? GEMINI_DEFAULT_BATCH_SIZE;
	}

	async filter(
		candidates: readonly ContradictionCandidate[],
	): Promise<ContradictionVerdict[]> {
		if (candidates.length === 0) return [];
		const verdicts: ContradictionVerdict[] = [];
		for (let i = 0; i < candidates.length; i += this.batchSize) {
			const batch = candidates.slice(i, i + this.batchSize);
			const batchResults = await this.callLLMOrFallback(batch, i);
			verdicts.push(...batchResults);
		}
		return verdicts;
	}

	private async callLLMOrFallback(
		batch: readonly ContradictionCandidate[],
		offset: number,
	): Promise<ContradictionVerdict[]> {
		try {
			return await this.callLLM(batch, offset);
		} catch (err) {
			console.warn(
				`[GeminiFlashLiteContradictionFilter] API failure, falling back to heuristic: ${(err as Error).message}`,
			);
			const fallback = new HeuristicContradictionFilter();
			const local = await fallback.filter(batch);
			return local.map((v) => ({ ...v, index: v.index + offset }));
		}
	}

	private async callLLM(
		batch: readonly ContradictionCandidate[],
		offset: number,
	): Promise<ContradictionVerdict[]> {
		const pairsText = batch
			.map(
				(c, i) =>
					`[${i + 1}]\n  existing: ${JSON.stringify(c.existing.content)}\n  new:      ${JSON.stringify(c.newInfo)}\n  entities: ${JSON.stringify(c.existing.entities)}`,
			)
			.join("\n");

		const prompt = `You are a contradiction detector for a memory system. For each pair below, decide whether the "new" information contradicts the "existing" fact about the *same entity and the same attribute* (e.g. same person's location, same tool used, same preference).

Output JSON only. For each pair index N from 1..${batch.length}, emit:
  {"N": {"contradiction": true|false, "reason": "<short>"}}

Treat as contradiction:
- Same entity, same attribute, different value (e.g. "lives in Seoul" → "moved to Tokyo")
- Same tool/preference replaced (e.g. "uses Neovim" → "switched to Cursor", "Git CLI 만 써" → "Git은 이제 GitKraken 쓰기로 했어")
- Reaffirmation or addition is NOT contradiction
- Different entity / attribute is NOT contradiction

Pairs:
${pairsText}

Return ONLY a JSON object with keys "1".."${batch.length}". No prose.`;

		const url = `${this.baseURL.replace(/\/$/, "")}/chat/completions`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				messages: [{ role: "user", content: prompt }],
				temperature: 0,
				response_format: { type: "json_object" },
			}),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${await response.text()}`);
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const content = data.choices?.[0]?.message?.content ?? "";
		const parsed = JSON.parse(content) as Record<
			string,
			{ contradiction?: boolean; reason?: string }
		>;

		const verdicts: ContradictionVerdict[] = [];
		for (let i = 0; i < batch.length; i++) {
			const entry = parsed[String(i + 1)];
			if (!entry || !entry.contradiction) continue;
			verdicts.push({
				index: offset + i,
				result: {
					action: "update",
					updatedContent: batch[i]!.newInfo,
					reason: `LLM (${this.model}): ${entry.reason ?? "contradiction"}`,
				},
			});
		}
		return verdicts;
	}
}

// ─── Vllm reasoning (future) ───────────────────────────────────────────────

/** Placeholder for local Gemma reasoning via vLLM. Not implemented in this
 *  PR — the host PC's GPUs are currently dedicated to training. The interface
 *  reservation lets `selectFilter` recognize the `VLLM_REASONING_BASE` env
 *  without users hitting an unknown-provider error before the implementation
 *  lands. */
export class VllmReasoningContradictionFilter
	implements ContradictionFilterProvider
{
	readonly name = "vllm-reasoning";

	async filter(
		_candidates: readonly ContradictionCandidate[],
	): Promise<ContradictionVerdict[]> {
		throw new Error(
			"VllmReasoningContradictionFilter not yet implemented — set CONTRADICTION_FILTER=heuristic or provide GEMINI_API_KEY in the meantime",
		);
	}
}

// ─── Provider selection ────────────────────────────────────────────────────

/** Pick a contradiction filter from environment.
 *  Priority: VLLM_REASONING_BASE > GEMINI_API_KEY > heuristic.
 *  Override via `CONTRADICTION_FILTER` (heuristic | gemini | vllm).
 */
export function selectFilter(
	env: NodeJS.ProcessEnv = process.env,
): ContradictionFilterProvider {
	const override = env.CONTRADICTION_FILTER?.toLowerCase();
	if (override === "heuristic") return new HeuristicContradictionFilter();
	if (override === "vllm") return new VllmReasoningContradictionFilter();
	if (override === "gemini") {
		if (!env.GEMINI_API_KEY) {
			throw new Error("CONTRADICTION_FILTER=gemini set but GEMINI_API_KEY missing");
		}
		return new GeminiFlashLiteContradictionFilter({ apiKey: env.GEMINI_API_KEY });
	}

	if (env.VLLM_REASONING_BASE) return new VllmReasoningContradictionFilter();
	if (env.GEMINI_API_KEY) {
		return new GeminiFlashLiteContradictionFilter({ apiKey: env.GEMINI_API_KEY });
	}
	return new HeuristicContradictionFilter();
}
