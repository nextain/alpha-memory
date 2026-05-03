/**
 * Consolidation Promise Gate — R1.1 (2026-05-03).
 *
 * Problem (이전 race condition):
 *   let consolidating = false;
 *   async function ensureConsolidated() {
 *     if (!needsConsolidation || consolidating) return;  // ← race
 *     consolidating = true;
 *     ...
 *   }
 *
 * 진행 중 consolidation 을 다음 호출이 기다리지 않고 즉시 return →
 * caller (search 등) 가 stale state 로 검색.
 *
 * Fix: 진행 중 Promise 를 공유, 모든 concurrent 호출 같은 결과 대기.
 *
 * Plan-v3-anchor §4 R1.1 의 success criteria:
 *   K-MemBench 27q 측정에서 r@50 > 0% (artifact 제거)
 */

export interface ConsolidationGate {
	/** 새 episode 추가 후 호출 — 다음 ensureConsolidated 가 실제 실행 */
	markDirty(): void;
	/** Consolidation 보장 — 진행 중이면 대기, 시작 안 했으면 시작 + 대기 */
	ensureConsolidated(): Promise<void>;
	/** Test용: pending Promise 가 있는지 */
	isPending(): boolean;
	/** Test용: dirty flag 상태 */
	isDirty(): boolean;
}

export interface ConsolidationGateOptions {
	/** 실제 consolidation 작업 */
	consolidate: () => Promise<void>;
	/** 에러 핸들링 — 기본은 console.error + swallow (graceful degradation) */
	onError?: (err: unknown) => void;
	/** 시작 시 dirty 인지 (서버 startup 시 unconsolidated episodes 있으면 true) */
	initialDirty?: boolean;
}

export function createConsolidationGate(
	opts: ConsolidationGateOptions,
): ConsolidationGate {
	let dirty = opts.initialDirty ?? false;
	let pending: Promise<void> | null = null;

	const onError = opts.onError ?? ((err) => {
		const msg = err instanceof Error ? err.message : String(err);
		console.error("Consolidation error:", msg.slice(0, 200));
	});

	return {
		markDirty() {
			dirty = true;
		},

		async ensureConsolidated() {
			if (!dirty) return;
			// 이미 진행 중인 consolidation 이 있으면 같은 Promise 대기
			if (pending) return pending;

			pending = (async () => {
				try {
					await opts.consolidate();
					dirty = false;
				} catch (err) {
					onError(err);
					// throw 안 함 — caller 가 stale state 로 동작 (graceful degradation)
				} finally {
					pending = null;
				}
			})();
			return pending;
		},

		isPending() {
			return pending !== null;
		},

		isDirty() {
			return dirty;
		},
	};
}
