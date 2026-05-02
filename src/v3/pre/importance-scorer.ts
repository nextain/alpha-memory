/**
 * 3-axis importance scoring (importance × surprise × emotion).
 *
 * Used as Context Budget Allocator (NOT as encoding gate, per R1/R2 review).
 * Light-weight keyword-based; v3.1 may upgrade to embedding-based.
 */

const IMPORTANCE_KEYWORDS = [
	"중요", "꼭", "반드시", "절대",
	"기억", "잊지", "비밀", "특별",
	"처음", "마지막", "유일",
];

const EMOTION_POSITIVE = [
	"좋", "사랑", "행복", "기쁘", "즐겁",
	"멋지", "훌륭", "감사", "기대",
];

const EMOTION_NEGATIVE = [
	"싫", "슬프", "화", "분노", "걱정",
	"두렵", "무섭", "힘들", "괴롭",
];

const SURPRISE_KEYWORDS = [
	"놀람", "갑자기", "어머", "헐",
	"진짜", "정말", "헤", "오",
	"예상", "충격",
];

function countMatches(text: string, list: string[]): number {
	let n = 0;
	for (const k of list) if (text.includes(k)) n++;
	return n;
}

export function scoreImportance(text: string): number {
	const m = countMatches(text, IMPORTANCE_KEYWORDS);
	return Math.min(1.0, m * 0.3 + (text.length > 50 ? 0.2 : 0));
}

export function scoreEmotion(text: string): number {
	const pos = countMatches(text, EMOTION_POSITIVE);
	const neg = countMatches(text, EMOTION_NEGATIVE);
	if (pos + neg === 0) return 0;
	return (pos - neg) / (pos + neg);
}

export function scoreSurprise(text: string): number {
	const m = countMatches(text, SURPRISE_KEYWORDS);
	return Math.min(1.0, m * 0.4);
}

export function compositeScore(
	importance: number,
	emotion: number,
	surprise: number,
): number {
	// emotion absolute value (both pos and neg signal high engagement)
	const emoMag = Math.abs(emotion);
	return importance * 0.5 + emoMag * 0.3 + surprise * 0.2;
}
