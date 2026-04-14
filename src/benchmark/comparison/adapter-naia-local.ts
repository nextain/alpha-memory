/**
 * Naia MemorySystem(LocalAdapter) benchmark adapter — R7 target.
 *
 * Unlike adapter-naia.ts (Mem0Adapter), this uses LocalAdapter directly with
 * vector search via gemini-embedding-001 (3072d, MTEB multilingual #1).
 *
 * Key differences from Mem0Adapter path:
 * - No LLM dedup: facts stored as-is without English-optimized normalization
 * - Vector search: cosine similarity on 3072d embeddings (vs keyword fallback)
 * - Simpler pipeline: encode → episode → consolidate → fact → vector search
 *
 * Expected improvement (R7 hypothesis): KO 24% → 55%+
 */
import { LocalAdapter } from "../../memory/adapters/local.js";
import { OpenAICompatEmbeddingProvider } from "../../memory/embeddings.js";
import { MemorySystem } from "../../memory/index.js";
import type { BenchmarkAdapter } from "./types.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GATEWAY_BASE = process.env.GATEWAY_URL ?? "";
const GATEWAY_KEY = process.env.GATEWAY_MASTER_KEY ?? "";
const GATEWAY_USER = "benchmark";

/**
 * gemini-embedding-001 via Gemini API (direct or gateway).
 * Direct: 3072d, MTEB multilingual #1.
 * Gateway (Vertex AI): falls back to text-embedding-004 (768d) if 001 not available.
 */
function buildEmbedder(apiKey: string): OpenAICompatEmbeddingProvider {
	if (GATEWAY_KEY) {
		// Use any-llm gateway → Vertex AI
		// Note: OpenAICompatEmbeddingProvider appends /v1/embeddings to baseUrl,
		// so pass GATEWAY_BASE without /v1 suffix.
		return new OpenAICompatEmbeddingProvider(
			GATEWAY_BASE,
			GATEWAY_KEY,
			"vertexai:gemini-embedding-001",
			3072,
		);
	}
	// Direct Gemini AI Studio API
	return new OpenAICompatEmbeddingProvider(
		GEMINI_BASE,
		apiKey,
		"gemini-embedding-001",
		3072,
	);
}

export class NaiaLocalAdapter implements BenchmarkAdapter {
	readonly name = "naia-local";
	readonly description =
		"MemorySystem(LocalAdapter) + gemini-embedding-001 (3072d) — no LLM dedup";

	private system: MemorySystem | null = null;
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	async init(cacheId?: string): Promise<void> {
		const id = cacheId ?? "stable";
		const storePath = `./memory-naia-local-${id}.json`;
		console.log(
			`    [NaiaLocal] Initializing LocalAdapter: ${storePath} + gemini-embedding-001`,
		);
		const embedder = buildEmbedder(this.apiKey);
		const adapter = new LocalAdapter({ storePath, embeddingProvider: embedder });
		this.system = new MemorySystem({ adapter });
	}

	async addFact(content: string, date?: string): Promise<boolean> {
		if (!this.system) throw new Error("Not initialized");
		const timestamp = date ? new Date(date).getTime() : undefined;
		const episode = await this.system.encode(
			{ content, role: "user", timestamp },
			{ project: "benchmark" },
		);
		return episode !== null;
	}

	async search(query: string, topK: number): Promise<string[]> {
		if (!this.system) throw new Error("Not initialized");
		const result = await this.system.recall(query, {
			project: "benchmark",
			topK,
		});
		const raw = [
			...result.facts.map((f) => f.content),
			...result.episodes.map((e) => e.content),
		];
		return [...new Set(raw)];
	}

	async consolidate(): Promise<void> {
		if (!this.system) throw new Error("Not initialized");
		console.log("    u2699 NaiaLocal: Triggering consolidation...");
		const result = await this.system.consolidateNow(true);
		console.log(
			`    u2699 NaiaLocal: ${result.factsCreated} new facts, ${result.factsUpdated} updated`,
		);
	}

	async cleanup(): Promise<void> {
		if (this.system) await this.system.close();
	}
}
