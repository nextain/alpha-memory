export const KO_SYNONYM_MAP: [RegExp, string][] = [
	[/마셔$/, "마심"],
	[/마셔요$/, "마심"],
	[/안 마셔$/, "안 마심"],
	[/안 마셔요$/, "안 마심"],
	[/안 펴$/, "안 함"],
	[/안 피워$/, "안 함"],
	[/없어$/, "없음"],
	[/없어요$/, "없음"],
	[/안 먹어$/, "안 먹음"],
	[/안 먹어요$/, "안 먹음"],
	[/안 가$/, "안 감"],
	[/안 해$/, "안 함"],
	[/안 해요$/, "안 함"],
	[/안 친해$/, "안 친함"],
	[/안 나가$/, "안 나감"],
	[/챙겨 먹어$/, "챙겨 먹음"],
	[/자주 안 바꿔$/, "자주 안 바꿈"],
	[/안 해$/, "안 해요"],
];

export function koNormalizeForJudge(text: string): string {
	return text
		.replace(/\(변경\)/g, "")
		.toLowerCase()
		.trim();
}

export function koIncludes(haystack: string, needle: string): boolean {
	const h = koNormalizeForJudge(haystack);
	const n = koNormalizeForJudge(needle);
	if (h.includes(n)) return true;
	for (const [pat, repl] of KO_SYNONYM_MAP) {
		if (pat.test(h) && h.replace(pat, repl).includes(n)) return true;
		if (pat.test(n) && h.includes(n.replace(pat, repl))) return true;
	}
	return false;
}
