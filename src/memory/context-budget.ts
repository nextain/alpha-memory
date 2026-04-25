/**
 * Context Budget Allocator
 *
 * Selects the optimal subset of recalled memories to fit within a token budget.
 * Multi-signal ranking: relevance × recency × frequency × importance/emotion.
 *
 * Architecture Review R2 결정: 3-axis scoring을 encoding gate → context injection ranking으로 전환.
 * Storage Layer는 모든 episode 저장. Context Injection Layer에서 budget 기반 선택.
 */

import type { Episode, Fact, Reflection } from "./types.js";
import { calculateStrength } from "./decay.js";

export interface BudgetOptions {
	maxTokens: number;
	lang?: "ko" | "en";
	now?: number;
}

interface ScoredItem {
	text: string;
	category: "fact" | "episode" | "reflection";
	worthiness: number;
	tokenEstimate: number;
}

const CHARS_PER_TOKEN_KO = 1.5;
const CHARS_PER_TOKEN_EN = 4;

function estimateTokens(text: string, lang: "ko" | "en"): number {
	const charsPerToken = lang === "ko" ? CHARS_PER_TOKEN_KO : CHARS_PER_TOKEN_EN;
	return Math.ceil(text.length / charsPerToken);
}

function scoreFact(fact: Fact, now: number): number {
	const strength = calculateStrength(
		fact.importance,
		fact.createdAt,
		fact.recallCount,
		fact.lastAccessed,
		now,
	);
	const relevance = fact.relevanceScore ?? 0.3;
	return relevance * 0.6 + strength * 0.25 + fact.importance * 0.15;
}

function scoreEpisode(episode: Episode, now: number): number {
	const strength = calculateStrength(
		episode.importance.utility,
		episode.timestamp,
		episode.recallCount,
		episode.lastAccessed,
		now,
	);
	const roleBoost = episode.role === "user" ? 0.1 : 0;
	return strength * 0.5 + episode.importance.utility * 0.3 + Math.abs(episode.importance.emotion - 0.5) * 0.2 + roleBoost;
}

function scoreReflection(reflection: Reflection): number {
	return 0.7;
}

export function allocateBudget(
	facts: Fact[],
	episodes: Episode[],
	reflections: Reflection[],
	options: BudgetOptions,
): string {
	const { maxTokens, lang = "ko", now = Date.now() } = options;

	if (facts.length === 0 && reflections.length === 0 && episodes.length === 0)
		return "";

	const items: ScoredItem[] = [];

	for (const fact of facts) {
		items.push({
			text: fact.content,
			category: "fact",
			worthiness: scoreFact(fact, now),
			tokenEstimate: estimateTokens(`- ${fact.content}`, lang),
		});
	}

	for (const ep of episodes) {
		const roleStr = ep.role ?? "Record";
		const prefix = lang === "ko"
			? roleStr === "user" ? "사용자" : roleStr === "assistant" ? "Naia" : roleStr === "tool" ? "도구" : "기록"
			: roleStr === "user" ? "User" : roleStr === "assistant" ? "Naia" : roleStr === "tool" ? "Tool" : "Record";
		const text = `${prefix}: ${ep.content}`;
		items.push({
			text,
			category: "episode",
			worthiness: scoreEpisode(ep, now),
			tokenEstimate: estimateTokens(`- ${text}`, lang),
		});
	}

	for (const ref of reflections) {
		const text = `${ref.task}: ${ref.correction}`;
		items.push({
			text,
			category: "reflection",
			worthiness: scoreReflection(ref),
			tokenEstimate: estimateTokens(`- ${text}`, lang),
		});
	}

	items.sort((a, b) => b.worthiness - a.worthiness);

	const selected: ScoredItem[] = [];
	let usedTokens = 0;
	const headerReserve = 30;

	for (const item of items) {
		if (usedTokens + item.tokenEstimate + headerReserve <= maxTokens) {
			selected.push(item);
			usedTokens += item.tokenEstimate;
		}
	}

	const selectedFacts = selected.filter((i) => i.category === "fact");
	const selectedEpisodes = selected.filter((i) => i.category === "episode");
	const selectedReflections = selected.filter((i) => i.category === "reflection");

	const parts: string[] = [];

	if (selectedFacts.length > 0) {
		parts.push(lang === "ko" ? "## 관련 기억" : "## Related Memories");
		for (const item of selectedFacts) {
			parts.push(`- ${item.text}`);
		}
	}

	if (selectedEpisodes.length > 0) {
		parts.push(lang === "ko" ? "## 이전 대화에서" : "## From Previous Conversation");
		for (const item of selectedEpisodes) {
			parts.push(`- ${item.text}`);
		}
	}

	if (selectedReflections.length > 0) {
		parts.push(lang === "ko" ? "## 과거 경험에서 배운 것" : "## Lessons from Past Experience");
		for (const item of selectedReflections) {
			parts.push(`- ${item.text}`);
		}
	}

	return parts.join("\n");
}
