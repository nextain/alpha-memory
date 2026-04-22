import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const N2E: Record<string, string> = {
	"루아": "Lua", "시은": "Sieun", "하진": "Hajin", "유나": "Yuna", "수빈": "Subin",
	"채원": "Chaewon", "도윤": "Doyun", "아린": "Arin", "민서": "Minseo", "지호": "Jiho",
	"태오": "Taeo", "건": "Geon", "이안": "Ian", "준": "Jun", "시우": "Siu",
	"하람": "Haram", "성민": "Sungmin", "정호": "Jungho", "승우": "Seungwoo", "동현": "Donghyun",
	"넥스필드": "Nextfield", "코랄비트": "Coralbeat", "실버라인": "Silverline", "블루문랩스": "Bluemoon Labs",
	"아이언씨드": "Ironseed", "글라이드텍": "Glidetech", "퀀텀리프": "Quantumleap",
	"피넛클라우드": "Peanut Cloud", "스톰베이스": "Stormbase", "조이프레임": "Joyframe",
	"블루문시": "Bluemoon City", "코랄시": "Coral City", "실버타운": "Silvertown",
	"아이언빌": "Ironville", "글라이드시": "Glidesville", "퀀텀시": "Quantum City",
	"피넛타운": "Peanut Town", "스톰시": "Storm City", "조이빌": "Joyville", "에메랄드시": "Emerald City",
	"선로구": "Sunro-gu", "하늘구": "Haneul-gu", "강변구": "Gangbyeon-gu",
	"중앙구": "Jungang-gu", "북구": "Buk-gu", "남구": "Nam-gu", "동구": "Dong-gu",
	"서구": "Seo-gu", "산구": "San-gu", "바다구": "Bada-gu",
	"제톤7": "Zepton7", "글린트": "Glint", "베이퍼": "Vapor", "핀스크립트": "Pinscript",
	"노바코드": "Novacode", "실버쉘": "Silvershell", "퀀텀IDE": "Quantum IDE",
	"이온빌드": "Ionbuild", "플럭스런": "Fluxrun", "크로미온": "Chromion",
	"두리안": "Durian", "망고스틴": "Mangosteen", "용과": "Dragon Fruit", "람부탄": "Rambutan",
	"아사이": "Acai", "구아바": "Guava", "리치": "Lychee", "패션프루트": "Passion Fruit",
	"스타프루트": "Starfruit", "잭프루트": "Jackfruit",
	"콤부차": "Kombucha", "라씨": "Lassi", "아이스티": "Iced Tea", "레모네이드": "Lemonade",
	"스무디": "Smoothie", "프라푸치노": "Frappuccino", "버블티": "Bubble Tea", "에이드": "Ade",
	"미숫가루": "Misutgaru", "단호차": "Danho Tea",
	"키라미": "Kirami", "보드게임": "Board Games", "실내등반": "Indoor Climbing",
	"드론비행": "Drone Flying", "라디오조립": "Radio Assembly", "키캡커스텀": "Keycap Custom",
	"미니어처": "Miniatures", "천문관측": "Astronomy", "실내수목원": "Indoor Botanical Garden",
	"테라리움": "Terrarium",
	"별의 속삭임": "Whisper of Stars", "푸른 미로": "Blue Maze", "시간의 모래": "Sands of Time",
	"세 번째 문": "The Third Door", "유리섬": "Glass Island", "침묵의 방": "Room of Silence",
	"붉은 계단": "Red Stairs", "마지막 선율": "Last Melody", "보이지 않는 강": "Invisible River",
	"기억의 가장자리": "Edge of Memory",
	"틸": "Teal", "코랄핑크": "Coral Pink", "민트그레이": "Mint Gray", "버밀리온": "Vermillion",
	"세피아블루": "Sepia Blue", "라벤더그린": "Lavender Green", "앰버": "Amber", "슬레이트": "Slate",
	"사프론": "Saffron", "티얼": "Teal",
	"블루크릭 센터": "Blue Creek Center", "코랄 플라자": "Coral Plaza",
	"실버홀": "Silver Hall", "아이언 스퀘어": "Iron Square", "글라이드 타워": "Glide Tower",
	"데이터솔루션팀": "Data Solutions", "플랫폼팀": "Platform", "프론티어팀": "Frontier",
	"인프라팀": "Infra", "크로스팀": "Cross",
	"메밀": "Buckwheat", "복숭아": "Peach", "게": "Crab", "우유": "Milk", "땅콩": "Peanut",
	"새우": "Shrimp", "계란": "Egg",
	"글루코핀": "Glucopin", "아지토민": "Azitomin", "멜라토닌-X": "Melatonin-X",
	"비타민D3플러스": "Vitamin D3 Plus", "오메가쉘": "Omegashell",
	"피쉬": "Fish", "바쉬": "Bash", "지쉬": "Zsh",
	"웨젬": "Wezterm", "고스티": "Ghostty", "알라크리티": "Alacritty",
	"카카오뱅크": "Kakao Bank", "토스뱅크": "Toss Bank", "케이뱅크": "K Bank",
	"현대카드": "Hyundai Card", "삼성카드": "Samsung Card", "신한카드": "Shinhan Card",
	"재즈": "Jazz", "인디": "Indie", "클래식": "Classical", "보사노바": "Bossa Nova",
	"월요일": "Monday", "화요일": "Tuesday", "수요일": "Wednesday",
	"목요일": "Thursday", "금요일": "Friday",
	"봄": "Spring", "여름": "Summer", "가을": "Fall", "겨울": "Winter",
	"고양이": "cat", "강아지": "dog", "토끼": "rabbit", "햄스터": "hamster", "앵무새": "parrot",
	"모카": "Mocha", "밤": "Bam", "달이": "Dali", "초코": "Choco", "코코": "Coco",
	"보리": "Bori", "찹쌀": "Chapssal", "감자": "Gamja", "깨": "Kkae", "호두": "Hodu",
	"러닝": "Running", "수영": "Swimming", "등산": "Hiking", "요가": "Yoga",
	"홈트레이닝": "Home Training",
	"사진작가": "Photographer", "바리스타": "Barista", "헬스트레이너": "Health Trainer",
	"도서관 사서": "Librarian", "조향사": "Perfumer",
	"포스트그레스": "Postgres", "몽고디비": "MongoDB", "레디스": "Redis",
	"페도라": "Fedora", "아치": "Arch", "우분투": "Ubuntu",
	"파드만": "Podman", "도커": "Docker",
	"깃헙액션": "GitHub Actions", "씨아이클": "Cicle",
	"지씨피": "GCP", "에이우에스": "AWS", "애저": "Azure",
	"클라우드런": "Cloud Run", "파겟": "Fargate", "엘비": "ALB",
	"피노": "Pino", "윈스턴": "Winston", "번얀": "Bunyan",
	"센트리": "Sentry", "데이터독": "Datadog", "그라파나": "Grafana",
	"터보레포": "Turborepo", "엔엑스": "Nx", "러너": "Lerna",
	"포스트혹": "PostHog", "앰플리튜드": "Amplitude",
	"해시노드": "Hashnode", "벨로그": "Velog", "미디엄": "Medium",
	"슬랙": "Slack", "디스코드": "Discord", "팀즈": "Teams",
	"구글웍스페이스": "Google Workspace", "오피스365": "Office 365",
	"노션": "Notion", "컨플루언스": "Confluence", "리니어": "Linear",
	"소니": "Sony", "캐논": "Canon", "후지필름": "Fujifilm",
	"파스타": "Pasta", "볶음밥": "Fried Rice", "카레": "Curry", "샐러드": "Salad",
	"블루크릭 산맥": "Blue Creek Range", "코랄 봉우리": "Coral Peak", "실버 능선": "Silver Ridge",
	"브로콜리": "Broccoli", "당근": "Carrot", "셀러리": "Celery", "가지": "Eggplant",
	"다이어트": "diet", "자격증": "certification", "어학": "language study", "프로젝트 런칭": "project launch",
	"치과": "dentist", "건강검진": "health checkup", "안과": "ophthalmology",
	"크리스마스": "Christmas", "연말": "year-end", "생일": "birthday",
	"서울": "Seoul", "부산": "Busan", "대전": "Daejeon",
	"한국과학기술원": "KAIST", "서울대학교": "Seoul National University",
	"연세대학교": "Yonsei University", "포항공과대학교": "POSTECH",
	"공군": "Air Force", "육군": "Army", "해군": "Navy",
	"영화": "movies", "산책": "walking", "독서": "reading", "요리": "cooking",
	"네이버 페이": "Naver Pay",
	"뮤지엄": "Musigny", "포맨트": "Formant", "더랩": "The Lab",
	"카페": "cafe", "공원": "park", "도서관": "library", "헬스장": "gym",
	"건강보험만": "health insurance only", "실비만": "actual loss insurance only", "종합": "comprehensive",
	"쓰지 않아": "don't use any", "하나만 써": "use one", "두 개 써": "use two",
};

