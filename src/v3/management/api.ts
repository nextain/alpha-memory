/**
 * Memory management API.
 *
 * Exposes user-facing operations beyond add/search:
 *   - delete (forget by id)
 *   - update (correct fact)
 *   - forgetByQuery (synthetic forget command, e.g., "방금 말한 X 잊어줘")
 */

import type { MemoryEngine, QueryContext } from "../types.js";

const FORGET_PATTERN_KO = /(잊어|잊어줘|잊어버려|지워|삭제|취소|기억하지 마)/;

export function isForgetCommand(text: string): boolean {
	return FORGET_PATTERN_KO.test(text);
}

export interface ForgetByQueryResult {
	matched: number;
	deletedIds: string[];
}

export async function forgetByQuery(
	engine: MemoryEngine,
	queryContext: QueryContext,
	maxDelete = 5,
): Promise<ForgetByQueryResult> {
	const candidates = await engine.search({ ...queryContext, topK: maxDelete });
	const deleted: string[] = [];
	for (const c of candidates) {
		try {
			await engine.delete(c.id, queryContext.userId);
			deleted.push(c.id);
		} catch (_err) {
			// ignore individual delete errors
		}
	}
	return { matched: candidates.length, deletedIds: deleted };
}
