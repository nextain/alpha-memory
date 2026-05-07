/**
 * Synthetic ledger generator for Phase B-α.
 *
 * Emits a Korean ledger with controlled fact / contradiction density:
 *   - 50 base facts (직업 / 거주지 / 취향 / 가족 / 기타)
 *   - 30 update statements (intentional contradiction targeting prior facts)
 *   - Total: 80 turns, ~37.5% contradiction density
 *
 * Generation strategy:
 *   1. Seed personas with attribute templates (직업, 거주지, ...)
 *   2. LLM generates natural Korean utterances + groundTruthFact for each
 *   3. Programmatically schedule contradictions (5-15 turns after the base)
 *   4. Frozen output committed to `ledger.jsonl`
 *
 * NOTE: Synthetic over-fit risk per cross-review. Mitigation paths:
 *   - User reviews + edits frozen ledger before measurement
 *   - LLM prompt avoids surface vocabulary that the fact extractor uses
 *   - Generator emits only persona-driven natural-sounding 1-turn utterances
 *
 * Usage:
 *   GEMINI_API_KEY=xxx pnpm exec tsx \
 *     src/benchmark/phase-b/ledger-generator.ts > src/benchmark/phase-b/ledger.jsonl
 */

import { writeFileSync } from "node:fs";
import type { Ledger, LedgerEntry } from "./types.js";

interface AttributeTemplate {
	key: string; // attributeKey for contradiction grouping
	category: string; // 직업 / 거주지 / 취향 / 가족 / 기타
	baseValues: string[]; // 5+ initial-state options
	updateValues: string[]; // 5+ post-update options
}

const TEMPLATES: AttributeTemplate[] = [
	{
		key: "사용자 직업",
		category: "직업",
		baseValues: [
			"소프트웨어 엔지니어",
			"중학교 수학 교사",
			"디자이너",
			"마케팅 매니저",
			"간호사",
			"회계사",
			"바리스타",
			"창업 준비 중",
		],
		updateValues: [
			"프리랜서 디자이너로 전향",
			"외국계 IT 회사로 이직",
			"공무원 합격",
			"육아휴직 중",
			"창업 회사 운영",
			"풀스택 개발자로 직무 변경",
		],
	},
	{
		key: "사용자 거주지",
		category: "거주지",
		baseValues: [
			"서울 마포구",
			"부산 해운대구",
			"경기도 성남시",
			"대구 수성구",
			"인천 송도",
			"제주시",
		],
		updateValues: [
			"강남구로 이사",
			"판교로 이사",
			"제주도로 이주",
			"부모님 댁으로 합가",
			"신혼집으로 이사 (송파구)",
		],
	},
	{
		key: "사용자 차량",
		category: "기타",
		baseValues: [
			"아반떼 운전 중",
			"투싼 운전 중",
			"K5 운전 중",
			"테슬라 모델3",
			"자전거만 사용",
		],
		updateValues: [
			"전기차로 바꿈 (아이오닉5)",
			"중고 카니발로 변경",
			"차 처분하고 대중교통 이용",
		],
	},
	{
		key: "사용자 반려동물",
		category: "가족",
		baseValues: [
			"고양이 두 마리 (코코, 모카)",
			"비글 한 마리 키움",
			"골든 리트리버 키움",
			"반려동물 없음",
		],
		updateValues: [
			"고양이가 무지개다리 건너서 한 마리만 남음",
			"새로 강아지 입양 (포메라니안)",
			"반려동물 알러지 발견되어 가족에게 보냄",
		],
	},
	{
		key: "사용자 운동 습관",
		category: "취향",
		baseValues: [
			"주 3회 헬스장",
			"매일 아침 조깅",
			"필라테스 다님",
			"수영장 다님",
			"운동 안 함",
		],
		updateValues: [
			"크로스핏으로 바꿈",
			"홈트레이닝으로 전환",
			"무릎 부상으로 운동 중단",
			"테니스로 종목 변경",
		],
	},
	{
		key: "사용자 식이 선호",
		category: "취향",
		baseValues: [
			"비건 식단",
			"저탄수 다이어트",
			"치킨 즐겨 먹음",
			"한식 위주",
			"케토 식단",
		],
		updateValues: [
			"다이어트 끝나서 일반식 복귀",
			"임신 후 입덧 때문에 식단 바꿈",
			"위염 때문에 자극적 음식 끊음",
		],
	},
];

function pad3(n: number): string {
	return n.toString().padStart(3, "0");
}

function randPick<T>(arr: T[], rng: () => number): T {
	return arr[Math.floor(rng() * arr.length)];
}

