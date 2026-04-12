/**
 * EmbeddingProvider abstraction u2014 4 built-in providers.
 *
 * Provider selection:
 *   none (undefined)   u2014 no class; LocalAdapter uses keyword search, QdrantAdapter rejects
 *   offline            u2014 @huggingface/transformers (optional dep, dynamic import)
 *   openai-compat      u2014 any OpenAI-compatible /v1/embeddings endpoint (local LLMs, hosted APIs)
 *   naia-gateway       u2014 any-llm /v1/embeddings u2192 Vertex AI text-embedding-004
 */

/**
 * EmbeddingProvider interface u2014 injectable into MemorySystem and adapters.
 * Implement this to add custom embedding backends.
 */
export interface EmbeddingProvider {
	/** Embed a single text string. Returns a float vector. */
	embed(text: string): Promise<number[]>;
	/** Embed multiple texts in one call. Returns one vector per text. */
	embedBatch(texts: string[]): Promise<number[][]>;
	/** Embedding vector dimensions */
	readonly dims: number;
	/** Provider name for logging/debugging */
	readonly name: string;
}

/**
 * OfflineEmbeddingProvider u2014 @huggingface/transformers (dynamic import).
 *
 * No network required after initial model download (~80MB or ~420MB depending on model).
 * Matches SillyTavern's getTransformersVector() u2014 mean pooling + normalize.
 *
 * Requires `@huggingface/transformers` in optionalDependencies.
 */
export class OfflineEmbeddingProvider implements EmbeddingProvider {
	readonly name = "offline";
	readonly dims: number;
	private pipeline: any = null;
	private readonly modelName: string;
	/** Single shared promise to prevent N concurrent loads on first embedBatch call */
	private initPromise: Promise<void> | null = null;

	constructor(
		model: "all-MiniLM-L6-v2" | "all-mpnet-base-v2" = "all-MiniLM-L6-v2",
	) {
		this.modelName = model;
		// all-MiniLM-L6-v2 = 384d, all-mpnet-base-v2 = 768d
		this.dims = model === "all-mpnet-base-v2" ? 768 : 384;
	}

	private init(): Promise<void> {
		// Reuse the in-flight promise so concurrent callers wait for the same init.
		// Without this, N concurrent embed() calls each start loading the model.
		if (!this.initPromise) {
			this.initPromise = (async () => {
				// Dynamic import u2014 @huggingface/transformers is an optional peer dependency
				let pipelineFn: typeof import("@huggingface/transformers")["pipeline"];
				try {
					({ pipeline: pipelineFn } = await import("@huggingface/transformers"));
				} catch {
					throw new Error(
						'@huggingface/transformers is required for OfflineEmbeddingProvider. ' +
						'Install it: pnpm add @huggingface/transformers',
					);
				}
				this.pipeline = await pipelineFn(
					"feature-extraction",
					`Xenova/${this.modelName}`,
				);
			})();
		}
		return this.initPromise;
	}

	async embed(text: string): Promise<number[]> {
		await this.init();
		// Mean pooling + normalize u2014 matches SillyTavern's getTransformersVector()
		const result = await this.pipeline(text, {
			pooling: "mean",
			normalize: true,
		});
		return Array.from(result.data) as number[];
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		return Promise.all(texts.map((t) => this.embed(t)));
	}
}

/**
 * OpenAICompatEmbeddingProvider u2014 any OpenAI-compatible /v1/embeddings endpoint.
 *
 * Covers local LLMs (LM Studio, Ollama, vLLM, etc.) and hosted APIs.
 * Default dims is 1536 (OpenAI text-embedding-3-small); override for other models.
 */
export class OpenAICompatEmbeddingProvider implements EmbeddingProvider {
	// `: string` widens the literal type so NaiaGatewayEmbeddingProvider can
	// override it with `readonly name = "naia-gateway"` without a type error.
	readonly name: string = "openai-compat";

	constructor(
		private readonly baseUrl: string,
		private readonly apiKey: string,
		private readonly model: string,
		readonly dims = 1536,
	) {}

	async embedBatch(texts: string[]): Promise<number[][]> {
		if (texts.length === 0) return [];
		const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({ model: this.model, input: texts }),
		});
		if (!res.ok) {
			// Wrap res.text() — body-read can throw on aborted connections,
			// which would mask the original HTTP status error.
			let body = "";
			try {
				body = await res.text();
			} catch {
				// ignore
			}
			throw new Error(
				`Embedding API error: ${res.status}${body ? ` ${body}` : ""}`,
			);
		}
		const data = (await res.json()) as {
			data: Array<{ embedding: number[] }>;
		};
		return data.data.map((d) => d.embedding);
	}

	async embed(text: string): Promise<number[]> {
		return (await this.embedBatch([text]))[0];
	}
}

/**
 * NaiaGatewayEmbeddingProvider u2014 any-llm /v1/embeddings u2192 Vertex AI text-embedding-004.
 *
 * Uses Naia key for auth. Dimensions: 768 (text-embedding-004).
 * The any-llm gateway routes `vertexai:text-embedding-004` to Vertex AI.
 */
export class NaiaGatewayEmbeddingProvider extends OpenAICompatEmbeddingProvider {
	override readonly name = "naia-gateway";

	constructor(naiaGatewayUrl: string, naiaKey: string) {
		super(naiaGatewayUrl, naiaKey, "vertexai:text-embedding-004", 768);
	}
}