function translateEntity(s: string): string {
	let r = s;
	const sorted = Object.entries(N2E).sort((a, b) => b[0].length - a[0].length);
	for (const [ko, en] of sorted) {
		r = r.replaceAll(ko, en);
	}
	return r;
}

const STMT_RULES: [RegExp, (m: RegExpMatchArray) => string][] = [
	[/^나는 (.+)야$/, (m) => `I'm ${m[1]}`],
	[/^언니는 (.+)야$/, (m) => `My older sister is ${m[1]}`],
	[/^동생은 (.+)야$/, (m) => `My younger sibling is ${m[1]}`],
	[/^형은 (.+)야$/, (m) => `My older brother is ${m[1]}`],
	[/^누나는 (.+)야$/, (m) => `My older sister is ${m[1]}`],
	[/^(.+) 알레르기 있어$/, (m) => `I'm allergic to ${m[1]}`],
	[/^매일 (.+) (\d+)mg 먹어$/, (m) => `I take ${m[1]} ${m[2]}mg daily`],
	[/^운동은 주 (\d+)회 해$/, (m) => `I exercise ${m[1]} times a week`],
	[/^수면은 (\d+)시간 해$/, (m) => `I sleep ${m[1]} hours`],
	[/^에디터는 (.+) 써$/, (m) => `I use ${m[1]} as my editor`],
	[/^주 언어는 (.+)이야$/, (m) => `My main language is ${m[1]}`],
	[/^프레임워크는 (.+)야$/, (m) => `My framework is ${m[1]}`],
	[/^다크모드 좋아해$/, () => `I like dark mode`],
	[/^탭 인덴트 선호해$/, () => `I prefer tab indentation`],
	[/^셸은 (.+) 써$/, (m) => `I use ${m[1]} shell`],
	[/^터미널은 (.+)이야$/, (m) => `My terminal is ${m[1]}`],
	[/^패키지 매니저는 (.+)야$/, (m) => `My package manager is ${m[1]}`],
	[/^(.+) 버전은 (.+)이야$/, (m) => `${m[1]} version is ${m[2]}`],
	[/^Git은 CLI로 써$/, () => `I use Git from CLI`],
	[/^DB는 (.+) 써$/, (m) => `I use ${m[1]} for DB`],
	[/^OS는 (.+)야$/, (m) => `My OS is ${m[1]}`],
	[/^컨테이너는 (.+) 써$/, (m) => `I use ${m[1]} for containers`],
	[/^CI는 (.+)이야$/, (m) => `My CI is ${m[1]}`],
	[/^클라우드는 (.+) 써$/, (m) => `I use ${m[1]} for cloud`],
	[/^배포는 (.+)로 해$/, (m) => `I deploy with ${m[1]}`],
	[/^로깅은 (.+)이야$/, (m) => `My logger is ${m[1]}`],
	[/^모니터링은 (.+) 써$/, (m) => `I use ${m[1]} for monitoring`],
	[/^모노레포는 (.+)로 관리해$/, (m) => `I manage monorepo with ${m[1]}`],
	[/^코드 커버리지 목표는 (\d+)%야$/, (m) => `My code coverage target is ${m[1]}%`],
	[/^좋아하는 과일은 (.+)야$/, (m) => `My favorite fruit is ${m[1]}`],
	[/^좋아하는 음료는 (.+)야$/, (m) => `My favorite drink is ${m[1]}`],
	[/^좋아하는 색은 (.+)야$/, (m) => `My favorite color is ${m[1]}`],
	[/^가장 좋아하는 영화는 "(.+)"야$/, (m) => `My favorite movie is "${m[1]}"`],
	[/^음악은 (.+) 좋아해$/, (m) => `I like ${m[1]} music`],
	[/^매운 음식 싫어해$/, () => `I dislike spicy food`],
	[/^비 올 때는 집에서 책 읽기 좋아해$/, () => `I like reading at home when it rains`],
	[/^술은 안 마셔$/, () => `I don't drink alcohol`],
	[/^회식은 안 가\. 점심은 가능해$/, () => `I don't go to team dinners. Lunch is fine`],
	[/^아침은 꼭 챙겨 먹어$/, () => `I always eat breakfast`],
	[/^야식은 안 먹어$/, () => `I don't eat late night snacks`],
	[/^좋아하는 계절은 (.+)이야$/, (m) => `My favorite season is ${m[1]}`],
	[/^좋아하는 동물은 (.+)야$/, (m) => `My favorite animal is ${m[1]}`],
	[/^좋아하는 숫자는 (\d+)야$/, (m) => `My favorite number is ${m[1]}`],
	[/^싫어하는 음식은 (.+)야$/, (m) => `I dislike ${m[1]}`],
	[/^방 안에 식물 좋아해$/, () => `I like having plants in my room`],
	[/^좋아하는 책 장르는 (.+)야$/, (m) => `My favorite book genre is ${m[1]}`],
	[/^팟캐스트 좋아해\. 출퇴근길에 들어$/, () => `I like podcasts. I listen on my commute`],
	[/^디지털 미니멀리즘 지향해$/, () => `I aim for digital minimalism`],
	[/^좋아하는 브랜드는 (.+)야$/, (m) => `My favorite brand is ${m[1]}`],
	[/^(.+) (.+)에 살아$/, (m) => `I live in ${m[1]} ${m[2]}`],
	[/^반려동물은 (.+) "(.+)"이야$/, (m) => `My pet is a ${m[1]} named "${m[2]}"`],
	[/^"(.+)"는 (\d+)살이야$/, (m) => `"${m[1]}" is ${m[2]} years old`],
	[/^자전거 타고 출퇴근해$/, () => `I commute by bicycle`],
	[/^집은 (\d+)번길 (\d+) (\d+)호야$/, (m) => `My address is ${m[1]}-gil ${m[2]}, room ${m[3]}`],
	[/^(\d+)년째 여기 살아$/, (m) => `I've lived here for ${m[1]} years`],
	[/^이사하기 전에는 (.+)에 살았어$/, (m) => `Before moving, I lived in ${m[1]}`],
	[/^집 근처에 (.+) 있어$/, (m) => `There's a ${m[1]} near my place`],
	[/^관리비는 (\d+)만원이야$/, (m) => `My maintenance fee is ${m[1]}0,000 won`],
	[/^주차장 있어\. 지하야$/, () => `I have parking. It's underground`],
	[/^이웃이랑은 안 친해$/, () => `I'm not close with my neighbors`],
	[/^방 (\d+)개야$/, (m) => `It has ${m[1]} rooms`],
	[/^오피스텔이야$/, () => `It's a studio apartment`],
	[/^월요일마다 청소해$/, () => `I clean every Monday`],
	[/^빨래는 (.+) 해$/, (m) => `I do laundry ${m[1]}`],
	[/^일찍 자려고 노력해\. (\d+)시 전에는$/, (m) => `I try to sleep early. Before ${m[1]}`],
	[/^새벽에 물 한 잔 마셔$/, () => `I drink a glass of water at dawn`],
	[/^아침에 샤워해$/, () => `I shower in the morning`],
	[/^커피는 집에서 타서 마셔$/, () => `I make coffee at home`],
	[/^배달 음식은 주 (\d+)번 시켜먹어$/, (m) => `I order delivery ${m[1]} times a week`],
	[/^(\d+)년 (\d+)월 (\d+)일에 입사했어$/, (m) => `I started on ${m[1]}-${m[2]}-${m[3]}`],
	[/^매주 (.+)에 팀 미팅 있어$/, (m) => `Team meeting is every ${m[1]}`],
	[/^매월 (\d+)일에 급여 받아$/, (m) => `I get paid on the ${m[1]}th`],
	[/^매년 (.+)에 휴가 가$/, (m) => `I go on vacation every ${m[1]}`],
	[/^매일 (\d+)시에 출근해$/, (m) => `I leave for work at ${m[1]}`],
	[/^매일 (\d+)시에 일어나$/, (m) => `I wake up at ${m[1]}`],
	[/^매일 (\d+)시에 자$/, (m) => `I go to bed at ${m[1]}`],
	[/^주 (\d+)회 운동해$/, (m) => `I exercise ${m[1]} times a week`],
	[/^매월 첫째 주 월요일에 월간 회고해$/, () => `Monthly review on first Monday`],
	[/^분기별로 OKR 체크해$/, () => `I do OKR checks quarterly`],
	[/^작년에 이사했어$/, () => `I moved last year`],
	[/^첫 직장은 (.+)였어$/, (m) => `My first job was at ${m[1]}`],
	[/^(\d+)년 동안 이 회사 다녔어$/, (m) => `I've been at this company for ${m[1]} years`],
	[/^매주 금요일에 코드 리뷰해$/, () => `I do code reviews every Friday`],
	[/^매월 마지막 주에 배포해$/, () => `I deploy in the last week of each month`],
	[/^스프린트는 2주 단위야$/, () => `Sprints are 2 weeks`],
	[/^리포트는 매월 (\d+)일까지 작성해$/, (m) => `Reports are due by the ${m[1]}th`],
	[/^연차는 (\d+)일 남았어$/, (m) => `I have ${m[1]} vacation days left`],
	[/^올해 목표는 (.+)야$/, (m) => `My goal this year is ${m[1]}`],
	[/^다음 달에 (.+) 가기로 했어$/, (m) => `I'm going to ${m[1]} next month`],
	[/^(.+) (.+)에서 일해$/, (m) => `I work at ${m[1]} ${m[2]}`],
	[/^사무실은 (\d+)층이야$/, (m) => `My office is on the ${m[1]}th floor`],
	[/^내선번호는 (\d+)야$/, (m) => `My extension is ${m[1]}`],
	[/^리모트 워크 선호해$/, () => `I prefer remote work`],
	[/^주 (\d+)회 출근해$/, (m) => `I go to the office ${m[1]} times a week`],
	[/^점심은 (.+)에 먹어$/, (m) => `I eat lunch at ${m[1]}`],
	[/^동료들이랑 점심 먹어$/, () => `I eat lunch with colleagues`],
	[/^PR 리뷰어 (\d+)명 필수야$/, (m) => `${m[1]} PR reviewers are required`],
	[/^테스트 커버리지 (\d+)% 유지해$/, (m) => `I maintain ${m[1]}% test coverage`],
	[/^사내 메신저는 (.+)야$/, (m) => `Our messenger is ${m[1]}`],
	[/^이메일은 (.+) 써$/, (m) => `I use ${m[1]} for email`],
	[/^문서화는 (.+)로 해$/, (m) => `I use ${m[1]} for docs`],
	[/^A\/B 테스트는 (.+)로 해$/, (m) => `I use ${m[1]} for A/B testing`],
	[/^기술 블로그는 (.+)에 써$/, (m) => `I write tech blogs on ${m[1]}`],
	[/^팀원 (\d+)명이야$/, (m) => `We have ${m[1]} team members`],
	[/^공동창업자 (.+)야$/, (m) => `My co-founder is ${m[1]}`],
	[/^DAU 목표는 (\d+)명이야$/, (m) => `Our DAU target is ${m[1]}`],
	[/^구독 가격은 (\d+)원이야$/, (m) => `Subscription price is ${m[1]} won`],
	[/^투자 (\d+)억 받았어$/, (m) => `We raised ${m[1]} billion won`],
	[/^팀 회고는 (.+)에 해$/, (m) => `Team retrospective is on ${m[1]}`],
	[/^코골이 있어$/, () => `I snore`],
	[/^체지방률 (\d+)%야$/, (m) => `My body fat is ${m[1]}%`],
	[/^혈압은 정상이야$/, () => `My blood pressure is normal`],
	[/^스트레칭 매일 해$/, () => `I stretch every day`],
	[/^건강검진 매년 받아$/, () => `I get annual health checkups`],
	[/^안경 써\. 도수는 (.+)이야$/, (m) => `I wear glasses. Prescription is ${m[1]}`],
	[/^치과 (\d+)개월마다 가$/, (m) => `I go to the dentist every ${m[1]} months`],
	[/^비타민 (.+) 먹어$/, (m) => `I take vitamin ${m[1]}`],
	[/^물 하루 (\d+)리터 마셔$/, (m) => `I drink ${m[1]} liters of water daily`],
	[/^카페인은 오후 (\d+)시 이후엔 안 마셔$/, (m) => `No caffeine after ${m[1]} PM`],
	[/^명상은 안 해$/, () => `I don't meditate`],
	[/^담배 안 펴$/, () => `I don't smoke`],
	[/^병원등록번호는 (.+)야$/, (m) => `My hospital ID is ${m[1]}`],
	[/^약은 아침에 먹어$/, () => `I take meds in the morning`],
	[/^식사는 규칙적으로 해$/, () => `I eat regularly`],
	[/^운동은 (.+) 위주로 해$/, (m) => `I mainly do ${m[1]}`],
	[/^절친 (.+)는 (.+)야$/, (m) => `My best friend ${m[1]} is a ${m[2]}`],
	[/^(.+)랑 (\d+)년부터 알고 지냈어$/, (m) => `I've known ${m[1]} since ${m[2]}`],
	[/^(.+)랑 같이 (.+) 모임 해$/, (m) => `I do ${m[2]} with ${m[1]}`],
	[/^SNS는 안 해$/, () => `I don't use social media`],
	[/^모임은 (.+)야$/, (m) => `Meetings are ${m[1]}`],
	[/^(.+)는 (.+)에 살아$/, (m) => `${m[1]} lives in ${m[2]}`],
	[/^동네 친구 (.+) 있어$/, (m) => `I have a neighborhood friend ${m[1]}`],
	[/^대학 동기 (.+) 있어$/, (m) => `I have a college classmate ${m[1]}`],
	[/^전화번호는 자주 안 바꿔$/, () => `I don't change my number often`],
	[/^생일 선물은 (.+)줘$/, (m) => `For birthday gifts, I ${m[1]}`],
	[/^친한 친구 (\d+)명 있어$/, (m) => `I have ${m[1]} close friends`],
	[/^인맥 관리는 안 해$/, () => `I don't do networking`],
	[/^모임에서는 잘 안 말해$/, () => `I'm quiet in group settings`],
	[/^(.+) 전화번호 뒷자리 (\d+)야$/, (m) => `${m[1]}'s last 4 digits are ${m[2]}`],
	[/^매년 (.+)에 모여$/, (m) => `We meet every ${m[1]}`],
	[/^단톡방 (\d+)개 있어$/, (m) => `I have ${m[1]} group chats`],
	[/^맛집 (.+)랑 자주 가$/, (m) => `I often go to restaurants with ${m[1]}`],
	[/^여행은 친구들이랑 가$/, () => `I travel with friends`],
	[/^(.+) 생일은 (\d+)월 (\d+)일이야$/, (m) => `${m[1]}'s birthday is ${m[2]}/${m[3]}`],
	[/^멘토 (.+) 있어$/, (m) => `I have a mentor ${m[1]}`],
	[/^월세는 (\d+)원이야$/, (m) => `My rent is ${m[1]} won`],
	[/^적금은 매월 (\d+)원씩 넣어$/, (m) => `I save ${m[1]} won monthly`],
	[/^투자는 안 해$/, () => `I don't invest`],
	[/^카드는 (.+) 써$/, (m) => `I use ${m[1]}`],
	[/^통장은 (.+)야$/, (m) => `My bank is ${m[1]}`],
	[/^계좌 뒷자리 (\d+)야$/, (m) => `My account ends in ${m[1]}`],
	[/^월급은 (\d+)만원이야$/, (m) => `My salary is ${m[1]}0,000 won`],
	[/^식비는 월 (\d+)만원이야$/, (m) => `Food budget is ${m[1]}0,000 won/month`],
	[/^교통비는 (\d+)만원이야$/, (m) => `Transport is ${m[1]}0,000 won`],
	[/^구독 서비스 (\d+)개 써$/, (m) => `I use ${m[1]} subscription services`],
	[/^네이버 페이 자주 써$/, () => `I use Naver Pay often`],
	[/^현금은 잘 안 써$/, () => `I rarely use cash`],
	[/^가계부 써$/, () => `I keep a budget`],
	[/^비상금 (\d+)만원 있어$/, (m) => `I have ${m[1]}0,000 won emergency fund`],
	[/^대출은 없어$/, () => `I don't have loans`],
	[/^보험은 (.+)이야$/, (m) => `My insurance is ${m[1]}`],
	[/^저축률은 (\d+)%야$/, (m) => `My savings rate is ${m[1]}%`],
	[/^프리미엄 서비스는 (.+)$/, (m) => `For premium services, I ${m[1]}`],
	[/^경조사비는 연 (\d+)만원 정도 써$/, (m) => `I spend about ${m[1]}0,000 won/year on ceremonial occasions`],
	[/^부수입은 없어$/, () => `I have no side income`],
	[/^취미는 (.+)야$/, (m) => `My hobby is ${m[1]}`],
	[/^(.+)에서 취미 활동해$/, (m) => `I do my hobby at ${m[1]}`],
	[/^보드게임 랭킹 (.+)위야$/, (m) => `My board game ranking is ${m[1]}th`],
	[/^주말엔 보통 (.+) 해$/, (m) => `On weekends I usually ${m[1]}`],
	[/^사진 찍는 것도 좋아해$/, () => `I also like photography`],
	[/^카메라는 (.+) (.+)야$/, (m) => `My camera is ${m[1]} ${m[2]}`],
	[/^렌즈는 (.+)야$/, (m) => `My lens is ${m[1]}`],
	[/^독서는 (.+) 좋아해$/, (m) => `I like reading ${m[1]}`],
	[/^한 달에 책 (\d+)권 읽어$/, (m) => `I read ${m[1]} books a month`],
	[/^게임은 안 해$/, () => `I don't play games`],
	[/^요리 취미야$/, () => `Cooking is my hobby`],
	[/^잘하는 요리는 (.+)야$/, (m) => `I'm good at making ${m[1]}`],
	[/^드론 날려$/, () => `I fly drones`],
	[/^천문관측 좋아해$/, () => `I like astronomy`],
	[/^망원경은 (.+) (\d+)mm야$/, (m) => `My telescope is ${m[1]} ${m[2]}mm`],
	[/^등산도 가끔 가$/, () => `I sometimes go hiking`],
	[/^최근 등반한 건 (.+)야$/, (m) => `Last climbed ${m[1]}`],
	[/^실내등반 (.+) 레벨이야$/, (m) => `My indoor climbing level is ${m[1]}`],
	[/^테라리움 만들어$/, () => `I make terrariums`],
	[/^혈액형은 (.+)이야$/, (m) => `My blood type is ${m[1]}`],
	[/^MBTI는 (.+)야$/, (m) => `My MBTI is ${m[1]}`],
	[/^생일은 (\d+)월 (\d+)일이야$/, (m) => `My birthday is ${m[1]}/${m[2]}`],
	[/^사번은 (.+)야$/, (m) => `My employee code is ${m[1]}`],
	[/^전화번호는 (.+)야$/, (m) => `My phone number is ${m[1]}`],
	[/^고향은 (.+)야$/, (m) => `My hometown is ${m[1]}`],
	[/^나는 아침형 인간이야\. 보통 새벽 (\d+)시에 일어나$/, (m) => `I'm a morning person. I usually wake up at ${m[1]} AM`],
	[/^차는 안 마셔\. 커피만 마셔$/, () => `I don't drink tea. Only coffee`],
	[/^운전면허는 있지만 차는 안 가지고 다녀$/, () => `I have a license but don't own a car`],
	[/^영어 이름은 (.+)야$/, (m) => `My English name is ${m[1]}`],
	[/^군대는 (.+) 나왔어$/, (m) => `I served in the ${m[1]}`],
	[/^대학은 (.+) 나왔어$/, (m) => `I graduated from ${m[1]}`],
	[/^키는 (\d+)cm야$/, (m) => `My height is ${m[1]}cm`],
	[/^신발 사이즈는 (\d+)mm야$/, (m) => `My shoe size is ${m[1]}mm`],
	[/^시력은 (.+)이야$/, (m) => `My vision is ${m[1]}`],
	[/^왼손잡이야$/, () => `I'm left-handed`],
	[/^문신 있어\. 왼쪽 팔에 작은 거 하나$/, () => `I have a tattoo. A small one on my left arm`],
	[/^(.+) 관련해서 요즘 어때\?$/, (m) => `How's your ${m[1]} lately?`],
	[/^(.+) 먹어도 돼\?$/, (m) => `Can I eat ${m[1]}?`],
	[/^(.+)관련해서 나한테 뭐라고 했었지\?$/, (m) => `What did you say about ${m[1]}?`],
	[/^(.+)관련해서 나한테 뭐라고 했었지\? (.+)$/, (m) => `What did you say about ${m[1]}? ${m[2]}`],
	[/^(.+) 관련해서 나한테 뭐라고 했었지\?$/, (m) => `What did you say about ${m[1]}?`],
	[/^이거 어떻게 해\? (.+) 관련으로$/, (m) => `How do I handle this? About ${m[1]}`],
];

