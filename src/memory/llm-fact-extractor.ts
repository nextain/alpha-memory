/**
 * LLM-based atomic fact extractor for Naia Memory consolidation.
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
	retries = 3,
): Promise<ExtractedFact[]> {
	const { apiKey, baseURL, model } = opts;

	const episodeList = episodes
		.map((ep, i) => {
			// LoCoMo dataset uses Unix seconds; JS Date expects ms.
			// Heuristic: timestamps below 1e12 are seconds, otherwise ms.
			const ts = ep.timestamp;
			const tsMs = ts && ts < 1e12 ? ts * 1000 : ts;
			const dateStr = tsMs
				? new Date(tsMs).toISOString().split("T")[0]
				: "";
			const dateTag = dateStr ? ` [Date: ${dateStr}]` : "";
			return `[${i + 1}]${dateTag} ${ep.content}`;
		})
		.join("\n");

	const prompt = `You are a memory fact extractor. Given conversation turns, extract atomic facts about the user and any actionable information (preferences, constraints, environment details, tool results).

Rules:
- Each fact = ONE self-contained statement
- Each fact MUST match the language of its specific episode, not the batch as a whole
- Be specific: "User occupation: software engineer" not "User mentioned their occupation"
- 1-5 facts per episode. If no extractable facts exist, return []
- Skip greetings, meta-commentary, questions without answers
- Do NOT invent facts not present in the input
- CRITICAL: When the turn mentions relative time ("yesterday", "last week", "last night"), resolve it using the [Date: YYYY-MM-DD] tag. Example: if tagged [Date: 2023-05-08] and text says "yesterday", write the fact as "User went to the LGBTQ support group on 2023-05-07" or "on 7 May 2023".

Korean-specific rules (apply when episode is Korean):
- 한국어 에피소드에서는 반드시 한국어로 fact를 작성. 영어로 번역하지 마라.
- 조사(은/는/이/가/을/를)는 생략하고 명사구 중심으로 작성: "사용자 직업: 소프트웨어 엔지니어"
- 고유명사(회사명, 제품명, 사람 이름)는 원형 그대로 보존.
- 영어 혼용(Konglish)은 원문 그대로 유지: "VS Code", "React", "TypeScript"
- 한국어 fact 예시:
  {"1": ["사용자 선호 에디터: VS Code", "사용자 코딩 스타일: 탭 들여쓰기", "사용자 거주지: 서울"]}

Conversation turns:
${episodeList}

Respond with ONLY a JSON object mapping episode number to fact array. No other text.
Format: {"1": ["fact", ...], "2": ["fact", ...], ...}`;

	const call = () =>
		fetch(`${baseURL}chat/completions`, {
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

	let response: Response | undefined;
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			response = await call();
			if (response.ok || response.status < 500) break;
			const delay = Math.min(2000 * attempt, 10000);
			console.warn(
				`[LLMFactExtractor] API ${response.status}, retry ${attempt}/${retries} in ${delay}ms`,
			);
			await new Promise((r) => setTimeout(r, delay));
		} catch (err: any) {
			if (attempt === retries) {
				console.warn(
					`[LLMFactExtractor] Batch failed after ${retries} retries (${episodes.length} episodes), skipping`,
				);
				return [];
			}
			await new Promise((r) => setTimeout(r, 2000 * attempt));
		}
	}

	if (!response || !response.ok) {
		console.warn(
			`[LLMFactExtractor] API ${response?.status ?? "timeout"}, skipping ${episodes.length} episodes`,
		);
		return [];
	}

	try {
		const data = await response.json();
		let raw = data.choices?.[0]?.message?.content ?? "{}";
		raw = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
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
			if (facts.length === 0) return [];
			return facts.map((fact) => ({
				content: fact,
				entities: [],
				topics: ep.encodingContext.project ? [ep.encodingContext.project] : [],
				importance: ep.importance.utility,
				sourceEpisodeIds: [ep.id],
			}));
		});
	} catch (err) {
		console.warn(`[LLMFactExtractor] Parse error, skipping batch:`, err);
		return [];
	}
}
