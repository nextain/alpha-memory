import { OpenAICompatEmbeddingProvider } from "../memory/embeddings.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";
const apiKey = process.env.GEMINI_API_KEY || "";

console.log("Testing raw fetch first...");
const url = GEMINI_BASE + "v1/embeddings";
console.log("URL:", url);
const rawRes = await fetch(url, {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bearer ${apiKey}`,
	},
	body: JSON.stringify({ model: "gemini-embedding-001", input: ["test"] }),
});
console.log("Raw status:", rawRes.status, rawRes.statusText);
if (!rawRes.ok) {
	const errText = await rawRes.text();
	console.log("Error body:", errText.slice(0, 500));
} else {
	const data = await rawRes.json();
	console.log("Raw dims:", data.data[0].embedding.length);
}

console.log("\nTesting via OpenAICompatEmbeddingProvider...");
const e = new OpenAICompatEmbeddingProvider(GEMINI_BASE, apiKey, "gemini-embedding-001", 3072);

const testUrl = `${(e as any).baseUrl}/v1/embeddings`;
console.log("Provider URL:", testUrl);

try {
	const v = await e.embed("test embedding hello world");
	console.log("SUCCESS dims:", v.length, "first3:", v.slice(0, 3));
} catch (err: any) {
	console.error("ERROR:", err.message?.slice(0, 500));
}
