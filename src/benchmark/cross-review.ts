import { readFileSync } from "node:fs";

async function callLLM(model: string, prompt: string) {
	const gwUrl =
		process.env.GATEWAY_URL ||
		"https://any-llm-gateway-70423245233.asia-northeast3.run.app";
	const gwKey = process.env.GATEWAY_MASTER_KEY;

	const res = await fetch(`${gwUrl}/v1/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${gwKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model,
			messages: [{ role: "user", content: prompt }],
			max_tokens: 2000,
		}),
	});
	const data = (await res.json()) as any;
	return data.choices?.[0]?.message?.content ?? "";
}

async function main() {
	const target = `
### Target Logic 1: Hybrid Search & Threshold (LocalAdapter.ts)
const SIMILARITY_THRESHOLD = 0.7;
// Vector (0.6) + Keyword/Entity (0.4)
const hybridScore = (vectorScore * 0.6) + (kScore * 0.3) + (entityBonus * 0.1);
let isRelevant = vectorScore >= SIMILARITY_THRESHOLD;
if (!isRelevant && kScore > 0.8) isRelevant = true; // Exception for strong keyword hits

### Target Logic 2: Strict Abstention Prompt (run-comparison.ts)
## CRITICAL RULES
1. If you cannot find the specific fact requested in the provided memories, you MUST reply ONLY with: "기억에 없습니다" (Korean) or "I don't have that in my memory" (English).
2. NEVER guess, assume, or use your general knowledge.
3. If memories are provided but none of them directly answer the question, follow Rule #1.
`;

	console.log("🚀 Starting Cross-Review...");

	const prompt = `You are an adversarial AI expert. Critique the Naia Local memory system's 83% accuracy jump. 
Is this logic robust or just overfitting to the benchmark dataset?
Challenge the Hybrid Search weights (0.6/0.3/0.1) and the SIMILARITY_THRESHOLD=0.7.
Logic: ${target}`;

	console.log("\n[1/3] Calling GLM-4...");
	const revGLM = await callLLM("glm-4", prompt);
	console.log("GLM-4 Review Captured.");

	console.log("\n[2/3] Calling Gemini 2.5 Flash...");
	const revGemini = await callLLM("vertexai:gemini-2.5-flash-lite", prompt);
	console.log("Gemini Review Captured.");

	console.log("\n[3/3] Final Synthesis by Claude 3.5 Sonnet...");
	const finalPrompt = `Analyze these two adversarial reviews of the Naia Local memory logic.
Provide a final verdict on whether the 83% jump is reliable or a result of overfitting.
Highlight the most critical logic flaws found.

Review A (GLM-4): ${revGLM}
Review B (Gemini): ${revGemini}
Original Logic: ${target}`;

	const finalVerdict = await callLLM(
		"anthropic:claude-3-5-sonnet",
		finalPrompt,
	);

	console.log("\n" + "=".repeat(50));
	console.log("FINAL CROSS-REVIEW VERDICT");
	console.log("=".repeat(50));
	console.log(finalVerdict);
}

main().catch(console.error);
