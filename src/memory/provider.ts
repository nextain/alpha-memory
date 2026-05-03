/**
 * NaiaMemoryProvider — MemoryProvider wrapper around MemorySystem.
 *
 * R1.3: Adapter layer that exposes MemoryProvider interface (provider-types.ts)
 * while delegating to the existing MemorySystem orchestrator.
 *
 * This is the public API surface for naia-memory consumers (naia-agent, naia-os).
 */

import { MemorySystem } from "./index.js";
import type { MemoryAdapter } from "./types.js";
import type { FactExtractor } from "./index.js";
import { findContradictions as findContradictionsReal } from "./reconsolidation.js";
import { scoreImportance as scoreImportanceFn } from "./importance.js";
import {
	BackupCapableProvider,
	ImportanceScoringCapable,
	ReconsolidationCapableProvider,
	TemporalCapableProvider,
} from "./provider-types.js";
import type {
	MemoryProvider,
	MemoryProviderInput,
	MemoryHit,
	RecallOptions,
	ConsolidationSummary,
} from "./provider-types.js";

export interface NaiaMemoryProviderOptions {
	adapter: MemoryAdapter;
	factExtractor?: FactExtractor;
}

export class NaiaMemoryProvider
	implements
		MemoryProvider,
		BackupCapableProvider,
		ImportanceScoringCapable,
		ReconsolidationCapableProvider,
		TemporalCapableProvider
{
	private system: MemorySystem;

	constructor(opts: NaiaMemoryProviderOptions) {
		this.system = new MemorySystem({
			adapter: opts.adapter,
			factExtractor: opts.factExtractor,
		});
	}

	async encode(input: MemoryProviderInput, opts?: { project?: string }): Promise<void> {
		await this.system.encode(
			{
				content: input.content,
				role: input.role,
				timestamp: input.timestamp,
				context: input.context,
			},
			{ project: opts?.project },
		);
	}

	async recall(query: string, opts?: RecallOptions): Promise<MemoryHit[]> {
		const result = await this.system.recall(query, {
			project: opts?.project,
			topK: opts?.topK ?? 50,
		});

		const hits: MemoryHit[] = [
			...result.facts.map((f) => ({
				id: f.id,
				content: f.content,
				score: f.relevanceScore ?? 0,
				createdAt: f.createdAt,
				updatedAt: f.updatedAt,
				metadata: {
					type: "fact" as const,
					entities: f.entities,
					topics: f.topics,
					importance: f.importance,
					status: f.status,
				},
			})),
			...result.episodes.map((e) => ({
				id: e.id,
				content: e.content,
				score: 0.3,
				createdAt: e.timestamp,
				metadata: {
					type: "episode" as const,
					consolidated: e.consolidated,
				},
			})),
		];

		hits.sort((a, b) => b.score - a.score);
		return hits;
	}

	async consolidate(): Promise<ConsolidationSummary> {
		const start = Date.now();
		const r = await this.system.consolidateNow(true);
		return {
			factsCreated: r.factsCreated,
			factsUpdated: r.factsUpdated,
			episodesProcessed: r.episodesProcessed,
			durationMs: Date.now() - start,
		};
	}

	async close(): Promise<void> {
		await this.system.close();
	}

	// ─── Capability: BackupCapable ────────────────────────────────────────────

	exportBackup(password: string): Promise<Uint8Array> {
		const adapter = this.system["adapter"];
		if ("exportBackup" in adapter && typeof adapter.exportBackup === "function") {
			return adapter.exportBackup(password);
		}
		throw new Error("BackupCapable not supported by current adapter");
	}

	importBackup(blob: Uint8Array, password: string): Promise<void> {
		const adapter = this.system["adapter"];
		if ("importBackup" in adapter && typeof adapter.importBackup === "function") {
			return adapter.importBackup(blob, password);
		}
		throw new Error("BackupCapable not supported by current adapter");
	}

	// ─── Capability: ImportanceScoring ────────────────────────────────────────

	scoreImportance(text: string): { importance: number; surprise: number; emotion: number; utility: number } {
		return scoreImportanceFn({ content: text, role: "user" });
	}

	// ─── Capability: Reconsolidation ──────────────────────────────────────────

	async findContradictions(
		newContent: string,
		_existingIds?: string[],
	): Promise<{ conflictingId: string; conflictType: "direct" | "indirect"; reason: string }[]> {
		const result = await this.system.recall(newContent, { topK: 10 });
		const contradictions = findContradictionsReal(result.facts, newContent);
		return contradictions.map(({ fact, result: r }) => ({
			conflictingId: fact.id,
			conflictType: r.action === "update" ? "direct" as const : "indirect" as const,
			reason: r.reason,
		}));
	}

	// ─── Capability: Temporal ─────────────────────────────────────────────────

	async applyDecay(): Promise<number> {
		const adapter = this.system["adapter"] as MemoryAdapter;
		return adapter.semantic.decay(Date.now());
	}

	async recallWithHistory(
		query: string,
		atTimestamp: number,
		opts?: RecallOptions,
	): Promise<MemoryHit[]> {
		const result = await this.system.recall(query, {
			project: opts?.project,
			topK: opts?.topK ?? 50,
		});

		const hits: MemoryHit[] = result.facts
			.filter((f) => f.createdAt <= atTimestamp)
			.map((f) => ({
				id: f.id,
				content: f.content,
				score: f.relevanceScore ?? 0,
				createdAt: f.createdAt,
				updatedAt: f.updatedAt,
				metadata: {
					type: "fact" as const,
					status: f.status,
				},
			}));

		return hits;
	}
}

export type { MemoryProvider, MemoryProviderInput, MemoryHit, RecallOptions, ConsolidationSummary };
export {
	BackupCapableProvider,
	ImportanceScoringCapable,
	ReconsolidationCapableProvider,
	TemporalCapableProvider,
	isCapable,
} from "./provider-types.js";
