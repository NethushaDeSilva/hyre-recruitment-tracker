// Re-run the 5.4 firing-rate measurement against the CORRECTED
// SKILL_SIMILARITY_THRESHOLD (0.8099, MySQL/PostgreSQL) instead of the
// original 0.8804 (Angular/AngularJS — layer-1-unreachable, see
// ws6-audit-layer1-collapse.mjs). Replicates matchTermSet()'s exact
// algorithm (functions/_lib/filtration/matching.js) against the REAL,
// already-captured extracted skills[] for fixtures 01-08 (from
// ws6-batch1-results.json / ws6-variance-runs.json — no re-extraction, same
// candidate profiles that were actually scored), with a FRESH real embedding
// call so every similarity is a genuine, current measurement, not reused
// stale numbers. Classifies every layer-3 comparison under BOTH thresholds
// to show exactly what would flip.
import { readFileSync } from "node:fs";
import { normalizeTerm, cosine } from "../functions/_lib/filtration/matching.js";

const ORIGIN = "https://hyre-hiring.pages.dev";
const OLD_THRESHOLD = 0.8803687307862392;
const NEW_THRESHOLD = 0.8099; // MySQL/PostgreSQL, the corrected binding pair

const BD01_REQUIREMENTS = {
  requiredSkills: ["Node.js", "Docker", "PostgreSQL", "Redis", "Kubernetes", "MongoDB"],
  niceToHave: ["Terraform", "GraphQL"],
};

async function embedTexts(texts) {
  const res = await fetch(`${ORIGIN}/api/embed`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: texts }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("embed failed: " + JSON.stringify(data));
  return data.embeddings;
}

// Exact replica of matchTermSet()'s layer-1 + layer-3 split, but returns the
// RAW best similarity for every layer-3 comparison instead of collapsing it
// to a boolean against one hardcoded threshold.
async function classify(requiredTerms, candidateTerms) {
  const required = [...new Set(requiredTerms.filter(Boolean))];
  const candidates = [...new Set(candidateTerms.filter(Boolean))];
  const normCandidates = candidates.map((c) => ({ raw: c, norm: normalizeTerm(c) }));
  const remaining = [];
  const layer1Matches = [];
  for (const req of required) {
    const reqNorm = normalizeTerm(req);
    const hit = normCandidates.find((c) => c.norm === reqNorm);
    if (hit) layer1Matches.push(req);
    else remaining.push(req);
  }
  if (!remaining.length) return { layer1Matches, layer3: [] };

  const allTexts = [...new Set([...remaining, ...candidates])];
  const vectors = await embedTexts(allTexts);
  const byText = new Map(allTexts.map((t, i) => [t, vectors[i]]));

  const layer3 = remaining.map((req) => {
    const reqVec = byText.get(req);
    let best = null;
    for (const cand of candidates) {
      const sim = cosine(reqVec, byText.get(cand));
      if (!best || sim > best.similarity) best = { candidate: cand, similarity: sim };
    }
    return {
      required: req,
      bestCandidate: best?.candidate ?? null,
      similarity: best?.similarity ?? 0,
      clearsOld: best ? best.similarity > OLD_THRESHOLD : false,
      clearsNew: best ? best.similarity > NEW_THRESHOLD : false,
    };
  });
  return { layer1Matches, layer3 };
}

const batch1 = JSON.parse(readFileSync("test-fixtures/ws6-batch1-results.json", "utf8"));

let totalLayer3 = 0, flips = 0;
const allLayer3Rows = [];

for (const fx of batch1) {
  const skills = fx.parsed?.skills || [];
  const core = await classify(BD01_REQUIREMENTS.requiredSkills, skills);
  const nice = await classify(BD01_REQUIREMENTS.niceToHave, skills);
  for (const row of [...core.layer3, ...nice.layer3]) {
    totalLayer3++;
    const flip = row.clearsNew && !row.clearsOld;
    if (flip) flips++;
    allLayer3Rows.push({ fixture: fx.id, ...row, flip });
    console.log(
      `fixture ${fx.id}: "${row.required}" best="${row.bestCandidate}" sim=${row.similarity.toFixed(4)} ` +
      `old(${OLD_THRESHOLD.toFixed(4)})=${row.clearsOld ? "MATCH" : "miss"} new(${NEW_THRESHOLD})=${row.clearsNew ? "MATCH" : "miss"}` +
      `${flip ? "  <<< FLIPS under corrected threshold" : ""}`
    );
  }
}

console.log(`\n=== Summary ===`);
console.log(`Total layer-3 comparisons (skills only, fixtures 01-07, single real pass each): ${totalLayer3}`);
console.log(`Comparisons that flip from "missing" to "matched" under the corrected threshold: ${flips}`);

import { writeFileSync } from "node:fs";
writeFileSync("test-fixtures/ws6-reclassified-threshold.json", JSON.stringify({ OLD_THRESHOLD, NEW_THRESHOLD, rows: allLayer3Rows }, null, 2));
console.log("Saved to test-fixtures/ws6-reclassified-threshold.json");