function translateStatement(s: string): string {
	let te = translateEntity(s);
	if (te !== s) {
		for (const [re, fn] of STMT_RULES) {
			const m = te.match(re);
			if (m) return fn(m);
		}
	}
	return te;
}

const EXTRACTABLE_MAP: Record<string, string> = {
	"이름": "name", "언니": "older sister", "동생": "younger sibling", "형": "older brother", "누나": "older sister",
	"혈액형": "blood type", "MBTI": "MBTI", "생일": "birthday", "사번": "employee code",
	"전화번호": "phone", "고향": "hometown", "기상": "wake up", "유형": "type",
	"차": "tea", "커피": "coffee", "운전면허": "driver's license", "자차": "own car",
	"문신": "tattoo", "손": "hand", "에디터": "editor", "주 언어": "main language",
	"프레임워크": "framework", "테마": "theme", "인덴트": "indent", "셸": "shell",
	"터미널": "terminal", "패키지 매니저": "package manager", "에디터 버전": "editor version",
	"Git": "Git", "거주지": "residence", "반려동물": "pet", "반려동물 나이": "pet age",
	"출퇴근": "commute", "거주기간": "residence duration", "주차장": "parking",
	"이웃 관계": "neighbors", "주거형태": "housing", "청소": "cleaning",
	"샤워": "shower", "입사일": "start date", "팀 미팅": "team meeting", "급여일": "payday",
	"월간 회고": "monthly review", "OKR 체크": "OKR check", "이사": "moved",
	"층": "floor", "내선번호": "extension", "선호": "preference", "회사": "company",
	"부서": "department", "알레르기": "allergy", "약": "medication", "코골이": "snoring",
	"혈압": "blood pressure", "스트레칭": "stretching", "건강검진": "health checkup",
	"약 복용": "medication time", "좋아하는 과일": "favorite fruit", "좋아하는 음료": "favorite drink",
	"좋아하는 색": "favorite color", "좋아하는 영화": "favorite movie", "좋아하는 음악": "favorite music",
	"매운맛": "spicy", "술": "alcohol", "야식": "late night snack",
	"회식(저녁)": "team dinner", "점심": "lunch", "아침": "breakfast",
	"절친": "best friend", "직업": "job", "알게 된 해": "known since",
	"SNS": "SNS", "전화번호": "phone", "인맥 관리": "networking", "모임": "meetings",
	"월세": "rent", "적금": "savings", "투자": "investment", "현금": "cash",
	"가계부": "budget", "대출": "loan", "부수입": "side income",
	"취미": "hobby", "장소": "venue", "랭킹": "ranking", "오피스텔": "housing",
	"매운 음식 선호도": "spicy preference", "음주 여부": "drinking", "야식 여부": "late night snacking",
	"흡연": "smoking", "명상": "meditation", "게임": "games",
	"언니 커피": "sister's coffee", "언니 커피 취향": "sister's coffee taste",
	"면허와 차 소유": "license and car ownership", "카페인 섭취 제한": "caffeine limit",
	"회식 참석": "dinner attendance", "모임 성향": "group personality",
	"이웃 관계": "neighbor relations", "현금 사용": "cash usage",
	"언니 이름": "sister's name", "이사 시기": "move timing",
	"거주기간": "residence duration", "SNS 사용": "SNS usage",
	"언니 커피": "sister coffee",
	"대출 여부": "loan status",
	"저녁": "dinner", "가능": "available",
	"안 마심": "doesn't drink", "마심": "drinks", "안 함": "doesn't", "있음": "yes", "없음": "none",
	"안 먹음": "doesn't eat", "안 씀": "doesn't use", "씀": "keeps",
	"안 가": "doesn't go", "싫어함": "dislikes", "좋아해": "likes",
	"안 친함": "not close", "매일": "daily", "매년": "yearly",
	"분기별": "quarterly", "리모트": "remote", "안 타": "doesn't ride",
	"공군 나왔어": "Air Force", "육군 나왔어": "Army", "해군 나왔어": "Navy",
	"아침": "morning", "아침형": "morning type",
	"매주 월요일": "every Monday", "첫째 주 월요일": "first Monday",
	"안 돼": "can't", "알레르기": "allergy", "안": "not",
};

