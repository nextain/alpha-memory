/**
 * Korean relative time expressions → datetime offsets.
 *
 * Examples:
 *   "어제" → -1 day
 *   "지난주" → -7 days
 *   "이틀 전" → -2 days
 *   "5분 전" → -5 minutes
 *   "한 달 전" → -30 days
 */

const KO_NUMBER: Record<string, number> = {
	한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5,
	여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
	"한가지": 1,
};

interface ParsedOffset {
	num: number;
	unitMs: number; // milliseconds per unit
	original: string;
}

const UNIT_MS: Record<string, number> = {
	"분": 60 * 1000,
	"시간": 60 * 60 * 1000,
	"일": 24 * 60 * 60 * 1000,
	"주": 7 * 24 * 60 * 60 * 1000,
	"개월": 30 * 24 * 60 * 60 * 1000,
	"달": 30 * 24 * 60 * 60 * 1000,
	"년": 365 * 24 * 60 * 60 * 1000,
};

const FIXED_PHRASES: Record<string, ParsedOffset> = {
	"어제": { num: 1, unitMs: UNIT_MS["일"], original: "어제" },
	"그저께": { num: 2, unitMs: UNIT_MS["일"], original: "그저께" },
	"엊그제": { num: 2, unitMs: UNIT_MS["일"], original: "엊그제" },
	"지난주": { num: 1, unitMs: UNIT_MS["주"], original: "지난주" },
	"지난달": { num: 1, unitMs: UNIT_MS["달"], original: "지난달" },
	"작년": { num: 1, unitMs: UNIT_MS["년"], original: "작년" },
	"오늘": { num: 0, unitMs: 0, original: "오늘" },
	"지금": { num: 0, unitMs: 0, original: "지금" },
};

export function parseRelativeKo(text: string): ParsedOffset | null {
	for (const [phrase, offset] of Object.entries(FIXED_PHRASES)) {
		if (text.includes(phrase)) return offset;
	}

	// pattern: <num> <unit> 전
	const numericMatch = text.match(/(\d+)\s*(분|시간|일|주|개월|달|년)\s*전/);
	if (numericMatch) {
		const num = parseInt(numericMatch[1]!, 10);
		const unit = numericMatch[2]!;
		return { num, unitMs: UNIT_MS[unit] ?? 0, original: numericMatch[0]! };
	}

	// pattern: <KO_NUM> <unit> 전
	for (const [koNum, val] of Object.entries(KO_NUMBER)) {
		const m = text.match(new RegExp(`${koNum}\\s*(분|시간|일|주|개월|달|년)\\s*전`));
		if (m) {
			const unit = m[1]!;
			return { num: val, unitMs: UNIT_MS[unit] ?? 0, original: m[0]! };
		}
	}

	return null;
}

export function resolveReferenceDate(
	text: string,
	now: Date = new Date(),
): Date | null {
	const parsed = parseRelativeKo(text);
	if (!parsed) return null;
	return new Date(now.getTime() - parsed.num * parsed.unitMs);
}
