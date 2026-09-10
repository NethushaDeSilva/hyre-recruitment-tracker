// WS6.1 threshold calibration. Reads the two labelled pair sets, embeds every
// unique string once via /api/embed (@cf/baai/bge-base-en-v1.5), computes
// cosine similarity per pair, and derives SKILL_SIMILARITY_THRESHOLD and
// QUAL_SIMILARITY_THRESHOLD independently using the 6.1 selection rule:
//
//   - min(trueMatches) > max(hardNegatives)  -> threshold = midpoint
//   - otherwise (the realistic case)         -> threshold = max(hardNegatives),
//     zero hard-negative false positives by construction, false-negative rate
//     on trueMatches recorded as a measured limitation.
//
// Never escalates ambiguous pairs to an LLM — that would break scoring
// determinism (5.4). Writes calibration-thresholds.json (committed, consumed
// later by thresholds.js) and a human-readable table for the WS6.7 deliverable.
//
// RUN: node scripts/calibrate-thresholds.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PAIRS_DIR = join(ROOT, "test-fixtures", "calibration-pairs");
const RUNTIME_DIR = join(ROOT, "functions", "_lib", "filtration");
const EMBED_URL = process.env.EMBED_API_URL || "https://hyre-hiring.pages.dev/api/embed";

function loadPairs(file) {
  return JSON.parse(readFileSync(join(PAIRS_DIR, file), "utf8"));
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Embed every unique string once (5.5 — economics apply to calibration too),
// batching in chunks the /api/embed endpoint accepts per call.
async function embedAll(strings) {
  const unique = [...new Set(strings)];
  const vectors = new Map();
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chunk }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.embeddings)) {
      throw new Error(`/api/embed failed (${res.status}): ${data.error || "no embeddings returned"}`);
    }
    chunk.forEach((s, idx) => vectors.set(s, data.embeddings[idx]));
    console.log(`  …embedded ${Math.min(i + CHUNK, unique.length)}/${unique.length} unique strings`);
  }
  return vectors;
}

// The 6.1 selection rule, applied to one domain's (skills or qualifications)
// 45-pair distribution independently.
function deriveThreshold(pairs) {
  const byCat = (cat) => pairs.filter((p) => p.category === cat).map((p) => p.similarity);
  const trueMatches = byCat("true_match");
  const trueNonMatches = byCat("true_non_match");
  const hardNegatives = byCat("hard_negative");

  const minTrueMatch = Math.min(...trueMatches);
  const maxTrueMatch = Math.max(...trueMatches);
  const maxHardNeg = Math.max(...hardNegatives);
  const minHardNeg = Math.min(...hardNegatives);
  const maxTrueNonMatch = Math.max(...trueNonMatches);
  const minTrueNonMatch = Math.min(...trueNonMatches);

  const separated = minTrueMatch > maxHardNeg;
  const threshold = separated ? (minTrueMatch + maxHardNeg) / 2 : maxHardNeg;

  // Credit rule is STRICTLY above threshold, never >=. Threshold is defined as
  // max(hardNegatives) in the overlap case, so a >= rule would let that exact
  // hard negative satisfy its own boundary — a false positive by construction.
  // Strictly-above closes it without an arbitrary epsilon constant.
  const falseNegatives = trueMatches.filter((s) => s <= threshold);
  const hardNegativeFalsePositives = hardNegatives.filter((s) => s > threshold);

  return {
    threshold,
    selectionRule: separated ? "midpoint (distributions separated cleanly)" : "max(hardNegatives) — distributions overlapped",
    separated,
    stats: {
      trueMatch: { min: minTrueMatch, max: maxTrueMatch, n: trueMatches.length },
      trueNonMatch: { min: minTrueNonMatch, max: maxTrueNonMatch, n: trueNonMatches.length },
      hardNegative: { min: minHardNeg, max: maxHardNeg, n: hardNegatives.length },
    },
    falseNegativeRate: falseNegatives.length / trueMatches.length,
    falseNegativeCount: falseNegatives.length,
    hardNegativeFalsePositiveRate: hardNegativeFalsePositives.length / hardNegatives.length,
  };
}

function fmt(n) { return n.toFixed(4); }

