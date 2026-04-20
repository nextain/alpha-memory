/**
 * Fact Bank v2 Generator — Peer-reviewed design
 *
 * Key changes from v1:
 * 1. 80% natural language facts / 20% unique-ID facts
 * 2. Mixed distractor types (partial, negative, conditional, hierarchical, exact_substitute)
 * 3. Reasoning questions included
 * 4. Ecological validity — domain distribution matches real memory log patterns
 * 5. Storage quality metrics (dedup, contradiction detection, entry count)
 *
 * Generates fact-bank-v2.json + query-templates-v2.json together (cross-referenced).
 * v1 compatibility: same 12 benchmark categories, same query structure with 0-3 scoring.
 *
 * Usage: pnpm exec tsx src/benchmark/generate-factbank-v2.ts [--lang=ko|en|both]
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────

const DOMAINS = [
	"identity", "tech", "preference", "personal", "temporal",
	"work", "health", "social", "finance", "hobby",
] as const;

const FACTS_PER_DOMAIN = 100;
const ID_FACT_RATIO = 0.2;
const DISTRACTOR_RATIO = 0.55;
const CATEGORY_QUERIES: Record<string, number> = {
	direct_recall: 40,
	semantic_search: 20,
	proactive_recall: 20,
	abstention: 20,
	irrelevant_isolation: 15,
	multi_fact_synthesis: 15,
	entity_disambiguation: 20,
	contradiction_direct: 20,
	contradiction_indirect: 15,
	unchanged_persistence: 15,
	temporal: 20,
	noise_resilience: 20,
};

// ─── PRNG ────────────────────────────────────────────────────────────────────

let _seed = 42;
function srand(s?: number) { if (s !== undefined) _seed = s; }
function rng(min: number, max: number): number {
	_seed = (_seed * 16807 + 0) % 2147483647;
	return min + (Math.abs(_seed) % (max - min + 1));
}
function pick<T>(arr: readonly T[]): T { return arr[rng(0, arr.length - 1)]; }
function pickExcept<T>(arr: readonly T[], exclude: T): T {
	const f = arr.filter((x) => x !== exclude);
	return f[rng(0, f.length - 1)];
}
function genCode(prefix: string): string {
	return `${prefix}-${rng(1000, 9999)}-${String.fromCharCode(65 + rng(0, 25))}${String.fromCharCode(65 + rng(0, 25))}`;
}
function genPhone(): string { return `010-${rng(1000, 9999)}-${rng(1000, 9999)}`; }
function genAmount(): number { return rng(30, 500) * 10000; }
function genDate(): string { return `${rng(2020, 2025)}년 ${rng(1, 12)}월 ${rng(1, 28)}일`; }
function pad3(n: number): string { return String(n).padStart(3, "0"); }

// ─── Data Pools ──────────────────────────────────────────────────────────────

const NAMES_F = ["루아", "시은", "하진", "유나", "수빈", "채원", "도윤", "아린", "민서", "지호"] as const;
const NAMES_M = ["태오", "건", "이안", "준", "시우", "하람", "성민", "정호", "승우", "동현"] as const;
const COMPANIES = ["넥스필드", "코랄비트", "실버라인", "블루문랩스", "아이언씨드", "글라이드텍", "퀀텀리프", "피넛클라우드", "스톰베이스", "조이프레임"] as const;
const CITIES = ["블루문시", "코랄시", "실버타운", "아이언빌", "글라이드시", "퀀텀시", "피넛타운", "스톰시", "조이빌", "에메랄드시"] as const;
const DISTRICTS = ["선로구", "하늘구", "강변구", "중앙구", "북구", "남구", "동구", "서구", "산구", "바다구"] as const;
const EXOTIC_FRUITS = ["두리안", "망고스틴", "용과", "람부탄", "아사이", "구아바", "리치", "패션프루트", "스타프루트", "잭프루트"] as const;
const DRINKS = ["콤부차", "라씨", "아이스티", "레모네이드", "스무디", "프라푸치노", "버블티", "에이드", "미숫가루", "단호차"] as const;
const HOBBIES = ["키라미", "보드게임", "실내등반", "드론비행", "라디오조립", "키캡커스텀", "미니어처", "천문관측", "실내수목원", "테라리움"] as const;
const TECH_TOOLS = ["제톤7", "글린트", "베이퍼", "핀스크립트", "노바코드", "실버쉘", "퀀텀IDE", "이온빌드", "플럭스런", "크로미온"] as const;
const MOVIES = ["별의 속삭임", "푸른 미로", "시간의 모래", "세 번째 문", "유리섬", "침묵의 방", "붉은 계단", "마지막 선율", "보이지 않는 강", "기억의 가장자리"] as const;
const COLORS = ["틸", "코랄핑크", "민트그레이", "버밀리온", "세피아블루", "라벤더그린", "앰버", "슬레이트", "사프론", "티얼"] as const;
const VENUES = ["블루크릭 센터", "코랄 플라자", "실버홀", "아이언 스퀘어", "글라이드 타워"] as const;
const DEPTS = ["데이터솔루션팀", "플랫폼팀", "프론티어팀", "인프라팀", "크로스팀"] as const;
const ALLERGIES = ["메밀", "복숭아", "게", "우유", "땅콩", "새우", "계란"] as const;
const MEDS = ["글루코핀", "아지토민", "멜라토닌-X", "비타민D3플러스", "오메가쉘"] as const;
const FRIEND_JOBS = ["사진작가", "바리스타", "헬스트레이너", "도서관 사서", "조향사"] as const;
const PETS = ["고양이", "강아지", "토끼", "햄스터", "앵무새"] as const;
const PET_NAMES = ["모카", "밤", "달이", "초코", "코코", "보리", "찹쌀", "감자", "깨", "호두"] as const;
const BLOOD_TYPES = ["A", "B", "O", "AB"] as const;
const MBTI_TYPES = ["INTJ", "ENTP", "INFJ", "ENFP", "ISTJ", "ISFP", "ISTP", "ENTJ"] as const;
const MUSIC_GENRES = ["재즈", "인디", "클래식", "R&B", "보사노바"] as const;
const WEEKDAYS = ["월요일", "화요일", "수요일", "목요일", "금요일"] as const;
const SEASONS = ["봄", "여름", "가을", "겨울"] as const;
const WEEKEND_ACTS = ["영화", "산책", "독서", "요리", "게임"] as const;
const EXERCISE_TYPES = ["러닝", "수영", "등산", "요가", "홈트레이닝", "실내등반"] as const;
const SHELLS = ["피쉬", "바쉬", "지쉬"] as const;
const TERMINALS = ["웨젬", "고스티", "알라크리티"] as const;
const BANKS = ["카카오뱅크", "토스뱅크", "케이뱅크"] as const;
const CARDS = ["현대카드", "삼성카드", "신한카드"] as const;
const PKG_MGRS = ["pnpm", "yarn", "bun"] as const;
const RELATIONS = ["언니", "동생", "형", "누나"] as const;

// ─── Templates per domain ────────────────────────────────────────────────────

interface FactTemplate {
	nl: string;
	entities: string[];
	extractable: string[];
	type: "natural_language" | "unique_id";
	distractorType?: "exact_substitute" | "partial_match" | "negative" | "conditional" | "hierarchical";
	distractorNl?: string;
	distractorConcept?: string;
	temporalUpdate?: string;
	temporalReplaces?: string;
}

function genIdentityTemplates(): FactTemplate[] {
	const name = pick(NAMES_F);
	const bloodType = pick(BLOOD_TYPES);
	const mbti = pick(MBTI_TYPES);
	const bMonth = rng(1, 12);
	const bDay = rng(1, 28);
	const empCode = genCode("NX");
	const phone = genPhone();
	const rel = pick(RELATIONS);
	const relName = pick(NAMES_M);
	const hometown = pick(CITIES);

	return [
		{ nl: `나는 ${name}야`, entities: [name], extractable: [`이름: ${name}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `나는 ${pickExcept(NAMES_F, name)}야`, distractorConcept: "이름" },
		{ nl: `${rel}는 ${relName}야`, entities: [relName, rel], extractable: [`${rel}: ${relName}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `${rel}는 ${pickExcept(NAMES_M, relName)}야`, distractorConcept: `${rel} 이름` },
		{ nl: `${rel}는 커피 안 마셔`, entities: [], extractable: [`${rel} 커피: 안 마심`], type: "natural_language",
			distractorType: "negative", distractorNl: `${rel}도 커피 좋아해`, distractorConcept: `${rel} 커피 취향` },
		{ nl: `혈액형은 ${bloodType}형이야`, entities: [`${bloodType}형`], extractable: [`혈액형: ${bloodType}형`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `혈액형은 ${pickExcept(BLOOD_TYPES, bloodType)}형이야`, distractorConcept: "혈액형" },
		{ nl: `MBTI는 ${mbti}야`, entities: [mbti], extractable: [`MBTI: ${mbti}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `MBTI는 ${pickExcept(MBTI_TYPES, mbti)}야`, distractorConcept: "MBTI" },
		{ nl: `생일은 ${bMonth}월 ${bDay}일이야`, entities: [`${bMonth}월`, `${bDay}일`], extractable: [`생일: ${bMonth}월 ${bDay}일`], type: "natural_language" },
		{ nl: `사번은 ${empCode}야`, entities: [empCode], extractable: [`사번: ${empCode}`], type: "unique_id",
			distractorType: "exact_substitute", distractorNl: `사번은 ${genCode("NX")}야`, distractorConcept: "사번" },
		{ nl: `전화번호는 ${phone}야`, entities: [phone], extractable: [`전화번호: ${phone}`], type: "unique_id",
			distractorType: "exact_substitute", distractorNl: `전화번호는 ${genPhone()}야`, distractorConcept: "전화번호" },
		{ nl: `고향은 ${hometown}야`, entities: [hometown], extractable: [`고향: ${hometown}`], type: "natural_language" },
		{ nl: `나는 아침형 인간이야. 보통 새벽 6시에 일어나`, entities: ["아침형", "6시"], extractable: ["기상: 새벽 6시", "유형: 아침형"], type: "natural_language",
			distractorType: "partial_match", distractorNl: `나는 올빼미형이야. 보통 새벽 2시에 자`, distractorConcept: "생활 리듬" },
		{ nl: `차는 안 마셔. 커피만 마셔`, entities: [], extractable: ["차: 안 마심", "커피: 마심"], type: "natural_language",
			distractorType: "negative", distractorNl: `차도 좋아하고 커피도 좋아해`, distractorConcept: "차/커피 취향" },
		{ nl: `운전면허는 있지만 차는 안 가지고 다녀`, entities: [], extractable: ["운전면허: 있음", "자차: 없음"], type: "natural_language",
			distractorType: "conditional", distractorNl: `운전면허 있고 차도 가지고 다녀`, distractorConcept: "면허와 차 소유" },
		{ nl: `영어 이름은 ${pick(["Luna", "Aria", "Sky", "Nova", "Sage"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `군대는 ${pick(["공군", "육군", "해군"])} 나왔어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `대학은 ${pick(["한국과학기술원", "서울대학교", "연세대학교", "포항공과대학교"])} 나왔어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `키는 ${rng(155, 185)}cm야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `신발 사이즈는 ${rng(230, 280)}mm야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `시력은 ${pick(["1.0", "0.8", "-1.5", "-2.0"])}이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `왼손잡이야`, entities: ["왼손잡이"], extractable: ["손: 왼손"], type: "natural_language" },
		{ nl: `문신 있어. 왼쪽 팔에 작은 거 하나`, entities: [], extractable: ["문신: 있음 (왼팔)"], type: "natural_language" },
	];
}

function genTechTemplates(): FactTemplate[] {
	const editor = pick(TECH_TOOLS);
	const lang = pickExcept(TECH_TOOLS, editor);
	const framework = pickExcept(TECH_TOOLS.filter((t) => t !== editor && t !== lang), editor);
	const shell = pick(SHELLS);
	const terminal = pick(TERMINALS);
	const pkg = pick(PKG_MGRS);
	const ver = `${rng(1, 9)}.${rng(0, 15)}.${rng(0, 99)}`;

	return [
		{ nl: `에디터는 ${editor} 써`, entities: [editor], extractable: [`에디터: ${editor}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `에디터는 ${pickExcept(TECH_TOOLS, editor)} 써`, distractorConcept: "에디터" },
		{ nl: `주 언어는 ${lang}이야`, entities: [lang], extractable: [`주 언어: ${lang}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `주 언어는 ${pickExcept(TECH_TOOLS, lang)}이야`, distractorConcept: "주 언어" },
		{ nl: `프레임워크는 ${framework}야`, entities: [framework], extractable: [`프레임워크: ${framework}`], type: "natural_language",
			distractorType: "hierarchical", distractorNl: `프레임워크는 ${pickExcept(TECH_TOOLS, framework)}야`, distractorConcept: "프레임워크 (언어는 같음)" },
		{ nl: `다크모드 좋아해`, entities: ["다크모드"], extractable: ["테마: 다크모드"], type: "natural_language" },
		{ nl: `탭 인덴트 선호해`, entities: ["탭"], extractable: ["인덴트: 탭"], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `스페이스 인덴트 선호해`, distractorConcept: "인덴트 스타일" },
		{ nl: `셸은 ${shell} 써`, entities: [shell], extractable: [`셸: ${shell}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `셸은 ${pickExcept(SHELLS, shell)} 써`, distractorConcept: "셸" },
		{ nl: `터미널은 ${terminal}이야`, entities: [terminal], extractable: [`터미널: ${terminal}`], type: "natural_language" },
		{ nl: `패키지 매니저는 ${pkg}야`, entities: [pkg], extractable: [`패키지 매니저: ${pkg}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `패키지 매니저는 ${pickExcept(PKG_MGRS, pkg)}야`, distractorConcept: "패키지 매니저" },
		{ nl: `${editor} 버전은 ${ver}이야`, entities: [ver], extractable: [`에디터 버전: ${ver}`], type: "unique_id" },
		{ nl: `Git은 CLI로 써`, entities: ["CLI"], extractable: ["Git: CLI"], type: "natural_language" },
		{ nl: `DB는 ${pick(["포스트그레스", "몽고디비", "레디스"])} 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `OS는 ${pick(["페도라", "아치", "우분투"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `컨테이너는 ${pick(["파드만", "도커"])} 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `CI는 ${pick(["깃헙액션", "씨아이클"])}이야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `클라우드는 ${pick(["지씨피", "에이우에스", "애저"])} 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `배포는 ${pick(["클라우드런", "파겟", "엘비"])}로 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `로깅은 ${pick(["피노", "윈스턴", "번얀"])}이야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `모니터링은 ${pick(["센트리", "데이터독", "그라파나"])} 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `모노레포는 ${pick(["터보레포", "엔엑스", "러너"])}로 관리해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `코드 커버리지 목표는 ${rng(60, 95)}%야`, entities: [], extractable: [], type: "unique_id" },
	];
}

function genPreferenceTemplates(): FactTemplate[] {
	const fruit = pick(EXOTIC_FRUITS);
	const drink = pick(DRINKS);
	const color = pick(COLORS);
	const movie = pick(MOVIES);
	const music = pick(MUSIC_GENRES);

	return [
		{ nl: `좋아하는 과일은 ${fruit}야`, entities: [fruit], extractable: [`좋아하는 과일: ${fruit}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `좋아하는 과일은 ${pickExcept(EXOTIC_FRUITS, fruit)}야`, distractorConcept: "좋아하는 과일" },
		{ nl: `좋아하는 음료는 ${drink}야`, entities: [drink], extractable: [`좋아하는 음료: ${drink}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `좋아하는 음료는 ${pickExcept(DRINKS, drink)}야`, distractorConcept: "좋아하는 음료" },
		{ nl: `좋아하는 색은 ${color}야`, entities: [color], extractable: [`좋아하는 색: ${color}`], type: "natural_language" },
		{ nl: `가장 좋아하는 영화는 "${movie}"야`, entities: [movie], extractable: [`좋아하는 영화: ${movie}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `가장 좋아하는 영화는 "${pickExcept(MOVIES, movie)}"야`, distractorConcept: "좋아하는 영화" },
		{ nl: `음악은 ${music} 좋아해`, entities: [music], extractable: [`좋아하는 음악: ${music}`], type: "natural_language" },
		{ nl: `매운 음식 싫어해`, entities: [], extractable: ["매운맛: 싫어함"], type: "natural_language",
			distractorType: "negative", distractorNl: `매운 음식 좋아해`, distractorConcept: "매운 음식 선호도" },
		{ nl: `비 올 때는 집에서 책 읽기 좋아해`, entities: [], extractable: ["비 올 때: 집에서 책 읽기"], type: "natural_language" },
		{ nl: `술은 안 마셔`, entities: [], extractable: ["술: 안 마심"], type: "natural_language",
			distractorType: "negative", distractorNl: `술 자주 마셔`, distractorConcept: "음주 여부" },
		{ nl: `회식은 안 가. 점심은 가능해`, entities: [], extractable: ["회식(저녁): 안 감", "점심: 가능"], type: "natural_language",
			distractorType: "conditional", distractorNl: `회식도 가고 점심도 가능해`, distractorConcept: "회식 참석" },
		{ nl: `아침은 꼭 챙겨 먹어`, entities: [], extractable: ["아침: 챙겨 먹음"], type: "natural_language" },
		{ nl: `야식은 안 먹어`, entities: [], extractable: ["야식: 안 먹음"], type: "natural_language",
			distractorType: "negative", distractorNl: `야식 자주 먹어`, distractorConcept: "야식 여부" },
		{ nl: `좋아하는 계절은 ${pick(SEASONS)}이야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `좋아하는 동물은 ${pick(["고양이", "강아지", "토끼", "햄스터"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `좋아하는 숫자는 ${rng(1, 100)}야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `싫어하는 음식은 ${pick(["브로콜리", "당근", "셀러리", "가지"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `방 안에 식물 좋아해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `좋아하는 책 장르는 ${pick(["SF", "판타지", "미스터리", "에세이"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `팟캐스트 좋아해. 출퇴근길에 들어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `디지털 미니멀리즘 지향해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `좋아하는 브랜드는 ${pick(["뮤지엄", "포맨트", "더랩"])}야`, entities: [], extractable: [], type: "natural_language" },
	];
}

function genPersonalTemplates(): FactTemplate[] {
	const city = pick(CITIES);
	const district = pick(DISTRICTS);
	const pet = pick(PETS);
	const petName = pick(PET_NAMES);
	const petAge = rng(2, 12);

	return [
		{ nl: `${city} ${district}에 살아`, entities: [city, district], extractable: [`거주지: ${city} ${district}`], type: "natural_language",
			distractorType: "partial_match", distractorNl: `${city} ${pickExcept(DISTRICTS, district)}에 살아`, distractorConcept: "같은 도시 다른 구" },
		{ nl: `반려동물은 ${pet} "${petName}"이야`, entities: [pet, petName], extractable: [`반려동물: ${pet} "${petName}"`], type: "natural_language" },
		{ nl: `${petName}는 ${petAge}살이야`, entities: [`${petAge}살`], extractable: [`반려동물 나이: ${petAge}살`], type: "natural_language" },
		{ nl: `자전거 타고 출퇴근해`, entities: [], extractable: ["출퇴근: 자전거"], type: "natural_language" },
		{ nl: `집은 ${rng(1, 99)}번길 ${rng(1, 200)} ${rng(101, 1505)}호야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `3년째 여기 살아`, entities: [], extractable: ["거주기간: 3년"], type: "natural_language" },
		{ nl: `이사하기 전에는 ${pickExcept(CITIES, city)}에 살았어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `집 근처에 ${pick(["카페", "공원", "도서관", "헬스장"])} 있어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `관리비는 ${rng(10, 30)}만원이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `주차장 있어. 지하야`, entities: [], extractable: ["주차장: 있음 (지하)"], type: "natural_language" },
		{ nl: `이웃이랑은 안 친해`, entities: [], extractable: ["이웃 관계: 안 친함"], type: "natural_language",
			distractorType: "negative", distractorNl: `이웃이랑 친해`, distractorConcept: "이웃 관계" },
		{ nl: `방 ${rng(1, 4)}개야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `오피스텔이야`, entities: ["오피스텔"], extractable: ["주거형태: 오피스텔"], type: "natural_language" },
		{ nl: `월요일마다 청소해`, entities: [], extractable: ["청소: 매주 월요일"], type: "natural_language" },
		{ nl: `빨래는 ${pick(["매일", "격일", "주 2회"])} 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `일찍 자려고 노력해. ${rng(10, 12)}시 전에는`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `새벽에 물 한 잔 마셔`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `아침에 샤워해`, entities: [], extractable: ["샤워: 아침"], type: "natural_language" },
		{ nl: `커피는 집에서 타서 마셔`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `배달 음식은 주 ${rng(1, 3)}번 시켜먹어`, entities: [], extractable: [], type: "natural_language" },
	];
}

function genTemporalTemplates(): FactTemplate[] {
	const joinYear = rng(2020, 2024);
	const joinMonth = rng(1, 12);
	const joinDay = rng(1, 28);
	const meetingDay = pick(WEEKDAYS);
	const payDay = rng(1, 28);

	return [
		{ nl: `${joinYear}년 ${joinMonth}월 ${joinDay}일에 입사했어`, entities: [`${joinYear}년`, `${joinMonth}월`, `${joinDay}일`], extractable: [`입사일: ${joinYear}년 ${joinMonth}월 ${joinDay}일`], type: "unique_id",
			distractorType: "exact_substitute", distractorNl: `${joinYear + 1}년 ${rng(1, 12)}월 ${rng(1, 28)}일에 입사했어`, distractorConcept: "입사일" },
		{ nl: `매주 ${meetingDay}에 팀 미팅 있어`, entities: [meetingDay], extractable: [`팀 미팅: 매주 ${meetingDay}`], type: "natural_language" },
		{ nl: `매월 ${payDay}일에 급여 받아`, entities: [`${payDay}일`], extractable: [`급여일: 매월 ${payDay}일`], type: "natural_language" },
		{ nl: `매년 ${pick(SEASONS)}에 휴가 가`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `매일 ${rng(6, 9)}시에 출근해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `매일 ${rng(6, 8)}시에 일어나`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `매일 ${rng(22, 24)}시에 자`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `주 ${rng(2, 5)}회 운동해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `매월 첫째 주 월요일에 월간 회고해`, entities: [], extractable: ["월간 회고: 첫째 주 월요일"], type: "natural_language" },
		{ nl: `분기별로 OKR 체크해`, entities: [], extractable: ["OKR 체크: 분기별"], type: "natural_language" },
		{ nl: `작년에 이사했어`, entities: [], extractable: ["이사: 작년"], type: "natural_language",
			temporalUpdate: "올해 또 이사했어", temporalReplaces: "이사 시기" },
		{ nl: `첫 직장은 ${pick(COMPANIES)}였어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `${rng(2, 5)}년 동안 이 회사 다녔어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `매주 금요일에 코드 리뷰해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `매월 마지막 주에 배포해`, entities: [], extractable: ["배포: 매월 마지막 주"], type: "natural_language" },
		{ nl: `스프린트는 2주 단위야`, entities: [], extractable: ["스프린트: 2주"], type: "natural_language" },
		{ nl: `리포트는 매월 ${rng(20, 30)}일까지 작성해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `연차는 ${rng(5, 15)}일 남았어`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `올해 목표는 ${pick(["다이어트", "자격증", "어학", "프로젝트 런칭"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `다음 달에 ${pick(["치과", "건강검진", "안과"])} 가기로 했어`, entities: [], extractable: [], type: "natural_language" },
	];
}

function genWorkTemplates(): FactTemplate[] {
	const company = pick(COMPANIES);
	const dept = pick(DEPTS);
	const floor = rng(3, 25);
	const ext = rng(1000, 9999);

	return [
		{ nl: `${company} ${dept}에서 일해`, entities: [company, dept], extractable: [`회사: ${company}`, `부서: ${dept}`], type: "natural_language",
			distractorType: "hierarchical", distractorNl: `${company} ${pickExcept(DEPTS, dept)}에서 일해`, distractorConcept: "같은 회사 다른 부서" },
		{ nl: `사무실은 ${floor}층이야`, entities: [`${floor}층`], extractable: [`층: ${floor}층`], type: "natural_language" },
		{ nl: `내선번호는 ${ext}야`, entities: [`${ext}`], extractable: [`내선번호: ${ext}`], type: "unique_id" },
		{ nl: `리모트 워크 선호해`, entities: [], extractable: ["선호: 리모트"], type: "natural_language" },
		{ nl: `주 ${rng(2, 5)}회 출근해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `점심은 ${pick(["12시", "12시 반", "1시"])}에 먹어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `동료들이랑 점심 먹어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `PR 리뷰어 ${rng(1, 3)}명 필수야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `테스트 커버리지 ${rng(60, 90)}% 유지해`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `사내 메신저는 ${pick(["슬랙", "디스코드", "팀즈"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `이메일은 ${pick(["구글웍스페이스", "오피스365"])} 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `문서화는 ${pick(["노션", "컨플루언스", "리니어"])}로 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `A/B 테스트는 ${pick(["포스트혹", "앰플리튜드"])}로 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `기술 블로그는 ${pick(["해시노드", "벨로그", "미디엄"])}에 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `팀원 ${rng(3, 10)}명이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `공동창업자 ${pick(NAMES_M)}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `DAU 목표는 ${rng(100, 1000)}명이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `구독 가격은 ${rng(5, 20) * 1000}원이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `투자 ${rng(1, 5)}억 받았어`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `팀 회고는 ${pick(WEEKDAYS)}에 해`, entities: [], extractable: [], type: "natural_language" },
	];
}

function genHealthTemplates(): FactTemplate[] {
	const allergy = pick(ALLERGIES);
	const med = pick(MEDS);
	const dose = rng(5, 100);

	return [
		{ nl: `${allergy} 알레르기 있어`, entities: [allergy], extractable: [`알레르기: ${allergy}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `${pickExcept(ALLERGIES, allergy)} 알레르기 있어`, distractorConcept: "알레르기" },
		{ nl: `매일 ${med} ${dose}mg 먹어`, entities: [med, `${dose}mg`], extractable: [`약: ${med} ${dose}mg`], type: "natural_language" },
		{ nl: `운동은 주 ${rng(2, 5)}회 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `운동은 ${pick(EXERCISE_TYPES)} 위주로 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `수면은 ${rng(5, 8)}시간 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `코골이 있어`, entities: [], extractable: ["코골이: 있음"], type: "natural_language" },
		{ nl: `체지방률 ${rng(12, 25)}%야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `혈압은 정상이야`, entities: [], extractable: ["혈압: 정상"], type: "natural_language" },
		{ nl: `스트레칭 매일 해`, entities: [], extractable: ["스트레칭: 매일"], type: "natural_language" },
		{ nl: `건강검진 매년 받아`, entities: [], extractable: ["건강검진: 매년"], type: "natural_language" },
		{ nl: `안경 써. 도수는 ${rng(1, 5)}.${rng(0, 5)}이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `치과 ${rng(3, 12)}개월마다 가`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `비타민 ${pick(["C", "D", "B군"])} 먹어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `물 하루 ${rng(1, 3)}리터 마셔`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `카페인은 오후 ${rng(2, 5)}시 이후엔 안 마셔`, entities: [], extractable: [], type: "natural_language",
			distractorType: "conditional", distractorNl: `카페인은 언제든 마셔`, distractorConcept: "카페인 섭취 제한" },
		{ nl: `명상은 안 해`, entities: [], extractable: ["명상: 안 함"], type: "natural_language",
			distractorType: "negative", distractorNl: `매일 명상해`, distractorConcept: "명상 여부" },
		{ nl: `담배 안 펴`, entities: [], extractable: ["흡연: 안 함"], type: "natural_language",
			distractorType: "negative", distractorNl: `담배 펴`, distractorConcept: "흡연 여부" },
		{ nl: `병원등록번호는 ${genCode("MC")}야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `약은 아침에 먹어`, entities: [], extractable: ["약 복용: 아침"], type: "natural_language" },
		{ nl: `식사는 규칙적으로 해`, entities: [], extractable: [], type: "natural_language" },
	];
}

function genSocialTemplates(): FactTemplate[] {
	const friend = pick(NAMES_M);
	const friendJob = pick(FRIEND_JOBS);
	const friendSince = rng(2015, 2024);
	const friend2 = pickExcept(NAMES_F, NAMES_F[0]);

	return [
		{ nl: `절친 ${friend}는 ${friendJob}야`, entities: [friend, friendJob], extractable: [`절친: ${friend}`, `직업: ${friendJob}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `절친 ${pickExcept(NAMES_M, friend)}는 ${pickExcept(FRIEND_JOBS, friendJob)}야`, distractorConcept: "절친 이름/직업" },
		{ nl: `${friend}랑 ${friendSince}년부터 알고 지냈어`, entities: [`${friendSince}년`], extractable: [`알게 된 해: ${friendSince}년`], type: "natural_language" },
		{ nl: `${friend2}랑 같이 ${pick(["요리", "등산", "독서", "게임"])} 모임 해`, entities: [friend2], extractable: [], type: "natural_language" },
		{ nl: `SNS는 안 해`, entities: [], extractable: ["SNS: 안 함"], type: "natural_language",
			distractorType: "negative", distractorNl: `SNS 자주 해`, distractorConcept: "SNS 사용" },
		{ nl: `모임은 ${pick(["월 1회", "주 1회", "격주"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `${pick(NAMES_M)}는 ${pick(["서울", "부산", "대전"])}에 살아`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `동네 친구 ${pick(NAMES_M)} 있어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `대학 동기 ${pick(NAMES_F)} 있어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `전화번호는 자주 안 바꿔`, entities: [], extractable: ["전화번호: 자주 안 바꿈"], type: "natural_language" },
		{ nl: `생일 선물은 ${pick(["직접 만들어", "고민해서 사"])}줘`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `친한 친구 ${rng(2, 5)}명 있어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `인맥 관리는 안 해`, entities: [], extractable: ["인맥 관리: 안 함"], type: "natural_language" },
		{ nl: `모임에서는 잘 안 말해`, entities: [], extractable: ["모임: 말 없는 편"], type: "natural_language",
			distractorType: "negative", distractorNl: `모임에서 리드하는 편이야`, distractorConcept: "모임 성향" },
		{ nl: `${pick(NAMES_M)} 전화번호 뒷자리 ${rng(1000, 9999)}야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `매년 ${pick(["크리스마스", "연말", "생일"])}에 모여`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `단톡방 ${rng(2, 8)}개 있어`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `맛집 ${pick(NAMES_M)}랑 자주 가`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `여행은 친구들이랑 가`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `${pick(NAMES_F)} 생일은 ${rng(1, 12)}월 ${rng(1, 28)}일이야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `멘토 ${pick(NAMES_M)} 있어`, entities: [], extractable: [], type: "natural_language" },
	];
}

function genFinanceTemplates(): FactTemplate[] {
	const rent = genAmount();
	const savings = genAmount();

	return [
		{ nl: `월세는 ${rent}원이야`, entities: [`${rent}원`], extractable: [`월세: ${rent}원`], type: "unique_id",
			distractorType: "exact_substitute", distractorNl: `월세는 ${genAmount()}원이야`, distractorConcept: "월세" },
		{ nl: `적금은 매월 ${savings}원씩 넣어`, entities: [`${savings}원`], extractable: [`적금: ${savings}원/월`], type: "unique_id" },
		{ nl: `투자는 안 해`, entities: [], extractable: ["투자: 안 함"], type: "natural_language",
			distractorType: "negative", distractorNl: `주식 투자 해`, distractorConcept: "투자 여부" },
		{ nl: `카드는 ${pick(CARDS)} 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `통장은 ${pick(BANKS)}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `계좌 뒷자리 ${rng(1000, 9999)}야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `월급은 ${rng(300, 800)}만원이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `식비는 월 ${rng(30, 80)}만원이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `교통비는 ${rng(5, 15)}만원이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `구독 서비스 ${rng(2, 5)}개 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `네이버 페이 자주 써`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `현금은 잘 안 써`, entities: [], extractable: ["현금: 안 씀"], type: "natural_language",
			distractorType: "negative", distractorNl: `현금 자주 써`, distractorConcept: "현금 사용" },
		{ nl: `가계부 써`, entities: [], extractable: ["가계부: 씀"], type: "natural_language" },
		{ nl: `비상금 ${rng(300, 2000)}만원 있어`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `대출은 없어`, entities: [], extractable: ["대출: 없음"], type: "natural_language",
			distractorType: "negative", distractorNl: `대출 ${rng(1000, 5000)}만원 있어`, distractorConcept: "대출 여부" },
		{ nl: `보험은 ${pick(["건강보험만", "실비만", "종합"])}이야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `저축률은 ${rng(10, 40)}%야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `프리미엄 서비스는 ${pick(["쓰지 않아", "하나만 써", "두 개 써"])}`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `경조사비는 연 ${rng(50, 200)}만원 정도 써`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `부수입은 없어`, entities: [], extractable: ["부수입: 없음"], type: "natural_language" },
	];
}

function genHobbyTemplates(): FactTemplate[] {
	const hobby = pick(HOBBIES);
	const venue = pick(VENUES);
	const rank = `${rng(1, 20)}.${rng(0, 99)}`;

	return [
		{ nl: `취미는 ${hobby}야`, entities: [hobby], extractable: [`취미: ${hobby}`], type: "natural_language",
			distractorType: "exact_substitute", distractorNl: `취미는 ${pickExcept(HOBBIES, hobby)}야`, distractorConcept: "취미" },
		{ nl: `${venue}에서 취미 활동해`, entities: [venue], extractable: [`장소: ${venue}`], type: "natural_language",
			distractorType: "partial_match", distractorNl: `${pickExcept(VENUES, venue)}에서 취미 활동해`, distractorConcept: "같은 취미 다른 장소" },
		{ nl: `보드게임 랭킹 ${rank}위야`, entities: [rank], extractable: [`랭킹: ${rank}위`], type: "unique_id" },
		{ nl: `주말엔 보통 ${pick(WEEKEND_ACTS)} 해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `음악은 ${pick(MUSIC_GENRES)} 좋아해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `사진 찍는 것도 좋아해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `카메라는 ${pick(["소니", "캐논", "후지필름"])} ${pick(["A7C", "R6", "X-T5"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `렌즈는 ${pick(["35mm", "50mm", "24-70mm"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `독서는 ${pick(["SF", "판타지", "미스터리", "에세이"])} 좋아해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `한 달에 책 ${rng(1, 5)}권 읽어`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `게임은 안 해`, entities: [], extractable: ["게임: 안 함"], type: "natural_language",
			distractorType: "negative", distractorNl: `게임 좋아해`, distractorConcept: "게임 여부" },
		{ nl: `요리 취미야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `잘하는 요리는 ${pick(["파스타", "볶음밥", "카레", "샐러드"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `드론 날려`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `천문관측 좋아해`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `망원경은 ${pick(["돕소니안", "굴절", "반사"])} ${rng(60, 200)}mm야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `등산도 가끔 가`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `최근 등반한 건 ${pick(["블루크릭 산맥", "코랄 봉우리", "실버 능선"])}야`, entities: [], extractable: [], type: "natural_language" },
		{ nl: `실내등반 ${pick(["V3", "V4", "V5"])} 레벨이야`, entities: [], extractable: [], type: "unique_id" },
		{ nl: `테라리움 만들어`, entities: [], extractable: [], type: "natural_language" },
	];
}

// ─── Build Fact Bank ─────────────────────────────────────────────────────────

const domainGenerators: Record<string, () => FactTemplate[]> = {
	identity: genIdentityTemplates,
	tech: genTechTemplates,
	preference: genPreferenceTemplates,
	personal: genPersonalTemplates,
	temporal: genTemporalTemplates,
	work: genWorkTemplates,
	health: genHealthTemplates,
	social: genSocialTemplates,
	finance: genFinanceTemplates,
	hobby: genHobbyTemplates,
};

type DistractorType = "exact_substitute" | "partial_match" | "negative" | "conditional" | "hierarchical";

interface V2Fact {
	id: string;
	domain: string;
	fact_type: "natural_language" | "unique_id";
	statement: string;
	entities: string[];
	extractable_facts: string[];
	distractor?: {
		id: string;
		type: DistractorType;
		statement: string;
		shared_concept: string;
	};
	temporal_updates?: Array<{
		id: string;
		statement: string;
		replaces_extractable: string;
	}>;
}

interface V2Query {
	category: string;
	fact_ref: string | string[];
	query: string;
	scoring: { score_3: string[]; score_2: string[]; score_1: string[]; score_0: string[] };
	is_reasoning?: boolean;
	reasoning_note?: string;
	setup?: string;
	update?: string;
	verify?: string;
	noisy_input?: string;
	expected_pattern?: string;
	hallucination_keywords?: string[];
	distractor_ref?: string;
	distractor_note?: string;
	expected_not_contains?: string[];
	expected_any?: string[];
	min_expected?: number;
	min_facts?: number;
	context?: string;
	weight?: number;
}


// ─── Auto-fill extractable_facts + distractors ────────────────────────────────

const NEGATION_MAP: Record<string,string> = {
	'안 마셔': '마셔', '안 해': '해', '없어': '있어', '안 함': '함', '안 좋아': '좋아',
	'안 가': '가', '안 먹어': '먹어', '안 써': '써', '안 펴': '펴', '안 타': '타',
	'싫어해': '좋아해', '없음': '있음',
};

function negateStatement(s: string): string {
	for (const [neg, pos] of Object.entries(NEGATION_MAP)) {
		if (s.includes(neg)) return s.replace(neg, pos);
		if (s.includes(pos) && !s.includes('안 ')) return s.replace(pos, '안 ' + pos);
	}
	return s.replace(/이야$/, '가 아니야').replace(/해$/, '안 해').replace(/써$/, '안 써').replace(/마셔$/, '안 마셔') || s + ' (아님)';
}

function autoFillExtractable(f: V2Fact): void {
	if (f.extractable_facts.length > 0 && f.extractable_facts[0].includes(": ")) return;
	const s = f.statement;
	const clean = s.replace(/^(나는|내|요즘|보통|매일|주말엔|매주|아 참|흠|아 맞다|가끔|요즘)\s*/g, '').trim();
	const m = clean.match(/^(.+?)[은는이가](.+?)[이야해]$|^(.+?)[은는이가](.+?)$/);
	if (m) {
		const key = (m[1] || m[3] || '').trim();
		const val = (m[2] || m[4] || '').trim();
		if (key && val && key.length < 15 && val.length < 30) {
			f.extractable_facts = [key + ': ' + val.replace(/[이야해]$/, '')];
			if (!f.entities.includes(val) && val.length < 20) f.entities.push(val.replace(/[이야해]$/, ''));
			return;
		}
	}
	// Fallback: use first meaningful phrase as key:val
	const fallback = clean.split(/[.。,，]/)[0].trim();
	if (fallback.length > 2 && fallback.length < 50) {
		f.extractable_facts = [fallback];
		if (!f.entities.includes(fallback)) f.entities.push(fallback);
	}
}

