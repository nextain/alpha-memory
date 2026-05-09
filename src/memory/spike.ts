/**
 * R4 #26 — Background brain spike + Active context types.
 *
 * 사용자 directive (2026-05-08): \"잠을 자는 구간이나 그런게 있거나 하면
 * 백그라운드에서 중요한 것들이 스파이크로 나오면 활성화된 세션에 '아.. 그거
 * 아니었어' 라고 주입을 해주고\"
 *
 * 학계 정합:
 * - Sharp-wave ripples (Buzsáki 1996) — hippocampus 의 fast replay burst
 * - CLS (McClelland 1995) — fast hippocampal + slow neocortical
 * - DMN spontaneous reorganization (Raichle 2001)
 *
 * 책임 분리 (anchor §A08):
 * - naia-memory = consolidation worker + replay + spike emit (본 파일)
 * - naia-agent = subscribe + source monitor + pragmatic gate (별도 repo)
 *
 * 공유 schema 의 home 은 \`@nextain/agent-types\` (naia-agent#27 issue) —
 * 본 파일은 *local definition*, agent-types ship 후 re-export 로 통일 예정.
 */

/** Spike event — significant 사건 발견 시 emit. */
export interface SpikeEvent {
	factId: string;
	content: string;
	reason:
		| "contradiction" // R2.5 v2 supersede 발생
		| "high-importance-relevant" // active context topic 과 high-importance fact 매칭
		| "recall-failure-resolved" // 사용자 query 가 자주 fail 했는데 새 fact 추출
		| "temporal-anchor" // \"1년 전 오늘\" 같은 시간 anchor
		| "cross-domain-analogy" // KG 의 두 도메인 사이 bridging fact 발견
		| "user-emotion-anniversary" // high emotion fact 의 같은 날
		| "repeated-fail"; // 사용자 같은 query 반복했는데 답 변경됨
	confidence: number; // 0-1
	relatedFactIds: string[];
	emittedAt: number;
	/** project scope — naia-agent 가 active session 의 project 와 비교 후
	 *  inject 결정. cross-project leak 방지 (anchor §A10). */
	scope?: { project?: string };
}

/** Active context — naia-agent 가 *현재 대화 context* 를 naia-memory 에 push.
 *  Background brain 이 spike 발견 시 active context 와 매칭 (relevance) 판단. */
export interface ActiveContext {
	topics: string[];
	recentFactIds: string[];
	/** 필수 — cross-project leak 방지 (anchor §A10). */
	scope: { project: string };
	/** 사용자 명시 차단 topic — spike 가 이 topic 의 fact 면 emit X. */
	optOutTopics?: string[];
}

/** Spike action — naia-agent 의 source-monitor + pragmatic-gate 결정 결과. */
export interface SpikeAction {
	decision: "inject-now" | "inject-next-turn" | "skip";
	reason: string;
	/** pragmatic gate 가 발화 다듬은 경우. */
	modifiedContent?: string;
}

/** Spike emit handler — naia-agent 가 subscribe 시 받는 callback.
 *  Returns SpikeAction or void (skip). */
export type SpikeHandler = (event: SpikeEvent) => Promise<SpikeAction | void>;

/** Subscribable memory provider — R4 #26 의 인터페이스.
 *  MemorySystem 이 구현 (R4 Step 2 wire-in). */
export interface SubscribableMemory {
	/** Subscribe spike events. */
	on(event: "spike", handler: SpikeHandler): void;
	/** Unsubscribe. */
	off(event: "spike", handler: SpikeHandler): void;
	/** Push active context (naia-agent → naia-memory).
	 *  Background brain 이 spike rule 평가 시 이 context 사용. */
	setActiveContext(ctx: ActiveContext): void;
	/** Read current active context (debug / introspection). */
	getActiveContext(): ActiveContext | null;
}