// Secondary (informational) pairs are never part of threshold derivation —
// they're scored against the PRIMARY threshold purely to illustrate the
// category-to-instance / directionality limitation named in 5.4.
function renderSecondaryTable(label, pairs, primaryThreshold) {
  const lines = [
    `## ${label} — secondary, informational only (does not set the threshold)`,
    "",
    `Scored against the PRIMARY threshold ${fmt(primaryThreshold)}. Clearing or missing it here changes nothing at runtime — this table exists to show what happens when a vacancy states a general capability and a CV names a specific tool, which the primary keyword-vs-keyword set above does not cover.`,
    "",
    "| a (general capability) | b (named tool) | relation | similarity | clears primary threshold |",
    "|---|---|---|---|---|",
  ];
  let clears = 0;
  for (const p of pairs) {
    const ok = p.similarity > primaryThreshold;
    if (ok) clears++;
    lines.push(`| ${p.a} | ${p.b} | ${p.relation || "—"} | ${fmt(p.similarity)} | ${ok ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push(`- ${clears}/${pairs.length} clear the primary threshold`);
  lines.push("");
  return { md: lines.join("\n"), clears, total: pairs.length };
}

function renderTable(label, pairs, derived) {
  const hasRelation = pairs.some((p) => p.relation);
  const lines = [`## ${label} — derived threshold: ${fmt(derived.threshold)} (${derived.selectionRule})`, ""];
  if (hasRelation) {
    lines.push("| a | b | category | relation | similarity |", "|---|---|---|---|---|");
    for (const p of pairs) {
      lines.push(`| ${p.a} | ${p.b} | ${p.category} | ${p.relation || "—"} | ${fmt(p.similarity)} |`);
    }
  } else {
    lines.push("| a | b | category | similarity |", "|---|---|---|---|");
    for (const p of pairs) {
      lines.push(`| ${p.a} | ${p.b} | ${p.category} | ${fmt(p.similarity)} |`);
    }
  }
  lines.push("");
  lines.push(`- true_match: min ${fmt(derived.stats.trueMatch.min)}, max ${fmt(derived.stats.trueMatch.max)} (n=${derived.stats.trueMatch.n})`);
  lines.push(`- true_non_match: min ${fmt(derived.stats.trueNonMatch.min)}, max ${fmt(derived.stats.trueNonMatch.max)} (n=${derived.stats.trueNonMatch.n})`);
  lines.push(`- hard_negative: min ${fmt(derived.stats.hardNegative.min)}, max ${fmt(derived.stats.hardNegative.max)} (n=${derived.stats.hardNegative.n})`);
  lines.push(`- distributions separated cleanly: ${derived.separated}`);
  lines.push(`- false-negative rate on true_match at this threshold: ${(derived.falseNegativeRate * 100).toFixed(1)}% (${derived.falseNegativeCount}/${derived.stats.trueMatch.n})`);
  lines.push(`- hard-negative false-positive rate at this threshold: ${(derived.hardNegativeFalsePositiveRate * 100).toFixed(1)}%`);
  lines.push("");
  return lines.join("\n");
}

async function run() {
  const skillsSet = loadPairs("skills-pairs.json");
  const qualSet = loadPairs("qualifications-pairs.json");
  const skillsSecondarySet = loadPairs("skills-secondary-pairs.json");

  const allStrings = [
    ...skillsSet.pairs.flatMap((p) => [p.a, p.b]),
    ...qualSet.pairs.flatMap((p) => [p.a, p.b]),
    ...skillsSecondarySet.pairs.flatMap((p) => [p.a, p.b]),
  ];
  console.log(`Embedding ${new Set(allStrings).size} unique strings (${allStrings.length} total, deduped) via ${EMBED_URL} …`);
  const vectors = await embedAll(allStrings);

  const withSimilarity = (pairs) =>
    pairs.map((p) => ({ ...p, similarity: cosine(vectors.get(p.a), vectors.get(p.b)) }));

  const skillsPairs = withSimilarity(skillsSet.pairs);
  const qualPairs = withSimilarity(qualSet.pairs);
  const skillsSecondaryPairs = withSimilarity(skillsSecondarySet.pairs);

  const skillsDerived = deriveThreshold(skillsPairs);
  const qualDerived = deriveThreshold(qualPairs);

  console.log("\n=== SKILLS ===");
  console.log(`  true_match:      min ${fmt(skillsDerived.stats.trueMatch.min)}  max ${fmt(skillsDerived.stats.trueMatch.max)}`);
  console.log(`  true_non_match:  min ${fmt(skillsDerived.stats.trueNonMatch.min)}  max ${fmt(skillsDerived.stats.trueNonMatch.max)}`);
  console.log(`  hard_negative:   min ${fmt(skillsDerived.stats.hardNegative.min)}  max ${fmt(skillsDerived.stats.hardNegative.max)}`);
  console.log(`  SKILL_SIMILARITY_THRESHOLD = ${fmt(skillsDerived.threshold)}  (${skillsDerived.selectionRule})`);
  console.log(`  false-negative rate on true_match: ${(skillsDerived.falseNegativeRate * 100).toFixed(1)}%`);

  console.log("\n=== QUALIFICATIONS ===");
  console.log(`  true_match:      min ${fmt(qualDerived.stats.trueMatch.min)}  max ${fmt(qualDerived.stats.trueMatch.max)}`);
  console.log(`  true_non_match:  min ${fmt(qualDerived.stats.trueNonMatch.min)}  max ${fmt(qualDerived.stats.trueNonMatch.max)}`);
  console.log(`  hard_negative:   min ${fmt(qualDerived.stats.hardNegative.min)}  max ${fmt(qualDerived.stats.hardNegative.max)}`);
  console.log(`  QUAL_SIMILARITY_THRESHOLD = ${fmt(qualDerived.threshold)}  (${qualDerived.selectionRule})`);
  console.log(`  false-negative rate on true_match: ${(qualDerived.falseNegativeRate * 100).toFixed(1)}%`);

  const secondary = renderSecondaryTable("Skills", skillsSecondaryPairs, skillsDerived.threshold);
  console.log("\n=== SKILLS — SECONDARY (informational, does not set the threshold) ===");
  console.log(`  ${secondary.clears}/${secondary.total} category-to-instance/phrase pairs clear the primary threshold`);

  const output = {
    calibratedAt: new Date().toISOString(),
    model: "@cf/baai/bge-base-en-v1.5",
    skillThreshold: skillsDerived.threshold,
    qualThreshold: qualDerived.threshold,
    skills: { derived: skillsDerived, pairs: skillsPairs },
    qualifications: { derived: qualDerived, pairs: qualPairs },
    skillsSecondary: { governsThreshold: false, clears: secondary.clears, total: secondary.total, pairs: skillsSecondaryPairs },
  };
  writeFileSync(join(PAIRS_DIR, "calibration-thresholds.json"), JSON.stringify(output, null, 2));

  const md = [
    "# WS6.1 threshold calibration results",
    "",
    `Calibrated ${output.calibratedAt} against \`${output.model}\`.`,
    "",
    renderTable("Skills — PRIMARY (sets SKILL_SIMILARITY_THRESHOLD)", skillsPairs, skillsDerived),
    secondary.md,
    renderTable("Qualifications", qualPairs, qualDerived),
  ].join("\n");
  writeFileSync(join(PAIRS_DIR, "calibration-results.md"), md);

  // Runtime constants — generated, never hand-typed (5.4: "never commit a
  // numeric literal for either threshold"). thresholds.js imports this file;
  // it is the ONLY place the two numbers exist outside the evidence above.
  const generated = [
    "// AUTO-GENERATED by scripts/calibrate-thresholds.mjs — do not hand-edit.",
    "// Regenerate with: npm run calibrate",
    "// Full pair-level evidence: test-fixtures/calibration-pairs/calibration-results.md",
    "",
    "export const CALIBRATED_THRESHOLDS = {",
    `  calibratedAt: ${JSON.stringify(output.calibratedAt)},`,
    `  model: ${JSON.stringify(output.model)},`,
    `  skillThreshold: ${output.skillThreshold},`,
    `  qualThreshold: ${output.qualThreshold},`,
    "};",
    "",
  ].join("\n");
  writeFileSync(join(RUNTIME_DIR, "calibrated-thresholds.generated.js"), generated);

  console.log(`\nWrote ${join(PAIRS_DIR, "calibration-thresholds.json")}`);
  console.log(`Wrote ${join(PAIRS_DIR, "calibration-results.md")}`);
  console.log(`Wrote ${join(RUNTIME_DIR, "calibrated-thresholds.generated.js")}`);
  process.exit(0);
}

run().catch((e) => { console.error("Calibration failed:", e); process.exit(1); });