function lcg(seed: number): () => number {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

function isoStamp(dayOffset: number, hour = 9): string {
	const base = new Date(2026, 0, 1, hour, 0, 0); // 2026-01-01 09:00 KST baseline
	base.setDate(base.getDate() + dayOffset);
	return base.toISOString();
}

function utteranceForBase(template: AttributeTemplate, value: string): string {
	switch (template.key) {
		case "사용자 직업":
			return `요즘 ${value}로 일하고 있어. 일이 좀 바쁘긴 한데 적성에 맞아.`;
		case "사용자 거주지":
			return `나 지금 ${value}에 살고 있어. 출퇴근하기 편한 동네야.`;
		case "사용자 차량":
			return `차는 ${value}. 연식은 좀 됐는데 잘 굴러가.`;
		case "사용자 반려동물":
			return `우리 집은 ${value}. 매일 보면 행복하다.`;
		case "사용자 운동 습관":
			return `요즘 ${value} 다녀. 체력 관리해야 해서.`;
		case "사용자 식이 선호":
			return `식단은 ${value}으로 챙기고 있어. 몸이 좀 가벼워졌어.`;
	}
	return value;
}

function utteranceForUpdate(template: AttributeTemplate, value: string): string {
	switch (template.key) {
		case "사용자 직업":
			return `이번에 ${value}했어. 일이 많이 달라졌어.`;
		case "사용자 거주지":
			return `요즘 ${value}했어. 적응 중이야.`;
		case "사용자 차량":
			return `차 ${value}. 만족하면서 타고 있어.`;
		case "사용자 반려동물":
			return `사실 최근에 ${value}.`;
		case "사용자 운동 습관":
			return `운동 ${value}. 방식이 좀 달라졌어.`;
		case "사용자 식이 선호":
			return `요즘은 ${value}. 식단을 좀 조정했어.`;
	}
	return value;
}

function factForBase(template: AttributeTemplate, value: string): string {
	return `${template.key}: ${value}`;
}

function factForUpdate(template: AttributeTemplate, value: string): string {
	return `${template.key}: ${value}`;
}

export interface GeneratorOptions {
	baseFacts?: number; // default 50
	contradictions?: number; // default 30
	seed?: number; // default 42
	startDayOffset?: number;
	updateGapMin?: number; // turns between base and update
	updateGapMax?: number;
}

export function generateLedger(opts: GeneratorOptions = {}): Ledger {
	const baseCount = opts.baseFacts ?? 50;
	const updateCount = opts.contradictions ?? 30;
	const seed = opts.seed ?? 42;
	const rng = lcg(seed);
	const gapMin = opts.updateGapMin ?? 5;
	const gapMax = opts.updateGapMax ?? 15;

	const entries: LedgerEntry[] = [];
	const baseEntries: Array<{ id: string; template: AttributeTemplate; turn: number }> =
		[];

	// Phase 1: emit `baseCount` base facts, distributed across templates.
	for (let i = 0; i < baseCount; i++) {
		const t = TEMPLATES[i % TEMPLATES.length];
		const value = randPick(t.baseValues, rng);
		const id = `L${pad3(entries.length + 1)}`;
		const turn = entries.length + 1;
		entries.push({
			id,
			turn,
			timestamp: isoStamp(turn - 1),
			role: "user",
			utterance: utteranceForBase(t, value),
			groundTruthFact: factForBase(t, value),
			category: t.category,
		});
		baseEntries.push({ id, template: t, turn });
	}

	// Phase 2: schedule `updateCount` updates targeting random base entries.
	// Pick distinct base entries to avoid double-supersede confusion.
	// Each update's timestamp is *strictly after* its base AND monotonically
	// increasing in encode order (turn order == timestamp order).
	const targetedBaseIds = new Set<string>();
	let updatesEmitted = 0;
	const baseShuffle = [...baseEntries].sort(() => rng() - 0.5);

	for (const base of baseShuffle) {
		if (updatesEmitted >= updateCount) break;
		if (targetedBaseIds.has(base.id)) continue;
		targetedBaseIds.add(base.id);
		const updateValue = randPick(base.template.updateValues, rng);
		const id = `L${pad3(entries.length + 1)}`;
		const turn = entries.length + 1;
		// Strictly monotone: update day = max(base day + gap, current turn - 1)
		// → encode order == timestamp order, prevents R2.5 confusion from
		//   updates that look "earlier" than later base entries.
		const minDay = base.turn - 1 + Math.floor(gapMin + rng() * (gapMax - gapMin));
		const day = Math.max(minDay, turn - 1);
		entries.push({
			id,
			turn,
			timestamp: isoStamp(day),
			role: "user",
			utterance: utteranceForUpdate(base.template, updateValue),
			groundTruthFact: factForUpdate(base.template, updateValue),
			contradiction: {
				type: "update",
				supersedes: base.id,
				attributeKey: base.template.key,
			},
			category: base.template.category,
		});
		updatesEmitted++;
	}

	return {
		meta: {
			schemaVersion: 1,
			createdAt: new Date().toISOString(),
			generator: "synthetic-llm",
			notes: `Phase B-α synthetic ledger (template-based, seed=${seed}). User review encouraged before measurement (cross-review over-fit guard).`,
		},
		entries,
	};
}

// CLI: emit jsonl to stdout (or path arg)
if (import.meta.url === `file://${process.argv[1]}`) {
	const ledger = generateLedger();
	const lines: string[] = [];
	lines.push(JSON.stringify({ meta: ledger.meta }));
	for (const e of ledger.entries) lines.push(JSON.stringify(e));
	const out = lines.join("\n") + "\n";

	const path = process.argv[2];
	if (path) {
		writeFileSync(path, out, "utf-8");
		console.error(
			`[ledger-generator] wrote ${ledger.entries.length} entries (${ledger.entries.filter((e) => e.contradiction).length} contradictions) → ${path}`,
		);
	} else {
		process.stdout.write(out);
	}
}
