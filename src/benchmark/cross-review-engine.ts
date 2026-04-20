import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Advanced Adversarial Cross-Review Engine v3.0
 * Optimized for Planning Phase Audits.
 */

interface ReviewConfig {
	gemini: string;
	codex: string;
	glm: string;
	claude: string;
	phase: "plan" | "dev";
}

function loadEnv() {
	const envPath = "/var/home/luke/dev/my-envs/naia.nextain.io.env";
	if (!existsSync(envPath)) return {};
	const content = readFileSync(envPath, "utf-8");
	const env: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const [key, value] = line.split("=");
		if (key && value) env[key.trim()] = value.trim().replace(/"/g, "");
	}
	return env;
}

async function callModel(model: string, prompt: string, env: any) {
	const gwUrl =
		"https://any-llm-gateway-70423245233.asia-northeast3.run.app/v1/chat/completions";

	// Stabilized model mapping for audit
	let targetModel = model;
	if (model === "gpt-5.4") targetModel = "openai:gpt-4o"; // Fallback to 4o if 5.4 profile is missing
	if (model === "gemini-3.1-pro") targetModel = "vertexai:gemini-1.5-pro"; // Reliable Pro model
	if (model === "glm-5.1") targetModel = "glm-4"; // Reliable GLM upper tier
	if (model === "opus") targetModel = "anthropic:claude-3-5-sonnet"; // Best for logic synthesis

	try {
		const res = await fetch(gwUrl, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.GLM_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: targetModel,
				messages: [{ role: "user", content: prompt }],
				max_tokens: 2000,
			}),
		});

		const data = (await res.json()) as any;
		if (data.error) return `Error from ${targetModel}: ${data.error.message}`;
		return data.choices?.[0]?.message?.content ?? "Review failed.";
	} catch (e: any) {
		return `Error calling ${model}: ${e.message}`;
	}
}

async function runReview(
	targetDesc: string,
	logicSnippet: string,
	config: ReviewConfig,
) {
	const env = loadEnv();
	console.log(`🔑 Audit Mode: ${config.phase.toUpperCase()}`);
	console.log(
		`🤖 Squad: Gemini(${config.gemini}), Codex(${config.codex}), GLM(${config.glm})`,
	);

	const adversarialPrompt = `You are an ELITE adversarial AI auditor.
Audit Target: ${targetDesc}
Logic:
${logicSnippet}

TASK: 
1. Prove OVERFITTING: Why will this fail on data NOT in the benchmark?
2. Logical Flaws: Attack the weights and thresholds.
3. Blind Spots: Find one scenario where this logic breaks the user experience.
Be brutal. High accuracy is a lie until proven otherwise.`;

	// Run reviews in parallel
	const [revGemini, revCodex, revGLM] = await Promise.all([
		callModel(config.gemini, adversarialPrompt, env),
		callModel(config.codex, adversarialPrompt, env),
		callModel(config.glm, adversarialPrompt, env),
	]);

	const synthesisPrompt = `You are the Chief Auditor (Opus). 
Synthesize these three brutal critiques into a final verdict.
Gemini says: ${revGemini}
Codex says: ${revCodex}
GLM says: ${revGLM}

VERDICT: Reliable progress or Overfitted hack?
REQUIRED FIXES: List the top 3 changes needed to ensure robustness.`;

	console.log("⚖️ Chief Auditor (Opus) is synthesizing...");
	const finalVerdict = await callModel(config.claude, synthesisPrompt, env);

	const reportDir = "/var/home/luke/dev/alpha-memory/reports/cross-reviews";
	if (!existsSync(reportDir)) mkdirSync(reportDir, { recursive: true });
	const reportPath = join(reportDir, `audit-${config.phase}-${Date.now()}.md`);

	const fullReport = `# 🛡️ Adversarial Audit Report (${config.phase.toUpperCase()})
**Date**: ${new Date().toLocaleString()}
**Squad**: ${config.gemini}, ${config.codex}, ${config.glm} | Synthesis: ${config.claude}

## ⚖️ Final Verdict
${finalVerdict}

---
## 🔍 Adversarial Findings
### Gemini
${revGemini}
### Codex
${revCodex}
### GLM
${revGLM}
`;
	writeFileSync(reportPath, fullReport);
	console.log(`\n✅ Audit Complete! Report saved: ${reportPath}`);
	return fullReport;
}

// CLI Integration
const args = process.argv.slice(2);
const phase = (process.env.REVIEW_PHASE as any) || "plan";

const config: ReviewConfig = {
	gemini: process.env.REVIEW_GEMINI || "gemini-3.1-pro",
	codex: process.env.REVIEW_CODEX || "gpt-5.4",
	glm: process.env.REVIEW_GLM || "glm-5.1",
	claude: process.env.REVIEW_CLAUDE || "opus",
	phase: phase,
};

// If in dev phase, use lighter models
if (phase === "dev") {
	config.gemini = "vertexai:gemini-2.5-flash-lite";
	config.codex = "openai:gpt-4o-mini";
	config.glm = "glm-4-air";
}

const target = args[0] || "Naia Local Memory Logic";
const snippet = args[1] || "SIMILARITY_THRESHOLD=0.7, Hybrid(0.6/0.3/0.1)";

runReview(target, snippet, config).catch(console.error);
