// WS6.3/5.6 hallucination-control fixture. The unverifiable-terms log in the
// original WS6 run was honestly empty — no fixture had ever exercised
// `inferred` or `unverifiable`, only `verified`. This closes that gap.
//
// First attempt (recorded here, not hidden): built a CV using CLAUDE.md's own
// illustrative example — "Built REST APIs in Express" as a case that
// "legitimately implies Node.js" — and ran it through the REAL, deployed WS4
// extraction endpoint (test-fixtures/cvs/09-hallucination-test.txt). Real
// finding: extraction did NOT add "Node.js" to skills[] — it extracted only
// what's literally stated (Express, PostgreSQL, Redis, REST APIs,
// JavaScript, Git, Jest). The deployed extraction model is conservative, not
// prone to the over-inference CLAUDE.md's example anticipates. That's a real,
// useful result in its own right, but it means the matching stage never
// produces a "Node.js" match for verifyTerm() to check in the first place —
// there's nothing to verify if nothing was ever claimed.
//
// So this script tests WS5.6's ACTUAL control directly: verifyTerm() against
// real embeddings and the real extracted CV text, for terms a matching pass
// WOULD have credited (this is the exact function engine.js calls once a term
// is already matched — testing it here is testing the real mechanism, not a
// mock of it, just without waiting on extraction to hand it a term first).
import { readFileSync } from "node:fs";
import { verifyTerm } from "../functions/_lib/filtration/verification.js";

const ORIGIN = "https://hyre-hiring.pages.dev";
const SKILL_SIMILARITY_THRESHOLD = 0.8803687307862392; // committed, current

async function embedTexts(texts) {
  const res = await fetch(`${ORIGIN}/api/embed`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: texts }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("embed failed: " + JSON.stringify(data));
  return data.embeddings;
}

const extractedText = readFileSync("test-fixtures/cvs/09-hallucination-test.txt", "utf8");

const CASES = [
  { term: "PostgreSQL", why: "control — literally stated, must come back verified" },
  { term: "Node.js", why: "not literally stated; Express + REST API context nearby — the inferred test" },
  { term: "Kubernetes", why: "not literally stated, no container/orchestration context anywhere — the unverifiable test" },
  // Additional inferred attempts — first pass (Node.js via the Express
  // sentence) landed at 0.6826, well short of threshold. Trying several more
  // strongly-implied-but-unstated terms before concluding inferred can't be
  // exercised with a real, honestly-written CV under this threshold.
  { term: "backend web framework", why: "2nd inferred attempt — capability implied by 'Express'" },
  { term: "relational database", why: "3rd inferred attempt — implied by the PostgreSQL sentence's own content" },
  { term: "API testing", why: "4th inferred attempt — implied by 'Wrote unit and integration tests' + REST APIs context" },
  { term: "asynchronous JavaScript", why: "5th inferred attempt — the CV literally says 'use async/await throughout'" },
];

console.log("=== WS5.6 verifyTerm() — real embeddings, real extracted text ===\n");
const results = [];
for (const c of CASES) {
  const r = await verifyTerm(c.term, extractedText, { embedTexts, threshold: SKILL_SIMILARITY_THRESHOLD });
  results.push({ ...c, ...r });
  console.log(`"${c.term}" (${c.why})`);
  console.log(`  -> status=${r.status}  confidence=${r.confidence.toFixed(4)}`);
  console.log(`  -> evidence: ${r.evidence ? JSON.stringify(r.evidence.slice(0, 140)) : "(none)"}\n`);
}

import { writeFileSync } from "node:fs";
writeFileSync("test-fixtures/ws6-hallucination-results.json", JSON.stringify(results, null, 2));
console.log("Saved to test-fixtures/ws6-hallucination-results.json");
