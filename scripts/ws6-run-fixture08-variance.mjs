// WS6.4/6.5 near-threshold gap-closer. Fixtures 01-07 all landed with SCORING
// (not just extraction) that never touched layer 3 close enough to the
// threshold for embedding non-determinism to matter (5.4: 130 layer-3
// attempts, 0 borderline). This fixture is built specifically to close that
// gap, using the ONE pair in this project with real historical evidence of
// crossing its own threshold: "Electrical Engineering" / "Electronic
// Engineering" (the qualifications calibration's threshold-setting hard
// negative, measured at 0.8701 in one calibration round and 0.8782/0.8804 in
// another — WS6.1). A systematic search across 34 skill-pair candidates
// (Docker/Podman, Kubernetes/OpenShift, MongoDB/DynamoDB, etc.) found nothing
// closer than ~0.065 from SKILL_SIMILARITY_THRESHOLD — this qualification
// pair, checked live moments before this script was written, sits 0.0125
// below QUAL_SIMILARITY_THRESHOLD (0.865785 vs 0.878237) — the closest real,
// non-contrived candidate available, and unlike every skill pair tried, it
// is NOT collapsed by normalizeTerm()'s layer-1 suffix-stripping (confirmed:
// unlike "Angular"/"AngularJS", which DOES collapse to the same string at
// layer 1 despite being a calibration hard-negative — a real, separate
// finding recorded in the results doc, not something this fixture depends on).
//
// Ground truth, hand-derived BEFORE running (6.2): qualification field is the
// ONLY variable component — everything else is deliberately clean (all 6
// core skills + both nice-to-haves stated verbatim, 10+ years experience
// against an 8-year minimum, degree level 6 meets the required level 6).
//   Field does NOT clear (the currently-measured state): 0+45+20+10 = 75/100
//   Field DOES clear (the flip case)                    : 25+45+20+10 = 100/100
// This is deliberately bimodal, not a single-point band — that IS the test.
import { readFileSync, writeFileSync } from "node:fs";
import { scoreApplication } from "../functions/_lib/filtration/engine.js";
import { cosine } from "../functions/_lib/filtration/matching.js";

const ORIGIN = "https://hyre-hiring.pages.dev";
const RUNS = 10;
const FIXTURE_ID = "08";

const REQUIREMENTS = {
  requiredQualification: { level: 6, field: "Electronic Engineering" },
  requiredSkills: ["Node.js", "Docker", "PostgreSQL", "Redis", "Kubernetes", "MongoDB"],
  minYearsExperience: 8,
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

async function parseCv(text) {
  const res = await fetch(`${ORIGIN}/api/parse-cv`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
  });
  return res.json();
}

// The engine only exposes fieldSimilarity when a match SUCCEEDS
// (qualificationScore(): "fieldSimilarity: hit ? hit.similarity : null") — a
// near-miss's actual measured similarity is otherwise invisible from the
// outside. Intercept the same embedTexts() call the engine makes so we can
// see and report the raw number on every run, not just the derived boolean.
async function oneRun(raw, runIndex) {
  let capturedSim = null;
  const instrumentedEmbed = async (texts) => {
    const embeddings = await embedTexts(texts);
    const ei = texts.findIndex((t) => t.toLowerCase() === "electrical engineering");
    const ni = texts.findIndex((t) => t.toLowerCase() === "electronic engineering");
    if (ei !== -1 && ni !== -1) capturedSim = cosine(embeddings[ei], embeddings[ni]);
    return embeddings;
  };
  const t0 = Date.now();
  const parsed = await parseCv(raw);
  if (!parsed.ok) return { fixtureId: FIXTURE_ID, runIndex, error: "parse-cv failed", ms: Date.now() - t0 };
  const candidate = {
    skills: parsed.profile.skills, education: parsed.profile.education,
    totalYearsExperience: parsed.profile.totalYearsExperience, extractedText: raw,
  };
  const score = await scoreApplication(candidate, REQUIREMENTS, { embedTexts: instrumentedEmbed });
  return {
    fixtureId: FIXTURE_ID, runIndex, ms: Date.now() - t0,
    overallScore: score.overallScore, capApplied: score.capApplied,
    breakdown: score.breakdown, instrumentation: score.instrumentation,
    skillsExtracted: parsed.profile.skills, totalYearsExperience: parsed.profile.totalYearsExperience,
    rawFieldSimilarity: capturedSim,
  };
}

const raw = readFileSync("test-fixtures/cvs/08-near-threshold-qualification.txt", "utf8");
console.log(`=== Fixture ${FIXTURE_ID}: running x${RUNS} (sequential, not pooled — so we can see real wall-clock spacing between the embedding calls, not a tight burst) ===`);
const runs = [];
for (let i = 0; i < RUNS; i++) {
  const r = await oneRun(raw, i);
  runs.push(r);
  if (r.error) console.log(`  run ${i}: ERROR — ${r.error}`);
  else {
    console.log(`  run ${i}: score=${r.overallScore} qual=${r.breakdown.qualifications.score}/25 rawFieldSim=${r.rawFieldSimilarity != null ? r.rawFieldSimilarity.toFixed(6) : "NOT CAPTURED"} (${r.ms}ms)`);
  }
}

// Merge into the existing 70-run dataset (fixtures 01-07 untouched, re-run
// nothing else — their variance was already conclusively zero and nothing
// about the engine changed).
const existing = JSON.parse(readFileSync("test-fixtures/ws6-variance-runs.json", "utf8"));
const merged = [...existing.filter((r) => r.fixtureId !== FIXTURE_ID), ...runs];
writeFileSync("test-fixtures/ws6-variance-runs.json", JSON.stringify(merged, null, 2));
console.log(`\nMerged. Total runs in dataset: ${merged.length}`);
