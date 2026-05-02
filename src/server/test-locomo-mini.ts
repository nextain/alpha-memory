/**
 * Lightweight LoCoMo-style test: ingest a mini conversation, search, verify facts.
 * Compares old behavior (raw episode as fact) vs new (proper LLM extraction).
 */
import { MemorySystem } from "../memory/index.js";
import { LocalAdapter } from "../memory/adapters/local.js";
import { buildLLMFactExtractor } from "../memory/llm-fact-extractor.js";
import { OpenAICompatEmbeddingProvider } from "../memory/embeddings.js";

const API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

const miniConv = [
	{ role: "Caroline", content: "I went to the LGBTQ support group on May 7, 2023. It was really empowering." },
	{ role: "Melanie", content: "That's awesome! I ran a charity race last Saturday." },
	{ role: "Caroline", content: "I've been friends with my current group for about 3 years now." },
	{ role: "Melanie", content: "I started my new job at the bakery on March 15." },
	{ role: "Caroline", content: "My birthday is on June 12, I'll be 25!" },
];

const questions = [
	{ q: "When did Caroline go to the LGBTQ support group?", expected: "May 7, 2023" },
	{ q: "What did Melanie do last Saturday?", expected: "charity race" },
	{ q: "How long has Caroline had her current group of friends?", expected: "3 years" },
	{ q: "When did Melanie start her new job?", expected: "March 15" },
	{ q: "When is Caroline's birthday?", expected: "June 12" },
];

async function run() {
	console.log("=== Mini LoCoMo Test ===\n");

	const embedder = new OpenAICompatEmbeddingProvider(GEMINI_BASE, API_KEY, "gemini-embedding-001", 3072);
	const storePath = `/tmp/locomo-mini-test-${Date.now()}.json`;
	const adapter = new LocalAdapter({ storePath, embeddingProvider: embedder });
	const factExtractor = buildLLMFactExtractor({ apiKey: API_KEY });
	const system = new MemorySystem({ adapter, factExtractor });

	// 1. Ingest
	console.log("Ingesting mini conversation...");
	for (const turn of miniConv) {
		await system.encode(
			{ content: `${turn.role}: ${turn.content}`, role: "user" },
			{ project: "test_user" },
		);
	}
	console.log(`Ingested ${miniConv.length} turns.\n`);

	// 2. Consolidate
	console.log("Consolidating...");
	const cr = await system.consolidateNow(true);
	console.log(`Facts created: ${cr.factsCreated}, updated: ${cr.factsUpdated}\n`);

	// 3. Search & verify
	let correct = 0;
	for (const { q, expected } of questions) {
		const result = await system.recall(q, { project: "test_user", topK: 10 });
		const allContent = [
			...result.facts.map((f) => f.content),
			...result.episodes.map((e) => e.content),
		].join(" ");

		const hit = allContent.toLowerCase().includes(expected.toLowerCase());
		if (hit) correct++;
		console.log(`Q: ${q}`);
		console.log(`  Expected: ${expected}`);
		console.log(`  Facts returned: ${result.facts.length}`);
		console.log(`  Episodes returned: ${result.episodes.length}`);
		if (result.facts.length > 0) {
			console.log(`  Top fact: ${result.facts[0].content.slice(0, 100)}`);
		}
		console.log(`  Hit: ${hit ? "YES" : "NO"}\n`);
	}

	console.log(`\n=== Result: ${correct}/${questions.length} ===`);
}

run().catch(console.error);
