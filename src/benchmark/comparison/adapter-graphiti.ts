/**
 * Graphiti benchmark adapter — temporal context graph via REST API.
 *
 * Graphiti (getzep/graphiti) is Zep's open-source temporal knowledge graph engine.
 * It extracts entities, relationships, and facts from messages, storing them in
 * a Neo4j-backed graph with temporal awareness (valid_at / invalid_at windows).
 *
 * Requires a running Graphiti server + Neo4j:
 *   podman-compose up -d    (from graphiti/server directory)
 *
 * Server endpoints:
 *   GET  /healthcheck              — health check
 *   POST /messages                 — ingest messages (async, returns 202)
 *   POST /search                   — search facts by query
 *   POST /get-memory               — convenience search with message context
 *   DELETE /group/{group_id}       — clear all data for a group
 *
 * LLM/embedding backend is configured at server level via environment variables.
 * This adapter only handles the REST API interaction.
 */
import type { BenchmarkAdapter } from "./types.js";

const GRAPHITI_BASE = process.env.GRAPHITI_BASE ?? "http://127.0.0.1:8000";

/**
 * Delay after adding messages — Graphiti processes them asynchronously.
 * 5s per message keeps pace with the server's single-threaded async worker
 * (each LLM call takes ~2-3s). Total encode: 1000 × 5s ≈ 83 min.
 */
const POST_ADD_DELAY_MS = 5000;

export class GraphitiAdapter implements BenchmarkAdapter {
	readonly name = "graphiti";
	readonly description =
		"Graphiti — temporal knowledge graph with entity/relation extraction (Neo4j backend)";

	private groupId = "";

	async init(cacheId?: string): Promise<void> {
		// Check Graphiti is running
		const health = await this.fetchJson("GET", "/healthcheck");
		if (!health || health.status !== "healthy") {
			throw new Error(
				`Graphiti not running at ${GRAPHITI_BASE}. Start with: podman-compose up -d`,
			);
		}

		// Create unique group ID for this benchmark run
		// Use cacheId for stable identity if provided (for skip-encode mode)
		this.groupId = cacheId
			? `bench-graphiti-${cacheId}`
			: `bench-graphiti-${Date.now()}`;
		console.log(`    [Graphiti] Initialized with group: ${this.groupId}`);
	}

	async addFact(content: string, date?: string): Promise<boolean> {
		if (!this.groupId) throw new Error("Not initialized");

		const timestamp = date
			? new Date(date).toISOString()
			: new Date().toISOString();

		const result = await this.fetchJson("POST", "/messages", {
			group_id: this.groupId,
			messages: [
				{
					content,
					role_type: "user",
					role: "user",
					timestamp,
					source_description: "benchmark fact ingestion",
				},
			],
		});

		// Graphiti processes messages asynchronously — brief delay for LLM extraction
		if (result?.success) {
			await new Promise((r) => setTimeout(r, POST_ADD_DELAY_MS));
		}

		return result?.success === true;
	}

	/**
	 * Wait for the async processing queue to drain before querying.
	 * Called by the benchmark runner between encode and query phases.
	 */
	async consolidate(): Promise<void> {
		if (!this.groupId) return;
		console.log(
			"    [Graphiti] Waiting for async processing queue to drain...",
		);

		// Poll search until we get results, indicating processing has completed.
		// The async worker processes messages one at a time (~3s each).
		// After encoding 1000 facts, the queue may have a large backlog.
		const maxWaitMs = 10 * 60 * 1000; // 10 min max wait
		const pollIntervalMs = 10_000; // Poll every 10s
		const startTime = Date.now();
		let lastFactCount = 0;
		let stableCount = 0;

		while (Date.now() - startTime < maxWaitMs) {
			const result = await this.fetchJson("POST", "/search", {
				group_ids: [this.groupId],
				query: "benchmark test query for consolidation check",
				max_facts: 1,
			});
			const factCount = result?.facts?.length ?? 0;

			if (factCount > 0) {
				// Got results — check if count is stable (queue drained)
				if (factCount === lastFactCount) {
					stableCount++;
					if (stableCount >= 3) {
						console.log(
							`    [Graphiti] Processing complete — facts available in search results.`,
						);
						return;
					}
				} else {
					stableCount = 0;
				}
				lastFactCount = factCount;
			}

			await new Promise((r) => setTimeout(r, pollIntervalMs));
		}

		console.warn(
			"    [Graphiti] Consolidation timed out after 10 min — proceeding anyway.",
		);
	}

	async search(query: string, topK: number): Promise<string[]> {
		if (!this.groupId) throw new Error("Not initialized");

		const result = await this.fetchJson("POST", "/search", {
			group_ids: [this.groupId],
			query,
			max_facts: topK,
		});

		if (!result?.facts) return [];

		return result.facts
			.map((f: any) => f.fact ?? f.name ?? "")
			.filter((s: string) => s.length > 0);
	}

	async cleanup(): Promise<void> {
		if (this.groupId) {
			try {
				await this.fetchJson("DELETE", `/group/${this.groupId}`);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	private async fetchJson(
		method: string,
		path: string,
		body?: any,
	): Promise<any> {
		try {
			const opts: RequestInit = {
				method,
				headers: { "Content-Type": "application/json" },
			};
			if (body) opts.body = JSON.stringify(body);
			const res = await fetch(`${GRAPHITI_BASE}${path}`, opts);
			if (!res.ok) {
				const text = await res.text();
				console.error(
					`  Graphiti ${method} ${path}: ${res.status} ${text.slice(0, 200)}`,
				);
				return null;
			}
			return res.json();
		} catch (err: any) {
			console.error(`  Graphiti ${method} ${path}: ${err.message}`);
			return null;
		}
	}
}