function buildFacts(): V2Fact[] {
	srand(42);
	const allFacts: V2Fact[] = [];
	let factIdx = 1;

	for (const domain of DOMAINS) {
		const templates = domainGenerators[domain]();
		for (const t of templates) {
			const id = `F${pad3(factIdx)}`;
			const fact: V2Fact = {
				id, domain, fact_type: t.type,
				statement: t.nl, entities: t.entities, extractable_facts: t.extractable,
			};
			if (t.distractorType && t.distractorNl) {
				fact.distractor = {
					id: `${id}d`, type: t.distractorType,
					statement: t.distractorNl, shared_concept: t.distractorConcept ?? "",
				};
			}
			if (t.temporalUpdate) {
				fact.temporal_updates = [{
					id: `${id}u1`, statement: t.temporalUpdate, replaces_extractable: t.temporalReplaces ?? "",
				}];
			}
			allFacts.push(fact);
			factIdx++;
		}
	}

	
	// Auto-fill extractable_facts for facts with empty arrays
	for (const f of allFacts) autoFillExtractable(f);

	// Auto-fill entities for facts with empty arrays
	for (const f of allFacts) {
		if (f.entities.length > 0) continue;
		for (const ef of f.extractable_facts) {
			const val = ef.split(": ")[1];
			if (val && val.length > 0 && val.length < 30) f.entities.push(val);
		}
	}

	// Fix distractors where statement == original (negateStatement failed)
	const swapValues: Record<string, string[]> = {
		"이름": [...NAMES_F], "언니": [...NAMES_M], "동생": [...NAMES_M],
		"MBTI": [...MBTI_TYPES], "혈액형": [...BLOOD_TYPES].map(b => b + "형"),
		"에디터": [...TECH_TOOLS], "주 언어": [...TECH_TOOLS], "프레임워크": [...TECH_TOOLS],
		"과일": [...EXOTIC_FRUITS], "음료": [...DRINKS], "색": [...COLORS], "영화": [...MOVIES],
		"회사": [...COMPANIES], "부서": [...DEPTS], "알레르기": [...ALLERGIES],
		"약": [...MEDS], "취미": [...HOBBIES], "장소": [...VENUES],
		"셸": [...SHELLS], "터미널": [...TERMINALS], "카드": [...CARDS], "통장": [...BANKS],
		"음악": [...MUSIC_GENRES], "도시": [...CITIES], "구": [...DISTRICTS],
	};
	for (const f of allFacts) {
		if (!f.distractor) continue;
		if (f.distractor.statement !== f.statement) continue;
		const key = f.extractable_facts[0]?.split(": ")[0]?.trim() ?? "";
		const mainVal = f.extractable_facts[0]?.split(": ")[1]?.trim() ?? "";
		let swapped = false;
		for (const [k, pool] of Object.entries(swapValues)) {
			if (key.includes(k) || f.statement.includes(k)) {
				const alt = pool.filter(v => v !== mainVal && !f.statement.includes(v));
				if (alt.length > 0) {
					const newVal = pick(alt);
					f.distractor.statement = f.statement.replace(mainVal, newVal);
					swapped = true;
					break;
				}
			}
		}
		if (!swapped) {
			const altPool = swapValues["에디터"] ?? [];
			if (altPool.length > 0) {
				f.distractor.statement = f.statement + " (아님)";
			}
		}
	}

	// Auto-generate distractors for facts missing them (target 55%)
	const distTargets = Math.ceil(allFacts.length * 0.55);
	const factsWithoutDist = allFacts.filter(f => !f.distractor && f.extractable_facts.length > 0);
	const distTypes: DistractorType[] = ['exact_substitute', 'partial_match', 'negative', 'conditional', 'hierarchical'];
	let added = allFacts.filter(f => f.distractor && f.distractor.statement !== f.statement).length;
	for (const f of factsWithoutDist) {
		if (added >= distTargets) break;
		if (rng(0, 100) > 60) continue;
		const mainVal = f.extractable_facts[0]?.split(": ")[1]?.trim() ?? "";
		const key = f.extractable_facts[0]?.split(": ")[0]?.trim() ?? "";
		if (!mainVal) continue;
		const dtype = pick(distTypes);
		let negated = f.statement.replace(mainVal, mainVal + "(아님)");
		for (const [k, pool] of Object.entries(swapValues)) {
			if (key.includes(k) || f.statement.includes(k)) {
				const alt = pool.filter(v => v !== mainVal);
				if (alt.length > 0) { negated = f.statement.replace(mainVal, pick(alt)); break; }
			}
		}
		f.distractor = {
			id: f.id + 'd',
			type: dtype,
			statement: negated,
			shared_concept: key,
		};
		added++;
	}

	// Fix temporal_updates to actually change values
	for (const f of allFacts) {
		if (!f.temporal_updates || f.temporal_updates.length === 0) continue;
		const mainVal = f.extractable_facts[0]?.split(": ")[1]?.trim() ?? "";
		const key = f.extractable_facts[0]?.split(": ")[0]?.trim() ?? "";
		if (!mainVal) continue;
		let newVal = mainVal;
		for (const [k, pool] of Object.entries(swapValues)) {
			if (key.includes(k) || f.statement.includes(k)) {
				const alt = pool.filter(v => v !== mainVal);
				if (alt.length > 0) { newVal = pick(alt); break; }
			}
		}
		if (newVal === mainVal) newVal = mainVal + " (이전값)";
		f.temporal_updates[0].statement = `${key} ${newVal}(으)로 바꿨어. 예전에는 ${mainVal}였어`;
		f.temporal_updates[0].replaces_extractable = f.extractable_facts[0];
	}

	// Auto-generate temporal_updates for more facts (target 8+)
	const temporalTargets = ['temporal', 'work', 'tech', 'personal', 'preference'];
	let temporalAdded = allFacts.filter(f => f.temporal_updates && f.temporal_updates.length > 0).length;
	for (const f of allFacts) {
		if (temporalAdded >= 10) break;
		if (f.temporal_updates) continue;
		if (!temporalTargets.includes(f.domain)) continue;
		if (f.extractable_facts.length === 0) continue;
		if (rng(0, 100) > 35) continue;
		const mainVal = f.extractable_facts[0]?.split(": ")[1]?.trim() ?? "";
		const key = f.extractable_facts[0]?.split(": ")[0]?.trim() ?? "";
		if (!mainVal) continue;
		let newVal = mainVal;
		for (const [k, pool] of Object.entries(swapValues)) {
			if (key.includes(k) || f.statement.includes(k)) {
				const alt = pool.filter(v => v !== mainVal);
				if (alt.length > 0) { newVal = pick(alt); break; }
			}
		}
		if (newVal === mainVal) continue;
		f.temporal_updates = [{
			id: f.id + 'u1',
			statement: `${key} ${newVal}(으)로 바꿨어. 예전에는 ${mainVal}였어`,
			replaces_extractable: f.extractable_facts[0],
		}];
		temporalAdded++;
	}

	return allFacts;
}

