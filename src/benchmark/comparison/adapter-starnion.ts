/**
 * Starnion benchmark adapter — session-based memory via gateway REST API.
 *
 * Starnion is a self-hosted AI agent platform with PostgreSQL + MinIO backend.
 * Memory is stored in chat sessions and searchable via FTS.
 *
 * Requires running Starnion stack:
 *   podman start starnion-postgres starnion-minio starnion-agent starnion-gateway
 *
 * Gateway runs on port 8080.
 */
import type { BenchmarkAdapter } from "./types.js";

const GATEWAY_BASE = "http://127.0.0.1:8080";

export class StarnionAdapter implements BenchmarkAdapter {
	readonly name = "Starnion";
	readonly description =
		"Starnion — AI agent platform with session-based memory and FTS search (PostgreSQL + MinIO)";

	private token = "";
	private sessionId = "";
	private userId = "";

	async init(): Promise<void> {
		// Health check
		const health = await this.fetchJson("GET", "/health", null, false);
		if (!health || health.status !== "ok")
			throw new Error(`Starnion gateway not running at ${GATEWAY_BASE}`);

		// Register/login benchmark user
		const email = `bench-${Date.now()}@test.com`;
		const reg = await this.fetchJson(
			"POST",
			"/api/v1/auth/register",
			{
				email,
				password: "Bench1234567!",
				name: "Benchmark",
			},
			false,
		);
		if (!reg?.token)
			throw new Error(`Failed to register Starnion user: ${JSON.stringify(reg)}`);

		this.token = reg.token;
		this.userId = reg.user_id;

		// Create a chat session for benchmarking
		const session = await this.fetchJson("POST", "/api/v1/sessions", {
			title: `benchmark-${Date.now()}`,
		});
		if (!session?.id)
			throw new Error(
				`Failed to create session: ${JSON.stringify(session)}`,
			);
		this.sessionId = session.id;
	}

	async addFact(content: string, _date?: string): Promise<boolean> {
		// Send fact as a chat message — the agent will process and store it
		const result = await this.fetchJson(
			"POST",
			`/api/v1/sessions/${this.sessionId}/chat`,
			{
				message: `Please remember this fact: ${content}`,
			},
		);
		return !!result;
	}

	async search(query: string, topK: number): Promise<string[]> {
		// Search conversations via FTS
		const searchResult = await this.fetchJson(
			"GET",
			`/api/v1/conversations/search?q=${encodeURIComponent(query)}&limit=${topK}`,
		);

		const results = Array.isArray(searchResult)
			? searchResult
			: (searchResult?.results ?? searchResult?.messages ?? []);

		return results
			.map((r: any) => r.content ?? r.text ?? r.message ?? "")
			.filter((s: string) => s.length > 0);
	}

	async cleanup(): Promise<void> {
		// Best effort cleanup
		if (this.sessionId) {
			try {
				await this.fetchJson(
					"DELETE",
					`/api/v1/sessions/${this.sessionId}`,
				);
			} catch {}
		}
	}

	private async fetchJson(
		method: string,
		path: string,
		body?: any,
		useAuth = true,
	): Promise<any> {
		try {
			const opts: RequestInit = {
				method,
				headers: {} as Record<string, string>,
			};
			if (useAuth && this.token) {
				(opts.headers as Record<string, string>)["Authorization"] =
					`Bearer ${this.token}`;
			}
			(opts.headers as Record<string, string>)["Content-Type"] =
				"application/json";
			if (body) opts.body = JSON.stringify(body);
			const res = await fetch(`${GATEWAY_BASE}${path}`, opts);
			if (!res.ok) {
				const text = await res.text();
				console.error(
					`  Starnion ${method} ${path}: ${res.status} ${text.slice(0, 200)}`,
				);
				return null;
			}
			const contentType = res.headers.get("content-type") ?? "";
			if (contentType.includes("application/json")) {
				return res.json();
			}
			return { ok: true };
		} catch (err: any) {
			console.error(`  Starnion ${method} ${path}: ${err.message}`);
			return null;
		}
	}
}
