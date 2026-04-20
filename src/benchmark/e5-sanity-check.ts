import { OfflineEmbeddingProvider } from "../memory/embeddings.js";

async function runSanityCheck() {
	console.log("🚀 Starting E5 Offline Sanity Check...");
	const p = new OfflineEmbeddingProvider("multilingual-e5-large");

	const s1 = "나는 김하늘이다";
	const s2 = "커피를 좋아한다";
	const s3 = "나는 김하늘이다"; // Same as s1

	console.log("   - Embedding sentences...");
	const v1 = await p.embed(s1);
	const v2 = await p.embed(s2);
	const v3 = await p.embed(s3);

	const cosine = (a: number[], b: number[]) => {
		let dot = 0,
			nA = 0,
			nB = 0;
		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
			nA += a[i] * a[i];
			nB += b[i] * b[i];
		}
		return dot / (Math.sqrt(nA) * Math.sqrt(nB));
	};

	console.log("\nResults:");
	console.log(
		`1. Different: "${s1}" vs "${s2}" => Sim: ${cosine(v1, v2).toFixed(4)}`,
	);
	console.log(
		`2. Same:      "${s1}" vs "${s3}" => Sim: ${cosine(v1, v3).toFixed(4)}`,
	);

	if (cosine(v1, v2) > 0.99) {
		console.error(
			"\n❌ ERROR: Embedding Collapse detected! Different sentences have identical vectors.",
		);
	} else if (cosine(v1, v3) < 0.99) {
		console.error(
			"\n❌ ERROR: Non-deterministic embeddings! Same sentences have different vectors.",
		);
	} else {
		console.log("\n✅ PASS: Embeddings are distinct and deterministic.");
	}
}

runSanityCheck().catch(console.error);