function translateExtractable(e: string): string {
	const parts = e.split(": ");
	if (parts.length === 2) {
		const key = translateEntity(parts[0]);
		let val = parts[1];
		for (const [ko, en] of Object.entries(EXTRACTABLE_MAP).sort((a, b) => b[0].length - a[0].length)) {
			val = val.replaceAll(ko, en);
		}
		val = translateEntity(val);
		return `${key}: ${val}`;
	}
	return translateEntity(e);
}

const QUERY_MAP: [RegExp, (m: RegExpMatchArray) => string][] = [
	[/^내 이름이 뭐야\?$/, () => "What's my name?"],
	[/^나 누구야\?$/, () => "Who am I?"],
	[/^나에 대해 뭐 알아\?$/, () => "What do you know about me?"],
	[/^내 개발 환경 알려줘$/, () => "Tell me about my dev setup"],
	[/^내 기술 스택 뭐야\?$/, () => "What's my tech stack?"],
	[/^에디터 뭐 써\?$/, () => "What editor do I use?"],
	[/^내 취향 알려줘$/, () => "Tell me my preferences"],
	[/^좋아하는 거 뭐야\?$/, () => "What do I like?"],
	[/^싫어하는 거 있어\?$/, () => "Anything I dislike?"],
	[/^나 어디 살아\?$/, () => "Where do I live?"],
	[/^반려동물 있어\?$/, () => "Do I have pets?"],
	[/^일정 알려줘$/, () => "Tell me my schedule"],
	[/^언제 입사했어\?$/, () => "When did I start working?"],
	[/^미팅 언제야\?$/, () => "When's the meeting?"],
	[/^어디서 일해\?$/, () => "Where do I work?"],
	[/^회사 어때\?$/, () => "How's the company?"],
	[/^업무 스타일이 어때\?$/, () => "What's my work style?"],
	[/^건강 상태 어때\?$/, () => "How's my health?"],
	[/^알레르기 있어\?$/, () => "Any allergies?"],
	[/^운동 해\?$/, () => "Do I exercise?"],
	[/^친한 친구 누구야\?$/, () => "Who's my close friend?"],
	[/^친구들 알려줘$/, () => "Tell me about my friends"],
	[/^모임 해\?$/, () => "Do I do group activities?"],
	[/^재정 상태 어때\?$/, () => "How are my finances?"],
	[/^월세 얼마야\?$/, () => "How much is my rent?"],
	[/^투자 해\?$/, () => "Do I invest?"],
	[/^취미 뭐야\?$/, () => "What's my hobby?"],
	[/^주말에 뭐 해\?$/, () => "What do I do on weekends?"],
	[/^관심사 알려줘$/, () => "Tell me my interests"],
	[/^내 (.+) 뭐야\?$/, (m) => `What's my ${translateEntity(m[1])}?`],
	[/^나한테 "(.+)" 관련해서 기억나는 거 있어\?$/, (m) => `Do you remember anything about my ${translateEntity(m[1])}?`],
	[/^(.+) 관련해서 나한테 뭐라고 했었지\?$/, (m) => `What did you tell me about ${translateEntity(m[1])}?`],
	[/^(.+)관련해서 나한테 뭐라고 했었지\?$/, (m) => `What did you tell me about ${translateEntity(m[1])}?`],
	[/^(.+)관련해서 나한테 뭐라고 했었지\? (.+)$/, (m) => `What did you tell me about ${translateEntity(m[1])}? ${translateEntity(m[2])}`],
	[/^이거 어떻게 해\? (.+) 관련으로$/, (m) => `How do I handle this? About ${translateEntity(m[1])}`],
	[/^(.+) 어때\?$/, (m) => `How's my ${translateEntity(m[1])}?`],
	[/^(.+) 먹어도 돼\?$/, (m) => `Can I eat ${translateEntity(m[1])}?`],
	[/^원래 (.+) 뭐였어\?$/, (m) => `What was my ${translateEntity(m[1])} originally?`],
	[/^(.+) 관련해서 요즘 어때\?$/, (m) => `How's my ${translateEntity(m[1])} lately?`],
	[/^우리 회사 소개서 초안 써줘$/, () => "Write a company intro draft for us"],
	[/^내 소개 한 줄로 써줘$/, () => "Introduce me in one line"],
	[/^내 건강 관리 루틴 정리해줘$/, () => "Summarize my health routine"],
	[/^내 인간관계 요약해줘$/, () => "Summarize my relationships"],
	[/^내 재정 요약해줘$/, () => "Summarize my finances"],
	[/^내 취미 소개 글 써줘$/, () => "Write about my hobbies"],
	[/^우리 기술 스택 정리해줘$/, () => "Organize our tech stack"],
	[/^내 취향 프로필 만들어줘$/, () => "Make my preference profile"],
	[/^내 일정 정리해줘$/, () => "Organize my schedule"],
	[/^내 (.+) 정보 알려줘$/, (m) => `Tell me about my ${translateEntity(m[1])}`],
	[/^내 (.+) 알려줘$/, (m) => `Tell me my ${translateEntity(m[1])}`],
	[/^내 (.+) 요약해줘$/, (m) => `Summarize my ${translateEntity(m[1])}`],
	[/^에디터 설정 좀 도와줘$/, () => "Help me with editor settings"],
	[/^이 코드 리팩토링 해줘$/, () => "Help me refactor this code"],
	[/^새 프로젝트 세팅해줘$/, () => "Set up a new project for me"],
	[/^코드 포맷팅 맞춰줘$/, () => "Fix my code formatting"],
	[/^테마 설정해줘$/, () => "Set up my theme"],
];

