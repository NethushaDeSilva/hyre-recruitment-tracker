// WS6.4/6.5/5.4 — run the FULL pipeline (parse-cv -> score) 10 times per
// fixture against the real deployed Functions (no cache/gateway exists in
// this project to bypass — confirmed via wrangler.toml, a direct [ai]
// binding only — so every call here is already a fresh, uncached inference).
// No Firestore writes. Collects everything needed for:
//   6.4 end-to-end score variance (stdev across 10 runs, per fixture)
//   6.5 rank stability (per-candidate rank stdev + Spearman's rho)
//   5.4 embedding layer firing rate (normalisation/embedding/none/borderline)
import { readFileSync, writeFileSync } from "node:fs";
import { scoreApplication } from "../functions/_lib/filtration/engine.js";

const ORIGIN = "https://hyre-hiring.pages.dev";
const RUNS = 10;

const REQUIREMENTS = {
  requiredQualification: { level: 6, field: "Computer Science" },
  requiredSkills: ["Node.js", "Docker", "PostgreSQL", "Redis", "Kubernetes", "MongoDB"],
  minYearsExperience: 8,
  niceToHave: ["Terraform", "GraphQL"],
};

const FIXTURE_IDS = ["01", "02", "03", "04", "05", "06", "07"];
const FILES = {
  "01": "01-strong-match.txt", "02": "02-keyword-stuffed.txt", "03": "03-different-vocabulary.txt",
  "04": "04-career-changer.txt", "05": "05-non-computing-degree.txt", "06": "06-academic-long.txt",
  "07": "07-no-headings-long.txt",
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

async function oneRun(fixtureId, raw, runIndex) {
  const t0 = Date.now();
  const parsed = await parseCv(raw);
  if (!parsed.ok) return { fixtureId, runIndex, error: "parse-cv failed", ms: Date.now() - t0 };
  const candidate = {
    skills: parsed.profile.skills, education: parsed.profile.education,
    totalYearsExperience: parsed.profile.totalYearsExperience, extractedText: raw,
  };
  const score = await scoreApplication(candidate, REQUIREMENTS, { embedTexts });
  return {
    fixtureId, runIndex, ms: Date.now() - t0,
    overallScore: score.overallScore, capApplied: score.capApplied,
    breakdown: score.breakdown, instrumentation: score.instrumentation,
    skillsExtracted: parsed.profile.skills, totalYearsExperience: parsed.profile.totalYearsExperience,
  };
}

// small concurrency pool — don't hammer the Worker, don't wait forever either
async function pool(tasks, limit) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const allRuns = [];
for (const id of FIXTURE_IDS) {
  const raw = readFileSync(`test-fixtures/cvs/${FILES[id]}`, "utf8");
  console.log(`\n=== Fixture ${id}: running x${RUNS} ===`);
  const tasks = Array.from({ length: RUNS }, (_, i) => () => oneRun(id, raw, i));
  const runs = await pool(tasks, 3);
  for (const r of runs) {
    if (r.error) console.log(`  run ${r.runIndex}: ERROR — ${r.error}`);
    else console.log(`  run ${r.runIndex}: score=${r.overallScore} cap=${r.capApplied} (${r.ms}ms) layers=${JSON.stringify(r.instrumentation.layers)} borderline=${r.instrumentation.borderline}`);
  }
  allRuns.push(...runs);
}

writeFileSync("test-fixtures/ws6-variance-runs.json", JSON.stringify(allRuns, null, 2));
console.log("\n\nSaved", allRuns.length, "runs to test-fixtures/ws6-variance-runs.json");
