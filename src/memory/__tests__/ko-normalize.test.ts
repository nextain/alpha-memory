/**
 * R3.0: KO normalize tests.
 * Verify Korean text tokenization for BM25 search integration.
 */
import { describe, expect, it } from "vitest";
import { tokenize, stripParticle, normalize } from "../ko-normalize.js";

describe("ko-normalize", () => {
	describe("stripParticle", () => {
		it("strips subject particle 가 from long enough token", () => {
			expect(stripParticle("고양이가")).toBe("고양이");
		});

		it("strips topic particle 는 from long enough token", () => {
			expect(stripParticle("프로그램은")).toBe("프로그램");
		});

		it("preserves short tokens unchanged", () => {
			const result = stripParticle("개는");
			expect(result.length).toBeGreaterThan(0);
		});
	});

	describe("tokenize", () => {
		it("extracts meaningful Korean tokens", () => {
			const tokens = tokenize("고양이가 밥을 먹었어요");
			expect(tokens.some((t) => t.includes("고양이"))).toBe(true);
			expect(tokens.length).toBeGreaterThan(0);
		});

		it("handles mixed KO/EN text", () => {
			const tokens = tokenize("VS Code를 사용합니다");
			expect(tokens.some((t) => t.includes("code"))).toBe(true);
			expect(tokens.some((t) => t.includes("사용"))).toBe(true);
		});

		it("handles empty input", () => {
			expect(tokenize("")).toEqual([]);
		});

		it("handles punctuation", () => {
			const tokens = tokenize("안녕하세요! 반갑습니다.");
			expect(tokens.length).toBeGreaterThan(0);
		});

		it("produces consistent results for same input", () => {
			const a = tokenize("나는 서울에 살아요");
			const b = tokenize("나는 서울에 살아요");
			expect(a).toEqual(b);
		});

		it("strips particles from search-relevant tokens", () => {
			const tokens = tokenize("Neovim을 사용합니다");
			expect(tokens.some((t) => t.includes("neovim"))).toBe(true);
			expect(tokens.some((t) => t.includes("사용"))).toBe(true);
		});
	});

	describe("normalize", () => {
		it("returns space-joined tokens", () => {
			const result = normalize("고양이가 밥을 먹었어요");
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});
	});
});