function translateQuery(q: string): string {
	for (const [re, fn] of QUERY_MAP) {
		const m = q.match(re);
		if (m) return fn(m);
	}
	return translateEntity(q);
}

const SCORE_KW: Record<string, string[]> = {
	"모르": ["don't know", "not sure", "don't recall"],
	"없": ["don't have", "no", "not"],
	"기억에": ["memory", "recall", "remember"],
	"안 돼": ["can't", "no", "shouldn't"],
	"안되": ["can't", "no"],
	"안": ["don't", "not", "no"],
	"돼": ["can", "okay", "fine"],
	"괜찮": ["okay", "fine", "alright"],
};

function translateScoringKeywords(keywords: string[]): string[] {
	const result: string[] = [];
	for (const kw of keywords) {
		let translated = false;
		for (const [ko, ens] of Object.entries(SCORE_KW)) {
			if (kw === ko) { result.push(...ens); translated = true; break; }
			if (kw.includes(ko)) { result.push(kw.replaceAll(ko, ens[0])); translated = true; break; }
		}
		if (!translated) {
			const t = translateEntity(kw);
			result.push(t);
		}
	}
	return [...new Set(result)];
}

function translateFactBank(ko: any): any {
	const en = { ...ko };
	en.persona_note = "v2 test persona (fictional). 80% natural language / 20% unique ID. All info is fictional.";
	en.facts = ko.facts.map((f: any) => {
		const ef: any = { ...f };
		ef.statement = translateStatement(f.statement);
		ef.entities = f.entities.map((e: string) => translateEntity(e));
		ef.extractable_facts = f.extractable_facts.map((e: string) => translateExtractable(e));
		if (f.distractor) {
			ef.distractor = {
				...f.distractor,
				statement: translateStatement(f.distractor.statement),
				shared_concept: translateEntity(f.distractor.shared_concept),
			};
		}
		if (f.temporal_updates) {
			ef.temporal_updates = f.temporal_updates.map((u: any) => ({
				...u,
				statement: translateStatement(u.statement),
				replaces_extractable: translateExtractable(u.replaces_extractable),
			}));
		}
		return ef;
	});
	return en;
}

