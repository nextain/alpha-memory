import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Exclude compiled output — vitest would otherwise double-run *.test.js in dist/
		exclude: ["**/node_modules/**", "**/dist/**"],
	},
});
