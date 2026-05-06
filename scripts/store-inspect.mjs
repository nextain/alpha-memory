#!/usr/bin/env node
// Inspect a benchmark store for the side-effect metrics that #22 retro
// flagged as the *real* signal (vs the fact-bank score, which over-fits).
//
// Usage:
//   node scripts/store-inspect.mjs <store-path>
//
// Prints:
//   - total facts / superseded count / -v{ts} versioned count
//   - factEmbeddings / episodeEmbeddings present?
//   - top entity-attribute clusters (potential over-aggressive supersede)
//   - LLM verdict confidence distribution (if filter trace available — TODO)

import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) { console.error("usage: store-inspect.mjs <store-path>"); process.exit(2); }
const s = JSON.parse(readFileSync(path, "utf-8"));
const facts = s.facts ?? [];
const eps = s.episodes ?? [];
const fEmb = Object.keys(s.factEmbeddings ?? {}).length;
const eEmb = Object.keys(s.episodeEmbeddings ?? {}).length;
const sup = facts.filter(f => f.status === "superseded");
const ver = facts.filter(f => /-v\d+/.test(f.id ?? ""));
const active = facts.filter(f => f.status === "active");

console.log(`\n━━━ store side-effect metrics (#22 retro) ━━━━━━━━━━━━━━`);
console.log(`  store path:        ${path}`);
console.log(`  episodes:          ${eps.length}`);
console.log(`  facts (total):     ${facts.length}`);
console.log(`    active:          ${active.length}`);
console.log(`    superseded:      ${sup.length}    ← R2.5 mechanism activity`);
console.log(`    versioned (-v):  ${ver.length}    ← R2.3 history rows`);
console.log(`  factEmbeddings:    ${fEmb}    ← embedding chain reachable`);
console.log(`  episodeEmbeddings: ${eEmb}`);

// Entity-attribute clustering — facts whose content shares a leading attribute
// label (e.g. "사용자 에디터:") cluster together. Over-aggressive supersede
// often shows as one cluster having many superseded entries.
const clusters = new Map();
for (const f of facts) {
  const colon = (f.content ?? "").indexOf(":");
  if (colon < 0) continue;
  const key = f.content.slice(0, colon).trim();
  if (!clusters.has(key)) clusters.set(key, { active: 0, superseded: 0, total: 0 });
  const c = clusters.get(key);
  c.total++;
  if (f.status === "superseded") c.superseded++;
  else if (f.status === "active") c.active++;
}
const topClusters = [...clusters.entries()]
  .filter(([, c]) => c.superseded > 0)
  .sort((a, b) => b[1].superseded - a[1].superseded)
  .slice(0, 10);
console.log(`\n  ── attribute clusters with superseded entries (top 10) ──`);
for (const [key, c] of topClusters) {
  console.log(`    ${c.superseded.toString().padStart(3)} superseded  ${c.active.toString().padStart(2)} active  ${c.total.toString().padStart(2)} total  "${key.slice(0, 60)}"`);
}
if (topClusters.length === 0) console.log(`    (no superseded facts)`);

// Sample of superseded facts for visual inspection
if (sup.length > 0) {
  console.log(`\n  ── superseded sample (first 5) ──`);
  for (const f of sup.slice(0, 5)) {
    console.log(`    ${(f.content ?? "").slice(0, 100)}`);
  }
}
