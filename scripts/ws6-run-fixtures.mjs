// WS6 batch 1 — sanity pass: run each of fixtures 1-7 + F1 through the REAL
// deployed pipeline (validate-cv, parse-cv, then score via the real engine +
// real /api/embed) exactly ONCE, and compare against the hand-derived bands.
// No Firestore writes anywhere — this tests the pipeline/algorithm, not a
// real application (respects the no-dummy-data-in-live-Firestore policy).
import { readFileSync, writeFileSync } from "node:fs";
import { checkSections, cheapTextChecks } from "../functions/_lib/cv-ai.js";
import { scoreApplication } from "../functions/_lib/filtration/engine.js";
import { getThresholds } from "../functions/_lib/filtration/thresholds.js";
import { computeTotalYearsExperience } from "../functions/_lib/filtration/computeExperience.js";

const ORIGIN = "https://hyre-hiring.pages.dev";

const REQUIREMENTS = {
  requiredQualification: { level: 6, field: "Computer Science" },
  requiredSkills: ["Node.js", "Docker", "PostgreSQL", "Redis", "Kubernetes", "MongoDB"],
  minYearsExperience: 8,
  niceToHave: ["Terraform", "GraphQL"],
};

const FIXTURES = [
  { id: "01", file: "01-strong-match.txt", band: [95, 100] },
  { id: "02", file: "02-keyword-stuffed.txt", band: [17, 27] },
  { id: "03", file: "03-different-vocabulary.txt", band: [15, 25] },
  { id: "04", file: "04-career-changer.txt", band: [90, 100] },
  { id: "05", file: "05-non-computing-degree.txt", band: [70, 80] },
  { id: "06", file: "06-academic-long.txt", band: [95, 100] },
  { id: "07", file: "07-no-headings-long.txt", band: [83, 93] },
];

async function embedTexts(texts) {
  const res = await fetch(`${ORIGIN}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("embed failed: " + JSON.stringify(data));
  return data.embeddings;
}

async function validateCv(text) {
  const { found } = { found: checkSections(text) };
  const res = await fetch(`${ORIGIN}/api/validate-cv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, sectionsFound: found }),
  });
  const data = await res.json();
  return { ...data, sectionsFound: found, httpStatus: res.status };
}

async function parseCv(text) {
  const res = await fetch(`${ORIGIN}/api/parse-cv`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  return { ...data, httpStatus: res.status };
}

const results = [];

for (const fx of FIXTURES) {
  const raw = readFileSync(`test-fixtures/cvs/${fx.file}`, "utf8");
  console.log(`\n=== Fixture ${fx.id} (${fx.file}, ${raw.length} chars) ===`);

  const heuristic = cheapTextChecks(raw);
  console.log("cheapTextChecks:", heuristic);

  const val = await validateCv(raw);
  console.log("validate-cv:", { isCv: val.isCv, confidence: val.confidence, missingSections: val.missingSections, truncationApplied: val.truncationApplied, fallback: val.fallback });

  const parsed = await parseCv(raw);
  if (!parsed.ok) {
    console.log("parse-cv FAILED:", parsed);
    results.push({ ...fx, error: "parse-cv failed", parsed });
    continue;
  }
  console.log("parsed skills:", parsed.profile.skills);
  console.log("parsed education:", JSON.stringify(parsed.profile.education));
  console.log("parsed totalYearsExperience:", parsed.profile.totalYearsExperience);
  console.log("truncationApplied:", parsed.truncationApplied, parsed.truncationStrategy);

  const candidate = {
    skills: parsed.profile.skills,
    education: parsed.profile.education,
    totalYearsExperience: parsed.profile.totalYearsExperience,
    extractedText: raw,
  };
  const score = await scoreApplication(candidate, REQUIREMENTS, { embedTexts });
  const inBand = score.overallScore >= fx.band[0] && score.overallScore <= fx.band[1];
  console.log(`SCORE: ${score.overallScore} (capApplied=${score.capApplied})  band=[${fx.band}]  ${inBand ? "IN BAND" : "*** OUT OF BAND ***"}`);
  console.log("instrumentation:", JSON.stringify(score.instrumentation));

  results.push({
    ...fx, heuristic, validate: val, parsed: parsed.profile, truncationApplied: parsed.truncationApplied,
    truncationStrategy: parsed.truncationStrategy, score, inBand,
  });
}

writeFileSync("test-fixtures/ws6-batch1-results.json", JSON.stringify(results, null, 2));
console.log("\n\nSaved to test-fixtures/ws6-batch1-results.json");
