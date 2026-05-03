/**
 * Korean tokenizer / normalizer (lite, no external dependency).
 *
 * For naia v3 production we'll consider konlpy/khaiii, but this lite
 * version covers the most common particle stripping for hash/match.
 */

const KO_PARTICLES = new Set([
	"은", "는", "이", "가", "을", "를",
	"에", "에서", "에게", "께", "한테",
	"의", "와", "과", "랑", "이랑",
	"도", "만", "만이", "조차", "마저",
	"부터", "까지", "처럼", "보다",
	"으로", "로", "으로서", "로서",
	"입니다", "이다", "이에요", "예요",
	"습니다", "ㅂ니다", "어요", "아요", "지요",
	"고", "고요", "면", "면서", "지만",
]);

const STOPWORDS = new Set([
	"것", "그", "이", "저", "그것", "이것",
	"있다", "없다", "되다", "하다", "있는",
	"같다", "그리고", "또는", "그런데",
	"어떤", "무슨", "어디", "언제", "누가",
]);

const PUNCT = /[.,!?;:'"`~()\[\]{}<>@#$%^&*+=\\/|]/g;

export function tokenize(text: string): string[] {
	if (!text) return [];
	const cleaned = text.replace(PUNCT, " ").replace(/\s+/g, " ").trim();
	const raw = cleaned.split(" ");
	return raw
		.map((w) => stripParticle(w.toLowerCase()))
		.filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

export function stripParticle(token: string): string {
	for (const p of KO_PARTICLES) {
		if (token.endsWith(p) && token.length > p.length + 1) {
			return token.slice(0, -p.length);
		}
	}
	return token;
}

export function normalize(text: string): string {
	return tokenize(text).join(" ");
}
