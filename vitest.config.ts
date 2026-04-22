import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Exclude compiled output — vitest would otherwise double-run *.test.js in dist/
		exclude: ["**/node_modules/**", "**/dist/**"],
		// Phase A coverage floor enforcement (plan v3 §6, R10 close-gate condition).
		// Per-file thresholds match spec documentation; aggregate threshold left
		// generous since benchmark/adapters/* are untested in Phase A scope.
		coverage: {
			provider: "v8",
			reporter: ["text", "json-summary"],
			include: [
				"src/memory/importance.ts",
				"src/memory/decay.ts",
				"src/memory/reconsolidation.ts",
				"src/memory/adapters/local.ts",
			],
			thresholds: {
				// Per plan v3 §6:
				// - importance.ts ≥ 85% line, ≥ 70% branch
				// - decay.ts ≥ 85% line, ≥ 80% branch
				// - reconsolidation.ts ≥ 75% line, ≥ 80% branch (relaxed to avoid tautology padding)
				"src/memory/importance.ts": {
					lines: 85,
					branches: 70,
					functions: 85,
					statements: 85,
				},
				"src/memory/decay.ts": {
					lines: 85,
					branches: 80,
					functions: 85,
					statements: 85,
				},
				"src/memory/reconsolidation.ts": {
					lines: 75,
					branches: 80,
					functions: 75,
					statements: 75,
				},
			},
		},
	},
});