function translateQueries(ko: any): any {
	const en: any = { ...ko };
	en.queries = ko.queries.map((q: any) => {
		const eq: any = { ...q };
		eq.query = translateQuery(q.query);

		if (q.scoring) {
			eq.scoring = {
				score_3: translateScoringKeywords(q.scoring.score_3 || []),
				score_2: translateScoringKeywords(q.scoring.score_2 || []),
				score_1: translateScoringKeywords(q.scoring.score_1 || []),
				score_0: translateScoringKeywords(q.scoring.score_0 || []),
			};
		}

		if (q.setup) eq.setup = translateEntity(q.setup);
		if (q.update) eq.update = translateStatement(q.update);
		if (q.verify) eq.verify = translateQuery(q.verify);
		if (q.noisy_input) eq.noisy_input = translateEntity(q.noisy_input);
		if (q.expected_pattern) eq.expected_pattern = translateEntity(q.expected_pattern);
		if (q.hallucination_keywords) eq.hallucination_keywords = q.hallucination_keywords.map((k: string) => translateEntity(k));
		if (q.distractor_note) eq.distractor_note = translateEntity(q.distractor_note);
		if (q.expected_not_contains) eq.expected_not_contains = q.expected_not_contains.map((k: string) => translateEntity(k));
		if (q.expected_any) eq.expected_any = q.expected_any.map((k: string) => translateEntity(k));
		if (q.context) eq.context = translateEntity(q.context);
		if (q.reasoning_note) eq.reasoning_note = translateEntity(q.reasoning_note);

		return eq;
	});
	return en;
}

