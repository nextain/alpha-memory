async function embedOllama(text: string) {
	try {
		const res = await fetch("http://127.0.0.1:11434/api/embeddings", {
			method: "POST",
			body: JSON.stringify({ model: "mxbai-embed-large", prompt: text }),
		});
		if (!res.ok) throw new Error(`Ollama failed: ${res.status}`);
		const data = (await res.json()) as any;
		return data.embedding;
	} catch (e: any) {
		console.error(`Ollama connection error: ${e.message}`);
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

	console.log("📊 Testing Local High-Performance Embedder (mxbai-embed-large)");
	console.log(
		"Target: Can we consistently stay ABOVE 0.7 similarity for correct pairs?\n",
	);

	for (const { q, f } of testCases) {
		const vecQ = await embedOllama(q);
		const vecF = await embedOllama(f);
		const sim = cosineSimilarity(vecQ, vecF);

		console.log(`Query: "${q}"`);
		console.log(`Fact : "${f}"`);
		console.log(
			`Result: ${sim.toFixed(4)} ${sim >= 0.7 ? "✅ PASS" : "❌ FAIL (Noise risk)"}\n`,
		);
	}
}

runTest().catch(console.error);
