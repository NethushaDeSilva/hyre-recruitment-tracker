import { readFileSync, writeFileSync } from "node:fs";

const runs = JSON.parse(readFileSync("test-fixtures/ws6-variance-runs.json", "utf8"));
const byFixture = {};
for (const r of runs) (byFixture[r.fixtureId] ??= []).push(r);

function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function stdev(a) { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }

const variance = {};
for (const [id, rs] of Object.entries(byFixture)) {
  const scores = rs.map((r) => r.overallScore);
  variance[id] = { scores, mean: mean(scores), stdev: stdev(scores), min: Math.min(...scores), max: Math.max(...scores) };
}
console.log("=== WS6.4 end-to-end variance (per fixture, n=10) ===");
for (const [id, v] of Object.entries(variance)) {
  console.log(`Fixture ${id}: mean=${v.mean.toFixed(2)} sigma=${v.stdev.toFixed(4)} range=[${v.min},${v.max}]`);
}

// --- WS6.5 rank stability: treat run-index i across all 7 fixtures as "round i" ---
const FIXTURE_IDS = Object.keys(byFixture).sort();
const rounds = [];
for (let i = 0; i < 10; i++) {
  const entries = FIXTURE_IDS.map((id) => ({ id, ...byFixture[id][i] }));
  entries.sort((a, b) => {
    if (b.overallScore !== a.overallScore) return b.overallScore - a.overallScore;
    const bCore = b.breakdown.coreSkills.score, aCore = a.breakdown.coreSkills.score;
    if (bCore !== aCore) return bCore - aCore;
    return a.id.localeCompare(b.id);
  });
  let rank = 0, lastKey = null;
  const ranks = {};
  entries.forEach((e, idx) => {
    const key = `${e.overallScore}:${e.breakdown.coreSkills.score}`;
    if (key !== lastKey) rank = idx + 1;
    ranks[e.id] = rank;
    lastKey = key;
  });
  rounds.push(ranks);
}
console.log("\n=== WS6.5 rank per round (fixture -> rank), 10 rounds ===");
for (const id of FIXTURE_IDS) {
  const ranksAcrossRounds = rounds.map((r) => r[id]);
  console.log(`Fixture ${id}: ranks=${JSON.stringify(ranksAcrossRounds)} stdev=${stdev(ranksAcrossRounds).toFixed(4)}`);
}

// Spearman's rho between round 0's rank order and every other round (all vs round 0, then report min)
function spearman(ranksA, ranksB, ids) {
  const n = ids.length;
  const d2 = ids.reduce((sum, id) => sum + (ranksA[id] - ranksB[id]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}
const rhos = [];
for (let i = 1; i < rounds.length; i++) rhos.push(spearman(rounds[0], rounds[i], FIXTURE_IDS));
console.log("\nSpearman's rho (round 0 vs each other round):", rhos.map((r) => r.toFixed(4)));
console.log("min rho:", Math.min(...rhos).toFixed(4));

// --- WS5.4 embedding layer firing rate, aggregated across the whole fixture set ---
let totalNorm = 0, totalEmbed = 0, totalNone = 0, totalBorderline = 0, totalComparisons = 0;
for (const r of runs) {
  totalNorm += r.instrumentation.layers.normalisation;
  totalEmbed += r.instrumentation.layers.embedding;
  totalNone += r.instrumentation.layers.none;
  totalBorderline += r.instrumentation.borderline;
  totalComparisons += r.instrumentation.layers.normalisation + r.instrumentation.layers.embedding + r.instrumentation.layers.none;
}
const layer3Attempts = totalEmbed + totalNone;
console.log("\n=== WS5.4 embedding layer firing rate (aggregated across all 70 runs) ===");
console.log(`Total comparisons: ${totalComparisons}`);
console.log(`  normalisation (layer 1/2, free): ${totalNorm} (${(100 * totalNorm / totalComparisons).toFixed(1)}%)`);
console.log(`  reached layer 3 (embedding attempted): ${layer3Attempts} (${(100 * layer3Attempts / totalComparisons).toFixed(1)}%)`);
console.log(`    of those, credited (embedding): ${totalEmbed} (${layer3Attempts ? (100 * totalEmbed / layer3Attempts).toFixed(1) : "n/a"}% of layer-3 attempts)`);
console.log(`    of those, no match (none): ${totalNone} (${layer3Attempts ? (100 * totalNone / layer3Attempts).toFixed(1) : "n/a"}% of layer-3 attempts)`);
console.log(`  borderline (within 0.01 of threshold): ${totalBorderline} (${(100 * totalBorderline / totalComparisons).toFixed(1)}% of all comparisons)`);

writeFileSync("test-fixtures/ws6-analysis.json", JSON.stringify({ variance, rounds, rhos, minRho: Math.min(...rhos), firing: { totalNorm, totalEmbed, totalNone, totalBorderline, totalComparisons, layer3Attempts } }, null, 2));
