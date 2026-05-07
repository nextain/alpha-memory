/**
 * Per-process usage tracker — counts LLM/embedding API calls and tokens
 * during a benchmark run. Reset between runs.
 *
 * NOT thread-safe (Node single-thread is fine). Module-level singleton —
 * one instance per Node process.
 */

export interface UsageStats {
	llmCalls: number;
	llmPromptTokens: number;
	llmCompletionTokens: number;
	embedCalls: number;
	embedTokens: number;
}

const _stats: UsageStats = {
	llmCalls: 0,
	llmPromptTokens: 0,
	llmCompletionTokens: 0,
	embedCalls: 0,
	embedTokens: 0,
};

export function resetUsage(): void {
	_stats.llmCalls = 0;
	_stats.llmPromptTokens = 0;
	_stats.llmCompletionTokens = 0;
	_stats.embedCalls = 0;
	_stats.embedTokens = 0;
}

export function recordLLM(promptTokens: number, completionTokens: number): void {
	_stats.llmCalls++;
	_stats.llmPromptTokens += promptTokens || 0;
	_stats.llmCompletionTokens += completionTokens || 0;
}

export function recordEmbedding(tokens: number): void {
	_stats.embedCalls++;
	_stats.embedTokens += tokens || 0;
}

export function getUsage(): UsageStats {
	return { ..._stats };
}

/**
 * Estimate cost in USD given 4 pricing rates ($/M tokens).
 * Rates can be overridden via env:
 *   NAIA_PRICE_LLM_IN, NAIA_PRICE_LLM_OUT, NAIA_PRICE_EMBED
 *
 * Defaults match Gemini 2.5 Flash Lite + gemini-embedding-001 (AI Studio
 * tier, 2026-05). Vertex AI tier may differ — check actual billing.
 */
export interface PricingRates {
	llmInputPerM: number; // $/M input tokens
	llmOutputPerM: number; // $/M output tokens
	embedPerM: number; // $/M embedding tokens
}

export function getPricingFromEnv(): PricingRates {
	return {
		llmInputPerM: Number.parseFloat(process.env.NAIA_PRICE_LLM_IN ?? "0.10"),
		llmOutputPerM: Number.parseFloat(process.env.NAIA_PRICE_LLM_OUT ?? "0.40"),
		embedPerM: Number.parseFloat(process.env.NAIA_PRICE_EMBED ?? "0.15"),
	};
}

export function estimateCostUSD(stats: UsageStats, rates: PricingRates): number {
	const llmIn = (stats.llmPromptTokens / 1_000_000) * rates.llmInputPerM;
	const llmOut = (stats.llmCompletionTokens / 1_000_000) * rates.llmOutputPerM;
	const emb = (stats.embedTokens / 1_000_000) * rates.embedPerM;
	return llmIn + llmOut + emb;
}
