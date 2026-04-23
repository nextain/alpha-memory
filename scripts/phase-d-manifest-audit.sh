#!/usr/bin/env bash
# Phase D migration manifest audit.
# Greps plan-a §10.5 manifest strings and reports flip state per sub-phase.

set -euo pipefail

cd "$(dirname "$0")/.."

RECONS=src/memory/__tests__/reconsolidation.test.ts
IMP=src/memory/__tests__/importance.test.ts
IMP_CORP=src/memory/__tests__/importance.corpus.test.ts
DECAY=src/memory/__tests__/decay.test.ts

echo "=== Phase D manifest audit ==="
echo

count_fails() {
	local file="$1"
	local label="$2"
	if [[ ! -f "$file" ]]; then
		echo "  [MISSING] $label: $file"
		return
	fi
	local n
	n=$(grep -cE '^[[:space:]]*it\.fails\(' "$file" || true)
	echo "  $label: $n it.fails lines"
}

count_pins() {
	local file="$1"
	local label="$2"
	if [[ ! -f "$file" ]]; then return; fi
	local n
	n=$(grep -cE 'pin\].*currently|\[B-BUG.*pin\]' "$file" || true)
	echo "  $label: $n current-state pin lines"
}

echo "--- .fails counts (target: 0 for Phase-D-scoped rows after D.7) ---"
count_fails "$RECONS" "reconsolidation"
count_fails "$IMP" "importance"
count_fails "$IMP_CORP" "importance.corpus"
count_fails "$DECAY" "decay"

echo
echo "--- current-state pin counts (target: 0 after coordinated deletion at D.7) ---"
count_pins "$RECONS" "reconsolidation"
count_pins "$IMP" "importance"
count_pins "$IMP_CORP" "importance.corpus"
count_pins "$DECAY" "decay"

echo
echo "--- Phase A close baseline (manifest-committed expectations) ---"
echo "  .fails baseline: reconsolidation 6, importance 2, importance.corpus 3, decay 1 = 12 total"
echo "  pins baseline:   reconsolidation 2, importance 1, decay 3 = 6 total"
echo
echo "Audit complete. Use at each sub-phase close + D.7 gate."