// ─── Build Query Templates ───────────────────────────────────────────────────

function buildQueries(facts: V2Fact[]): V2Query[] {
	srand(99);
	const queries: V2Query[] = [];
	const factMap = new Map(facts.map((f) => [f.id, f]));
	const byDomain = new Map<string, V2Fact[]>();
	for (const f of facts) {
		const list = byDomain.get(f.domain) ?? [];
		list.push(f);
		byDomain.set(f.domain, list);
	}

	const factsWithDistractors = facts.filter((f) => f.distractor);
	const factsWithExtractable = facts.filter((f) => f.extractable_facts.length > 0);
	const nlFacts = facts.filter((f) => f.fact_type === "natural_language" && f.extractable_facts.length > 0);
	const factsWithTemporal = facts.filter((f) => f.temporal_updates && f.temporal_updates.length > 0);
	const negFacts = facts.filter((f) => f.distractor?.type === "negative");

	// 1. direct_recall (40)
	for (const f of shuffle(factsWithExtractable).slice(0, 40)) {
		const mainVal = f.extractable_facts[0]?.split(": ")[1] ?? f.entities[0];
		if (!mainVal) continue;
		const qTemplates = getDirectRecallQueries(f, mainVal);
		queries.push(...qTemplates.slice(0, Math.ceil(40 / factsWithExtractable.length) + 1));
		if (queries.filter((q) => q.category === "direct_recall").length >= 40) break;
	}

	// 2. semantic_search (20) — multi-fact
	const domainList = [...byDomain.entries()];
	for (let i = 0; i < 20 && i < domainList.length * 2; i++) {
		const [domain, dFacts] = domainList[i % domainList.length];
		const selected = shuffle(dFacts.filter((f) => f.extractable_facts.length > 0)).slice(0, rng(2, 4));
		if (selected.length < 2) continue;
		const q = genSemanticQuery(selected, domain);
		if (q) queries.push(q);
	}

	// 3. proactive_recall (20)
	const proactiveFacts = shuffle(factsWithExtractable).slice(0, 20);
	for (const f of proactiveFacts) {
		const q = genProactiveQuery(f);
		if (q) queries.push(q);
	}

	// 4. abstention (20)
	queries.push(...genAbstentionQueries());

	// 5. irrelevant_isolation (15)
	queries.push(...genIrrelevantQueries());

	// 6. multi_fact_synthesis (15)
	for (let i = 0; i < 15; i++) {
		const dFacts = shuffle(byDomain.get(pick(DOMAINS)) ?? []).filter((f) => f.extractable_facts.length > 0);
		if (dFacts.length < 3) continue;
		const q = genMultiFactQuery(dFacts.slice(0, rng(3, 5)));
		if (q) queries.push(q);
	}

	// 7. entity_disambiguation (20)
	for (const f of shuffle(factsWithDistractors).slice(0, 20)) {
		const q = genDisambiguationQuery(f);
		if (q) queries.push(q);
	}

	// 8. contradiction_direct (20)
	for (const f of shuffle(nlFacts).slice(0, 20)) {
		const q = genContradictionDirectQuery(f);
		if (q) queries.push(q);
	}

	// 9. contradiction_indirect (15)
	for (const f of shuffle(nlFacts).slice(0, 15)) {
		const q = genContradictionIndirectQuery(f);
		if (q) queries.push(q);
	}

	// 10. unchanged_persistence (15)
	for (const f of shuffle(factsWithExtractable).slice(0, 15)) {
		const mainVal = f.extractable_facts[0]?.split(": ")[1];
		if (!mainVal) continue;
		queries.push({
			category: "unchanged_persistence", fact_ref: f.id,
			query: `${getDomainQuestion(f)}`,
			scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
			context: "다른 항목이 변경되었으나 이 항목은 유지되어야 함",
		});
	}

	// 11. temporal (20)
	const temporalFacts = facts.filter((f) => f.domain === "temporal");
	const allTemporalCandidates = shuffle(temporalFacts.concat(factsWithTemporal));
	for (const f of allTemporalCandidates.slice(0, 20)) {
		const q = genTemporalQuery(f);
		if (q) queries.push(q);
	}
	while (queries.filter((q) => q.category === "temporal").length < 20) {
		const f = pick(temporalFacts.length > 0 ? temporalFacts : factsWithExtractable);
		const mainVal = f.extractable_facts[0]?.split(": ")[1] ?? f.entities[0];
		if (!mainVal) continue;
		queries.push({
			category: "temporal", fact_ref: f.id,
			query: `이전 ${f.extractable_facts[0]?.split(": ")[0] ?? "상태"} 뭐였어?`,
			scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
		});
	}

	// 12. noise_resilience (20)
	for (const f of shuffle(factsWithExtractable).slice(0, 20)) {
		const q = genNoiseQuery(f);
		if (q) queries.push(q);
	}

	// 13. reasoning (explicit, from negFacts + cross-domain)
	for (const f of shuffle(negFacts).slice(0, 8)) {
		const mainVal = f.extractable_facts[0]?.split(": ")[1];
		if (!mainVal) continue;
		queries.push({
			category: "direct_recall", fact_ref: f.id,
			query: `${mainVal} 관련해서 나한테 뭐라고 했었지?`,
			scoring: { score_3: getNegExpectedWords(f), score_2: [], score_1: [], score_0: [] },
			is_reasoning: true,
			reasoning_note: `부정 팩트 추론: "${f.statement}" → ${mainVal}에 대한 부정적 답변 필요`,
		});
	}
	const identityFacts = facts.filter((f) => f.domain === "identity" && f.extractable_facts.length >= 2);
	const healthFacts = facts.filter((f) => f.domain === "health" && f.extractable_facts.length >= 1);
	if (identityFacts.length > 0 && healthFacts.length > 0) {
		for (let i = 0; i < Math.min(7, identityFacts.length, healthFacts.length); i++) {
			const idFact = identityFacts[i];
			const hFact = healthFacts[i];
			const relName = idFact.extractable_facts.find((e) => e.includes("동생") || e.includes("언니") || e.includes("형") || e.includes("누나"));
			const allergy = hFact.extractable_facts.find((e) => e.includes("알레르기"));
			if (relName && allergy) {
				const allergyItem = allergy.split(": ")[1];
				queries.push({
					category: "direct_recall", fact_ref: [idFact.id, hFact.id],
					query: `${relName.split(": ")[0]} ${allergyItem} 먹어도 돼?`,
					scoring: { score_3: ["안 돼", "안되", "알레르기"], score_2: [allergyItem], score_1: [], score_0: ["돼", "괜찮"] },
					is_reasoning: true,
					reasoning_note: `추론: ${relName} + ${allergy} → 섭취 가능 여부 판단`,
				});
			}
		}
	}

	return queries;
}

