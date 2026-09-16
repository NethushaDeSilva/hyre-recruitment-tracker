// WS5/5.4 — term matching. Layer 3 (embedding equivalence) was REMOVED here
// 2026-09-12, a decision recorded in full in test-fixtures/ws6-results.md
// (5.4): across every real measurement taken (calibration, real fixtures, a
// deliberately near-threshold fixture, a deliberately adversarial
// hallucination fixture), the embedding layer never once credited a genuine
// match, and the threshold that would govern it turned out to have been
// miscalibrated by a pair (Angular/AngularJS) layer 3 could never actually
// evaluate. Matching is now layer 1 (normalisation) plus exact match, full
// stop. `cosine`/`embedUnique`/`BORDERLINE_BAND` stay here and stay
// exported: verification.js's verifyTerm() (5.6) still does its own,
// separate embedding-backed comparison — a different purpose (grounding a
// claim already matched, not deciding whether two different terms mean the
// same thing) with the opposite failure mode (withholding credit a
// candidate has earned, not awarding credit they haven't) — and that one was
// deliberately kept. See verification.js's header for why.
//
// Layer 2 (canonicalisation at extraction) is NOT implemented here on
// purpose: it runs upstream, once, when a CV is parsed (WS4) or a vacancy's
// requiredSkills is saved, and by the time a CandidateProfile/Requirements
// pair reaches this module both sides are assumed already canonical. That
// means what layer 1 checks as a plain exact match already IS the layer-2
// match (5.4: "layer 2 is not a runtime step").

// Symbol-heavy terms 5.6 calls out explicitly — punctuation inside these is
// meaningful (C vs C++ vs C# are different languages) and must never be
// stripped by generic normalisation the way ".js" suffixes are.
const PROTECTED_TERMS = new Set(["c", "c++", "c#", ".net", "f#", "r", "go"]);

// Sized from measurement, not guessed: WS6.1 re-ran the qualifications
// calibration on an unchanged pair set and the threshold moved 0.8701 ->
// 0.8782, a shift of 0.0081 (6.4). A comparison landing within this band of
// a threshold is exactly the kind that measurement showed can flip between
// runs with no change to the underlying CV or vacancy. 0.01 rounds that
// observed shift up slightly rather than under-covering it. Used by
// verification.js's verifyTerm() — matching.js's own layer 3 (the other,
// removed consumer of this band) is gone.
export const BORDERLINE_BAND = 0.01;

/** Lowercase, trim, collapse whitespace, strip a trailing .js/js suffix and a
 * trailing space-separated version number — the specific variants 5.4/5.6
 * name (Node.js/NodeJS/node js, Python 3/Python). Protected symbol-heavy
 * terms (C++, C#, .NET, F#, C, R, Go) pass through untouched beyond
 * lowercase+trim, since stripping their punctuation would merge distinct
 * languages. */
export function normalizeTerm(raw) {
  const trimmed = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!trimmed) return "";
  if (PROTECTED_TERMS.has(trimmed)) return trimmed;

  // AngularJS is a different framework from Angular. Preserve its identity
  // BEFORE generic suffix stripping loses the distinction, including versions.
  if (/^angular[.\s]*js(?:\s*v?\d+(?:\.\d+)*)?$/.test(trimmed)) return "angularjs";

  let s = trimmed;
  // Trailing .js / " js" / "js" suffix, only when something precedes it —
  // never strip a bare "js" down to nothing (that's the abbreviation "JS",
  // a layer-2 concern, not layer 1).
  const jsMatch = s.match(/^(.+?)[\s.]*js$/);
  if (jsMatch && jsMatch[1].trim()) s = jsMatch[1].trim();

  // Trailing space-separated version number: "Python 3", "Angular 15".
  s = s.replace(/\s+\d+(?:\.\d+)*$/, "");

  return s.trim();
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Embed every unique string across BOTH lists exactly once (5.5), return a
 * lookup by the original string. Still used by verification.js. */
export async function embedUnique(strings, embedTexts) {
  const unique = [...new Set(strings.filter(Boolean))];
  if (!unique.length) return new Map();
  const vectors = await embedTexts(unique);
  const map = new Map();
  unique.forEach((s, i) => map.set(s, vectors[i]));
  return map;
}

/**
 * Match one list of required terms against one list of candidate terms.
 * Normalisation only (layer 1) — a required term matches if some candidate
 * term normalises to the same string. Nothing here calls an embedding model;
 * this function is a pure, synchronous, deterministic string comparison.
 *
 * @returns {{
 *   matched: Array<{required: string, found: string}>,
 *   missing: string[]
 * }}
 */
export function matchTermSet(requiredTerms, candidateTerms) {
  const required = [...new Set((requiredTerms || []).filter(Boolean))];
  const candidates = [...new Set((candidateTerms || []).filter(Boolean))];
  const normCandidates = candidates.map((c) => ({ raw: c, norm: normalizeTerm(c) }));

  const matched = [];
  const missing = [];

  for (const req of required) {
    const reqNorm = normalizeTerm(req);
    const hit = normCandidates.find((c) => c.norm === reqNorm);
    if (hit) {
      matched.push({ required: req, found: hit.raw });
    } else {
      missing.push(req);
    }
  }

  return { matched, missing };
}
