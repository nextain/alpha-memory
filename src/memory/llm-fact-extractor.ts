/**
 * LLM-based atomic fact extractor for Alpha Memory consolidation.
 *
 * Replaces heuristicFactExtractor (which copies episode content verbatim)
 * with a Gemini Flash call that distills each episode into 1-5 atomic facts.
 *
 * Goal: clean facts like "사용자 인덴트 스타일: 탭" instead of
 * "사용자가 코딩할 때 탭을 쓴다고 했다. 그리고 vim을 사용하며..."
 *
 * Tradeoffs:
 * - +latency: one API call per BATCH of episodes during consolidation
 * - +cost: ~100 tokens input + ~200 tokens output per episode
 * - +accuracy: atomic facts embed cleanly, improving vector search recall
 */

import type { ExtractedFact } from "./index.js";
import type { Episode } from "./types.js";

export interface LLMFactExtractorOptions {
	/** Gemini (or OpenAI-compatible) API key */
	apiKey: string;
	/** Base URL for the chat completions endpoint (without /chat/completions) */
	baseURL?: string;
	/** Model to use. Default: gemini-2.5-flash-lite (fast, cheap) */
	model?: string;
	/** Max episodes to send in a single API call. Default: 10 */
	batchSize?: number;
}

const DEFAULT_BASE_URL =
	"https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const DEFAULT_BATCH_SIZE = 10;

/**
 * Factory: returns a FactExtractor function that calls Gemini Flash.
 * Pass the result as `factExtractor` in MemorySystemOptions.
 *
 * @example
 * const system = new MemorySystem({
 *   adapter,
 *   factExtractor: buildLLMFactExtractor({ apiKey: process.env.GEMINI_API_KEY! }),
 * });
 */
export function buildLLMFactExtractor(
	options: LLMFactExtractorOptions,
): (episodes: Episode[]) => Promise<ExtractedFact[]> {
	const {
		apiKey,
		baseURL = DEFAULT_BASE_URL,
		model = DEFAULT_MODEL,
		batchSize = DEFAULT_BATCH_SIZE,
	} = options;

	return async (episodes: Episode[]): Promise<ExtractedFact[]> => {
		const results: ExtractedFact[] = [];

		// Process in batches to reduce API round-trips
		for (let i = 0; i < episodes.length; i += batchSize) {
			const batch = episodes.slice(i, i + batchSize);
			const extracted = await extractBatch(batch, { apiKey, baseURL, model });
			results.push(...extracted);
		}

		return results;
	};
}

/**
 * Extract atomic facts from a batch of episodes in a single API call.
 * Sends all episodes together → one set of facts per episode index.
 */
async function extractBatch(
	episodes: Episode[],
	opts: Required<Omit<LLMFactExtractorOptions, "batchSize">>,
): Promise<ExtractedFact[]> {
	const { apiKey, baseURL, model } = opts;

	// Build numbered list of episode contents
	const episodeList = episodes
		.map((ep, i) => `[${i + 1}] ${ep.content}`)
		.join("\n");

	const prompt = `You are a memory fact extractor. Given conversation turns, extract atomic facts about the user and any actionable information (preferences, constraints, environment details, tool results).

Rules:
- Each fact = ONE self-contained statement
- Each fact MUST match the language of its specific episode, not the batch as a whole
- Be specific: "사용자 직업: 소프트웨어 엔지니어" not "사용자가 직업에 대해 말했다"
- 1-5 facts per episode. If no extractable facts exist, return []
- Skip greetings, meta-commentary, questions without answers
- Do NOT invent facts not present in the input

Conversation turns:
${episodeList}

Respond with ONLY a JSON object mapping episode number to fact array. No other text.
Format: {"1": ["fact", ...], "2": ["fact", ...], ...}`;

	try {
		const response = await fetch(`${baseURL}chat/completions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages: [{ role: "user", content: prompt }],
				max_tokens: Math.max(2048, episodes.length * 200),
				temperature: 0.1,
				response_format: { type: "json_object" },
			}),
		});

		if (!response.ok) {
			throw new Error(`API ${response.status}: ${await response.text()}`);
		}

		const data = await response.json();
		const raw = data.choices?.[0]?.message?.content ?? "{}";
		const parsed: Record<string, unknown> = JSON.parse(raw);

		return episodes.flatMap((ep, i) => {
			const rawFacts = parsed[String(i + 1)] ?? [];
			if (!Array.isArray(rawFacts) && Object.keys(parsed).length > 0) {
				console.warn(
					`[LLMFactExtractor] Unexpected value for key "${i + 1}": ${typeof rawFacts}. Keys: ${Object.keys(parsed).join(", ")}`,
				);
			}
			const facts: string[] = Array.isArray(rawFacts)
				? rawFacts.filter((f): f is string => typeof f === "string")
				: [];
			if (facts.length === 0) {
				// Fallback: keep episode content to avoid data loss
				return [
					{
						content: ep.content,
						entities: [],
						topics: ep.encodingContext.project
							? [ep.encodingContext.project]
							: [],
						importance: ep.importance.utility,
						sourceEpisodeIds: [ep.id],
					},
				];
			}
			return facts.map((fact) => ({
				content: fact,
				entities: [],
				topics: ep.encodingContext.project ? [ep.encodingContext.project] : [],
				importance: ep.importance.utility,
				sourceEpisodeIds: [ep.id],
			}));
		});
	} catch (err) {
		console.warn(
			`[LLMFactExtractor] Batch failed (${episodes.length} episodes), falling back to heuristic:`,
			err,
		);
		// Graceful fallback: return episodes as-is (same as heuristicFactExtractor)
		return episodes.map((ep) => ({
			content: ep.content,
			entities: [],
			topics: ep.encodingContext.project ? [ep.encodingContext.project] : [],
			importance: ep.importance.utility,
			sourceEpisodeIds: [ep.id],
		}));
	}
}