function getDirectRecallQueries(f: V2Fact, mainVal: string): V2Query[] {
	const q: V2Query[] = [];
	q.push({
		category: "direct_recall", fact_ref: f.id,
		query: getDomainQuestion(f),
		scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
	});

	if (f.distractor) {
		const distractorVal = f.distractor.statement;
		q.push({
			category: "direct_recall", fact_ref: f.id,
			query: `나한테 "${f.distractor.shared_concept}" 관련해서 기억나는 거 있어?`,
			scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
			distractor_ref: f.distractor.id,
			distractor_note: `Distractor: ${distractorVal}`,
		});
	}

	if (f.distractor?.type === "negative") {
		q.push({
			category: "direct_recall", fact_ref: f.id,
			query: `나 ${f.distractor.shared_concept} 어떻게 돼?`,
			scoring: {
				score_3: getNegExpectedWords(f),
				score_2: [],
				score_1: [f.distractor.statement.split(" ").pop() ?? ""],
				score_0: [],
			},
			is_reasoning: true,
			reasoning_note: `부정 팩트 확인: ${f.statement}`,
		});
	}

	return q;
}

function getDomainQuestion(f: V2Fact): string {
	const qs: Record<string, string[]> = {
		identity: ["내 이름이 뭐야?", "나 누구야?", "나에 대해 뭐 알아?"],
		tech: ["내 개발 환경 알려줘", "내 기술 스택 뭐야?", "에디터 뭐 써?"],
		preference: ["내 취향 알려줘", "좋아하는 거 뭐야?", "싫어하는 거 있어?"],
		personal: ["나 어디 살아?", "반려동물 있어?", "살고 있는 곳 어때?"],
		temporal: ["일정 알려줘", "언제 입사했어?", "미팅 언제야?"],
		work: ["어디서 일해?", "회사 어때?", "업무 스타일이 어때?"],
		health: ["건강 상태 어때?", "알레르기 있어?", "운동 해?"],
		social: ["친한 친구 누구야?", "친구들 알려줘", "모임 해?"],
		finance: ["재정 상태 어때?", "월세 얼마야?", "투자 해?"],
		hobby: ["취미 뭐야?", "주말에 뭐 해?", "관심사 알려줘"],
	};
	return pick(qs[f.domain] ?? ["뭐 알고 있어?"]);
}

