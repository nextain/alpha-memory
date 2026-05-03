async function embedVllm(text: string) {
	try {
		const base = process.env.VLLM_EMBED_BASE ?? "http://localhost:8001";
		const res = await fetch(`${base}/v1/embeddings`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "Qwen/Qwen3-Embedding-0.6B",
				input: [text],
			}),
		});
		if (!res.ok) throw new Error(`vLLM failed: ${res.status}`);
		const data = (await res.json()) as any;
		return data.data[0].embedding;
	} catch (e: any) {
		console.error(`vLLM connection error: ${e.message}`);
		return null;
	}
}

function cosineSimilarity(a: number[], b: number[]) {
	if (!a || !b) return 0;
	let dot = 0,
		normA = 0,
		normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function runTest() {
	const testCases = [
		{
			q: "내 이름이 뭐야?",
			f: "나는 김하늘이야. 스타트업 대표고 풀스택 개발자야",
		},
		{
			q: "나 뭐하는 사람이야?",
			f: "나는 김하늘이야. 스타트업 대표고 풀스택 개발자야",
		},
		{ q: "내 에디터 뭐야?", f: "에디터는 Neovim 쓰고 있어" },
		{ q: "어디 살아?", f: "성수동에 살아" },
		{
			q: "동생 이름이 뭐야?",
			f: "동생 이름은 김바다야. 디자이너로 일하고 있어",
		},
	];

	console.log("📊 Testing Local High-Performance Embedder (qwen3-embedding via vLLM)");
	console.log(
		"Target: Can we consistently stay ABOVE 0.7 similarity for correct pairs?\n",
	);

	for (const { q, f } of testCases) {
		const vecQ = await embedVllm(q);
		const vecF = await embedVllm(f);
		const sim = cosineSimilarity(vecQ, vecF);

		console.log(`Query: "${q}"`);
		console.log(`Fact : "${f}"`);
		console.log(
			`Result: ${sim.toFixed(4)} ${sim >= 0.7 ? "✅ PASS" : "❌ FAIL (Noise risk)"}\n`,
		);
	}
}

runTest().catch(console.error);
