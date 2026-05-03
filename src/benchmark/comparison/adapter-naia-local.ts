/**
 * Naia MemorySystem(LocalAdapter) benchmark adapter — R7 target.
 * Supports multiple embedding backends via vLLM or hosted APIs.
 */
import { LocalAdapter } from "../../memory/adapters/local.js";
import {
	type EmbeddingProvider,
	OfflineEmbeddingProvider,
	OpenAICompatEmbeddingProvider,
} from "../../memory/embeddings.js";
import { MemorySystem } from "../../memory/index.js";
import { buildLLMFactExtractor } from "../../memory/llm-fact-extractor.js";
import type { BenchmarkAdapter } from "./types.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const GATEWAY_BASE = process.env.GATEWAY_URL ?? "";
const GATEWAY_KEY = process.env.GATEWAY_MASTER_KEY ?? "";
const VLLM_EMBED_BASE = process.env.VLLM_EMBED_BASE ?? "http://localhost:8001";

export class NaiaLocalAdapter implements BenchmarkAdapter {
	readonly name = "naia-local";
	private _description = "MemorySystem(LocalAdapter)";

	get description() {
		return `${this._description} + ${this.embedderName} + LLM atomic fact extraction`;
	}

	private system: MemorySystem | null = null;
	private apiKey: string;
	private embedderName: string;

	constructor(apiKey: string, embedderName = "gemini") {
		this.apiKey = apiKey;
		this.embedderName = embedderName;
	}

	private buildEmbedder(): EmbeddingProvider {
		if (this.embedderName === "offline-e5") {
			return new OfflineEmbeddingProvider("multilingual-e5-large");
		}

		const vllmEmbedders: Record<string, { model: string; dims: number }> = {
			"ollama": { model: "mxbai-embed-large", dims: 1024 },
			"bge-m3": { model: "bge-m3", dims: 1024 },
			"nomic": { model: "nomic-embed-text", dims: 768 },
			"qwen3-emb": { model: "Qwen/Qwen3-Embedding-0.6B", dims: 1024 },
			"qwen3-emb-8b": { model: "Qwen/Qwen3-Embedding-8B", dims: 4096 },
			"snowflake": { model: "Snowflake/snowflake-arctic-embed2-l", dims: 1024 },
		};

		const vllmConf = vllmEmbedders[this.embedderName];
		if (vllmConf) {
			return new OpenAICompatEmbeddingProvider(
				VLLM_EMBED_BASE,
				"empty",
				vllmConf.model,
				vllmConf.dims,
			);
		}

		if (GATEWAY_KEY) {
			return new OpenAICompatEmbeddingProvider(
				GATEWAY_BASE,
				GATEWAY_KEY,
				"vertexai:gemini-embedding-001",
				3072,
			);
		}
		return new OpenAICompatEmbeddingProvider(
			GEMINI_BASE,
			this.apiKey,
			"gemini-embedding-001",
			3072,
		);
	}

	async init(cacheId?: string): Promise<void> {
		const id = cacheId ?? "stable";
		const storePath = `./memory-naia-local-${id}-${this.embedderName}.json`;
		const embedder = this.buildEmbedder();

		console.log(
			`    [NaiaLocal] Initializing: ${storePath} with ${this.embedderName} (${embedder.dims}d)`,
		);

		const adapter = new LocalAdapter({
			storePath,
			embeddingProvider: embedder,
		});
		const factExtractor = buildLLMFactExtractor({ apiKey: this.apiKey });
		this.system = new MemorySystem({ adapter, factExtractor });
	}

	async addFact(content: string, date?: string): Promise<boolean> {
		if (!this.system) throw new Error("Not initialized");
		const timestamp = date ? new Date(date).getTime() : undefined;
		await this.system.encode(
			{ content, role: "user", timestamp },
			{ project: "benchmark" },
		);
		return true;
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