const koFacts = JSON.parse(readFileSync(join(__dirname, "fact-bank-v2.json"), "utf-8"));
const koQueries = JSON.parse(readFileSync(join(__dirname, "query-templates-v2.json"), "utf-8"));

const enFacts = translateFactBank(koFacts);
const enQueries = translateQueries(koQueries);

writeFileSync(join(__dirname, "fact-bank-v2.en.json"), JSON.stringify(enFacts, null, "\t"));
writeFileSync(join(__dirname, "query-templates-v2.en.json"), JSON.stringify(enQueries, null, "\t"));

console.log(`EN Fact Bank: ${enFacts.facts.length} facts written`);
console.log(`EN Queries: ${enQueries.queries.length} queries written`);

let untranslated = 0;
for (const f of enFacts.facts) {
	if (/[가-힣]/.test(f.statement)) {
		untranslated++;
		console.log(`  UNTRANSLATED: ${f.id} "${f.statement}"`);
	}
}
for (const q of enQueries.queries) {
	if (/[가-힣]/.test(q.query) && q.category !== "abstention" && q.category !== "irrelevant_isolation") {
		untranslated++;
		console.log(`  UNTRANSLATED Q: ${q.category} "${q.query}"`);
	}
}
console.log(`Untranslated items: ${untranslated}`);
