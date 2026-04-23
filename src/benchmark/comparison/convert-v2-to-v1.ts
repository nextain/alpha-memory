export function convertV2ToV1(v2: any): any {
	const capabilities: Record<string, any> = {};
	for (const q of v2.queries) {
		const cat = q.category;
		if (!capabilities[cat]) {
			capabilities[cat] = {
				description: cat,
				weight:
					q.weight ??
					(cat === "semantic_search" || cat === "multi_fact_synthesis"
						? 2
						: 1),
				queries: [],
			};
		}
		const entry: Record<string, any> = { query: q.query };

		if (Array.isArray(q.fact_ref)) {
			entry.facts = q.fact_ref;
			if (q.expected_any) entry.expected_any = q.expected_any;
			if (q.min_expected) entry.min_expected = q.min_expected;
		} else if (q.fact_ref && q.fact_ref !== "NONE") {
			entry.fact = q.fact_ref;
		}

		if (q.expected_not_contains)
			entry.expected_not_contains = q.expected_not_contains;
		if (q.setup) entry.setup = q.setup;
		if (q.update) entry.update = q.update;
		if (q.verify) entry.verify = q.verify;
		if (q.noisy_input) entry.noisy_input = q.noisy_input;
		if (q.expected_pattern) entry.expected_pattern = q.expected_pattern;
		if (q.hallucination_keywords)
			entry.hallucination_keywords = q.hallucination_keywords;
		if (q.context) entry.context = q.context;
		if (q.min_facts) entry.min_facts = q.min_facts;
		if (q.is_reasoning) entry.is_reasoning = q.is_reasoning;

		if (q.scoring) {
			entry.scoring = q.scoring;
			if (q.scoring.score_3 && q.scoring.score_3.length > 0) {
				entry.expected_contains = q.scoring.score_3;
			}
			if (
				q.scoring.score_0 &&
				q.scoring.score_0.length > 0 &&
				!entry.expected_not_contains
			) {
				entry.expected_not_contains = q.scoring.score_0;
			}
		}

		if (q.distractor_ref) entry.distractor_ref = q.distractor_ref;
		if (q.distractor_note) entry.distractor_note = q.distractor_note;

		if (cat === "abstention" && !entry.fact) {
			delete entry.fact;
		}

		if (cat === "irrelevant_isolation" && !entry.fact) {
			delete entry.fact;
		}

		capabilities[cat].queries.push(entry);
	}

	if (capabilities.abstention) {
		capabilities.abstention.mandatory_pass = true;
		capabilities.abstention.weight = 2;
	}

	return {
		$schema: v2.$schema,
		capabilities,
		scoring:
			v2.scoring ||
			{
				mandatory_pass: ["abstention"],
				grades: {
					A: "core >= 90%",
					B: "core >= 75%",
					C: "core >= 60%",
					F: "core < 60%",
				},
			},
		version: v2.version,
	};
}
