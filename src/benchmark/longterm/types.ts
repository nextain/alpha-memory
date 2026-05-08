/**
 * #30 — Long-term measurement framework types.
 *
 * naia-os 통합 후 사용자 daily 사용 ground 위 *진짜 가치* 측정. 합성 ledger
 * (Phase B-α / Phase A) 는 mechanism 작동 verify 만, daily 사용 시 사용자
 * 만족도 / 진짜 useful 비율 측정 X.
 *
 * 구성:
 * 1. Daily turn ledger (naia-os 측 collector 가 자동 수집)
 * 2. Weekly self-eval (사용자 5 문항 mini-survey)
 * 3. Monthly snapshot (store 통계 + cost 누적 + mechanism trigger 횟수)
 * 4. A/B switching (사용자 동의 후 mechanism on/off 1주 단위)
 */

/** 1 turn 의 사용 history record. naia-os agent loop 의 turn 마다 emit. */
export interface DailyTurn {
	id: string;
	timestamp: number;
	role: "user" | "assistant";
	utterance: string;
	/** memory.recall() 결과 — top-K fact id list */
	recalledFactIds?: string[];
	/** memory.recall() 의 mode (latest / history / at-time) */
	recallMode?: string;
	/** LLM 답 (assistant turn) */
	response?: string;
	/** spike inject 여부 (R4 Background brain 활성 시) */
	spikeInjected?: boolean;
	/** 사용자가 spike 응답 적절성 평가 (실측) */
	userFeedback?: "helpful" | "irrelevant" | "annoying" | null;
}

/** Weekly self-eval — Likert 5점 + boolean. 매 일요일 자동 prompt. */
export interface WeeklyEval {
	weekStart: string; // ISO date
	overall: 1 | 2 | 3 | 4 | 5; // "이번 주 naia 가 도움 됐다" 1-5
	recallAccuracy: 1 | 2 | 3 | 4 | 5; // "기억 정확도"
	spikeRelevance?: 1 | 2 | 3 | 4 | 5; // "spike inject 적절성" (R4 활성 시)
	contextLeak?: number; // 의도하지 않은 inject 갯수 (cross-project leak count)
	notes?: string;
}

/** Monthly snapshot — store 통계. */
export interface MonthlySnapshot {
	yearMonth: string; // YYYY-MM
	storeStats: {
		factsActive: number;
		factsArchived: number;
		factsSuperseded: number;
		episodesActive: number;
		episodesArchived: number;
		chainMaxDepth: number;
		kgEdges: number;
	};
	costAccum: {
		llmCalls: number;
		embedCalls: number;
		estimatedUSD: number;
	};
	mechanismTriggers: {
		r25SupersedeCount: number;
		decayArchiveCount: number;
		spikeEmitCount?: number;
		spikeAcceptedCount?: number;
		spikeSkippedCount?: number;
	};
	recallLatency: {
		p50Ms: number;
		p95Ms: number;
		p99Ms: number;
	};
}

/** A/B switching — 사용자 동의 후 mechanism on/off 1주 단위 비교. */
export interface ABTest {
	id: string;
	mechanism: "importance" | "kg" | "r25" | "spike";
	startWeek: string;
	endWeek: string;
	weekA: { config: "on" | "off"; evals: WeeklyEval[] };
	weekB: { config: "on" | "off"; evals: WeeklyEval[] };
	conclusion?: string;
}