function getNegExpectedWords(f: V2Fact): string[] {
	if (f.statement.includes("안 ")) return ["안", "없", "싫어", "아니"];
	if (f.statement.includes("없")) return ["없", "안", "아니"];
	return ["아니", "안"];
}

function genSemanticQuery(facts: V2Fact[], domain: string): V2Query | null {
	if (facts.length < 2) return null;
	const expectedAny = facts.map((f) => f.extractable_facts[0]?.split(": ")[1]).filter(Boolean) as string[];
	if (expectedAny.length === 0) return null;
	return {
		category: "semantic_search", fact_ref: facts.map((f) => f.id),
		query: `내 ${domain === "identity" ? "기본 정보" : domain === "tech" ? "개발 환경" : domain === "preference" ? "취향" : domain === "personal" ? "개인 정보" : domain === "work" ? "회사 정보" : domain === "health" ? "건강 정보" : domain === "social" ? "인간관계" : domain === "finance" ? "재정 정보" : domain === "hobby" ? "취미 정보" : "관련 정보"} 알려줘`,
		scoring: { score_3: expectedAny, score_2: [], score_1: [], score_0: [] },
		expected_any: expectedAny,
		min_expected: Math.ceil(expectedAny.length / 2),
		weight: 2,
	};
}

function genProactiveQuery(f: V2Fact): V2Query | null {
	const mainVal = f.extractable_facts[0]?.split(": ")[1];
	if (!mainVal) return null;
	const key = f.extractable_facts[0]?.split(": ")[0];
	const prompts: Record<string, string> = {
		"에디터": "에디터 설정 좀 도와줘",
		"주 언어": "이 코드 리팩토링 해줘",
		"프레임워크": "새 프로젝트 세팅해줘",
		"인덴트": "코드 포맷팅 맞춰줘",
		"다크모드": "테마 설정해줘",
	};
	const query = prompts[key ?? ""] ?? `이거 어떻게 해? ${key} 관련으로`;
	return {
		category: "proactive_recall", fact_ref: f.id, query,
		scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
		setup: `${key} 관련 요청 — 기억 기반으로 답해야 함`,
	};
}

function genAbstentionQueries(): V2Query[] {
	return [
		{ category: "abstention", fact_ref: "NONE", query: "내가 쿠버네티스 관련해서 뭐라고 했었지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["Kubernetes", "k8s", "클러스터"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 좋아하는 게임 뭐였지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: [] },
		{ category: "abstention", fact_ref: "NONE", query: "내 차가 뭐였지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: [] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 일본어 할 줄 안다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: [] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 유튜브 채널 운영한다고 했지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["유튜브", "채널"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 Angular 쓴다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["Angular"] },
		{ category: "abstention", fact_ref: "NONE", query: "나 자전거 탄다고 했었지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["자전거"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 서핑 배운다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["서핑"] },
		{ category: "abstention", fact_ref: "NONE", query: "나 석사 학위 있다고 했지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["석사", "대학원"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 MongoDB 쓴다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["MongoDB"] },
		{ category: "abstention", fact_ref: "NONE", query: "나 와인 좋아한다고 했지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["와인"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 서핑 배운다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["서핑"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 테니스 친다고 했었지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["테니스"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 스카이다이빙 해봤다고 했나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["스카이다이빙"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 기타 친다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["기타"] },
		{ category: "abstention", fact_ref: "NONE", query: "나 골프 친다고 했지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["골프"] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 GraphQL 쓴다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["GraphQL"] },
		{ category: "abstention", fact_ref: "NONE", query: "나 딸 키운다고 했지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: [] },
		{ category: "abstention", fact_ref: "NONE", query: "내가 트위터 많이 한다고 했었나?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["트위터", "X"] },
		{ category: "abstention", fact_ref: "NONE", query: "나 등산 좋아한다고 했었지?",
			scoring: { score_3: ["모르", "없", "기억에"], score_2: [], score_1: [], score_0: [] },
			expected_pattern: "없|모르|기억에|말씀하신", hallucination_keywords: ["등산"] },
	];
}

function genIrrelevantQueries(): V2Query[] {
	const personaWords = ["루아", NAMES_F[0], CITIES[0], DISTRICTS[0]];
	return [
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "오늘 날씨 어때?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "파이썬에서 리스트 컴프리헨션 문법이 뭐야?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "HTTP 상태코드 404가 뭐야?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "TCP와 UDP의 차이가 뭐야?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "세계에서 가장 높은 산이 뭐야?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "CSS flexbox 사용법 알려줘",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "양자역학에서 슈뢰딩거 방정식이 뭐야?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "SQL에서 JOIN 종류가 뭐가 있어?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "React와 Vue의 차이점 알려줘",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "파이 값이 얼마야?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "리눅스에서 chmod 명령어 사용법 알려줘",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "2024년 올림픽 어디서 열려?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "자바스크립트에서 Promise.all 사용법 알려줘",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "Git rebase와 merge 차이가 뭐야?",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
		{ category: "irrelevant_isolation", fact_ref: "NONE", query: "코틀린에서 코루틴 사용법 알려줘",
			scoring: { score_3: [], score_2: [], score_1: [], score_0: personaWords },
			expected_not_contains: personaWords },
	];
}

function genMultiFactQuery(facts: V2Fact[]): V2Query | null {
	if (facts.length < 3) return null;
	const expectedAny = facts.map((f) => f.extractable_facts[0]?.split(": ")[1]).filter(Boolean) as string[];
	if (expectedAny.length === 0) return null;
	const domain = facts[0].domain;
	const prompts: Record<string, string> = {
		identity: "내 소개 한 줄로 써줘",
		tech: "우리 기술 스택 정리해줘",
		preference: "내 취향 프로필 만들어줘",
		personal: "내 개인 정보 요약해줘",
		temporal: "내 일정 정리해줘",
		work: "우리 회사 소개서 초안 써줘",
		health: "내 건강 관리 루틴 정리해줘",
		social: "내 인간관계 요약해줘",
		finance: "내 재정 요약해줘",
		hobby: "내 취미 소개 글 써줘",
	};
	return {
		category: "multi_fact_synthesis", fact_ref: facts.map((f) => f.id),
		query: prompts[domain] ?? "관련 정보 종합해줘",
		scoring: { score_3: expectedAny, score_2: [], score_1: [], score_0: [] },
		expected_any: expectedAny,
		min_expected: Math.ceil(expectedAny.length / 2),
		min_facts: 3,
		weight: 2,
	};
}

function genDisambiguationQuery(f: V2Fact): V2Query | null {
	if (!f.distractor) return null;
	const mainVal = f.extractable_facts[0]?.split(": ")[1] ?? f.entities[0];
	if (!mainVal) return null;
	const dVal = f.distractor.statement;
	const key = f.extractable_facts[0]?.split(": ")[0] ?? "";

	return {
		category: "entity_disambiguation", fact_ref: f.id,
		query: `내 ${key} 뭐야?`,
		scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
		setup: `다른 사람은 "${dVal}"라고 했어`,
		distractor_ref: f.distractor.id,
		distractor_note: `Distractor: ${f.distractor.statement}`,
		expected_not_contains: [dVal.split(" ").pop() ?? ""],
		weight: 2,
	};
}

function genContradictionDirectQuery(f: V2Fact): V2Query | null {
	const mainVal = f.extractable_facts[0]?.split(": ")[1] ?? f.entities[0];
	if (!mainVal) return null;
	const key = f.extractable_facts[0]?.split(": ")[0] ?? "";
	const poolMap: Record<string, string[]> = {
		"에디터": [...TECH_TOOLS], "주 언어": [...TECH_TOOLS], "프레임워크": [...TECH_TOOLS],
		"셸": [...SHELLS], "터미널": [...TERMINALS], "패키지 매니저": [...PKG_MGRS],
		"알레르기": [...ALLERGIES], "카드": [...CARDS], "통장": [...BANKS],
		"음악": [...MUSIC_GENRES], "거주지": [...CITIES],
	};
	const pool = poolMap[key] ?? [];
	let newVal = mainVal + "(변경)";
	if (pool.length > 0) {
		const alt = pool.filter((v) => v !== mainVal);
		if (alt.length > 0) newVal = pick(alt as readonly string[]);
	}

	return {
		category: "contradiction_direct", fact_ref: f.id,
		query: `내 ${key} 뭐야?`,
		scoring: { score_3: [newVal], score_2: [], score_1: [mainVal], score_0: [] },
		update: `아 참, ${key} ${newVal}(으)로 바꿨어`,
		verify: `내 ${key} 뭐야?`,
		weight: 2,
	};
}

function genContradictionIndirectQuery(f: V2Fact): V2Query | null {
	const mainVal = f.extractable_facts[0]?.split(": ")[1] ?? f.entities[0];
	if (!mainVal) return null;
	const key = f.extractable_facts[0]?.split(": ")[0] ?? "";
	const poolMap: Record<string, string[]> = {
		"에디터": [...TECH_TOOLS], "주 언어": [...TECH_TOOLS], "프레임워크": [...TECH_TOOLS],
		"셸": [...SHELLS], "터미널": [...TERMINALS], "패키지 매니저": [...PKG_MGRS],
		"알레르기": [...ALLERGIES], "카드": [...CARDS], "통장": [...BANKS],
	};
	const pool = poolMap[key] ?? [];
	let newVal = mainVal;
	if (pool.length > 0) {
		const alt = pool.filter((v) => v !== mainVal);
		if (alt.length > 0) newVal = pick(alt as readonly string[]);
	}

	return {
		category: "contradiction_indirect", fact_ref: f.id,
		query: `${key} 관련해서 요즘 어때?`,
		scoring: { score_3: [newVal], score_2: [mainVal], score_1: [], score_0: [] },
		update: `요즘 ${newVal}에 관심 생겼어. ${mainVal}보다 좋은 것 같아`,
		verify: `${key} 관련해서 요즘 어때?`,
		weight: 2,
	};
}

function genTemporalQuery(f: V2Fact): V2Query | null {
	const mainVal = f.extractable_facts[0]?.split(": ")[1] ?? f.entities[0];
	if (!mainVal) return null;

	if (f.temporal_updates && f.temporal_updates.length > 0) {
		return {
			category: "temporal", fact_ref: f.id,
			query: `원래 ${f.extractable_facts[0]?.split(": ")[0] ?? ""} 뭐였어?`,
			scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
		};
	}

	return {
		category: "temporal", fact_ref: f.id,
		query: getDomainQuestion(f),
		scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
	};
}

function genNoiseQuery(f: V2Fact): V2Query | null {
	const mainVal = f.extractable_facts[0]?.split(": ")[1] ?? f.entities[0];
	if (!mainVal) return null;
	const key = f.extractable_facts[0]?.split(": ")[0] ?? "";

	const noisePrefixes = [
		"아 오늘 진짜 피곤하다. 점심에 뭐 먹지. ",
		"ㅋㅋ 어제 유튜브에서 웃긴 거 봤어. ",
		"응 알겠어. 잠깐만. ",
		"와 대박 이거 진짜 맛있다. ",
		"배고프다. 아 맞다, ",
		"ㅎㅎ 좋다. 아 참, ",
		"어제 친구 만났는데 개웃겨. 아 그리고 ",
		"지금 커피 마시면서 일하는 중인데 아 맞다 ",
		"ㅋㅋ 그건 모르겠고. ",
		"잠깐 전화 왔었어. 아 그리고 ",
	];

	return {
		category: "noise_resilience", fact_ref: f.id,
		query: `내 ${key} 뭐야?`,
		scoring: { score_3: [mainVal], score_2: [], score_1: [], score_0: [] },
		noisy_input: `${pick(noisePrefixes)}아 맞다 ${key} 관련해서 ${mainVal}라고 했었지. 근데 배달 왔다.`,
		weight: 2,
	};
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = rng(0, i);
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const facts = buildFacts();
const queries = buildQueries(facts);

const nlCount = facts.filter((f) => f.fact_type === "natural_language").length;
const idCount = facts.filter((f) => f.fact_type === "unique_id").length;
const distractorTypeCounts: Record<string, number> = {};
for (const f of facts) {
	if (f.distractor) {
		distractorTypeCounts[f.distractor.type] = (distractorTypeCounts[f.distractor.type] ?? 0) + 1;
	}
}

const catCounts: Record<string, number> = {};
for (const q of queries) {
	catCounts[q.category] = (catCounts[q.category] ?? 0) + 1;
}

const factBank = {
	$schema: `Fact Bank v2 — ${facts.length} facts (${nlCount} NL / ${idCount} ID). Peer-reviewed design.`,
	persona_note: "v2 테스트용 가상 인물. 80% 자연어 서술형 / 20% 고유 ID. 모든 정보는 허구.",
	version: 2,
	design_principles: [
		"80% natural language / 20% unique ID",
		"5 distractor types: exact_substitute, partial_match, negative, conditional, hierarchical",
		"0-3 scoring scale",
		"Reasoning questions included",
		"Ecological validity: real memory log distribution",
	],
	total_facts: facts.length,
	natural_language_facts: nlCount,
	unique_id_facts: idCount,
	nl_ratio: `${Math.round((nlCount / facts.length) * 100)}%`,
	distractor_distribution: distractorTypeCounts,
	domains: DOMAINS.length,
	facts,
};

const queryTemplates = {
	$schema: `Query Templates v2 — ${queries.length} queries across ${Object.keys(catCounts).length} categories`,
	version: 2,
	scoring_scale: {
		"0": "환각 — 없는 정보를 지어냄",
		"1": "관련은 하지만 틀림 — 맥락은 맞으나 핵심 정보 오류",
		"2": "핵심 맞으나 세부 오류 — 주요 팩트는 맞지만 부분적 오류",
		"3": "완전 일치 — 모든 핵심 정보가 정확함",
	},
	total_queries: queries.length,
	reasoning_queries: queries.filter((q) => q.is_reasoning).length,
	category_distribution: catCounts,
	scoring: {
		mandatory_pass: ["abstention"],
		grades: {
			A: "core >= 90% + bonus 50%+",
			B: "core >= 75%",
			C: "core >= 60%",
			F: "core < 60% OR abstention ANY fail",
		},
	},
	queries,
};

const factPath = join(__dirname, "fact-bank-v2.json");
const queryPath = join(__dirname, "query-templates-v2.json");

writeFileSync(factPath, JSON.stringify(factBank, null, "\t"));
writeFileSync(queryPath, JSON.stringify(queryTemplates, null, "\t"));

console.log(`Fact Bank v2: ${facts.length} facts (${nlCount} NL / ${idCount} ID, ${Math.round((nlCount / facts.length) * 100)}% NL)`);
console.log(`Query Templates v2: ${queries.length} queries across ${Object.keys(catCounts).length} categories`);
console.log(`Category distribution:`);
for (const [cat, count] of Object.entries(catCounts).sort()) {
	console.log(`  ${cat}: ${count}`);
}
console.log(`Distractor distribution:`);
for (const [type, count] of Object.entries(distractorTypeCounts).sort()) {
	console.log(`  ${type}: ${count}`);
}
console.log(`Reasoning queries: ${queries.filter((q) => q.is_reasoning).length}`);
console.log(`\nWritten: ${factPath}`);
console.log(`Written: ${queryPath}`);
