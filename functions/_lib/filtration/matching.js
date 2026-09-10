// WS5/5.4 — layers 1 and 3 of equivalence matching. Layer 2 (canonicalisation
// at extraction) is NOT implemented here on purpose: it runs upstream, once,
// when a CV is parsed (WS4) or a vacancy's requiredSkills is saved, and by
// the time a CandidateProfile/Requirements pair reaches this module both
// sides are assumed already canonical. That means what layer 1 checks as a
// plain exact match already IS the layer-2 match (5.4: "layer 2 is not a
// runtime step"). Until WS4's extraction prompt actually does that
// canonicalisation, an un-normalised abbreviation on either side falls
// through to layer 3 like any other non-identical term — no silent layer-2
// behaviour is assumed here that the rest of the pipeline doesn't provide yet.
//
// Every comparison that reaches layer 3 is instrumented: which layer
// produced the outcome (normalisation | embedding | none), and whether the
// embedding similarity landed inside the BORDERLINE band around the
// threshold — the band that's actually exposed to the embedding
// non-reproducibility measured in 6.4.

import { clearsThreshold } from "./thresholds.js";

// Symbol-heavy terms 5.6 calls out explicitly — punctuation inside these is
// meaningful (C vs C++ vs C# are different languages) and must never be
// stripped by generic normalisation the way ".js" suffixes are.
const PROTECTED_TERMS = new Set(["c", "c++", "c#", ".net", "f#", "r", "go"]);

// Sized from measurement, not guessed: WS6.1 re-ran the qualifications
// calibration on an unchanged pair set and the threshold moved 0.8701 ->
// 0.8782, a shift of 0.0081 (6.4). A comparison landing within this band of
// the threshold is exactly the kind that measurement showed can flip between
// runs with no change to the underlying CV or vacancy. 0.01 rounds that
// observed shift up slightly rather than under-covering it.
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
 * lookup by the original string. */
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
 * Layer 1 first (free); only terms with no normalised match fall through to
 * layer 3 (embedding), and only candidate terms that never won a layer-1
 * match for anything need embedding either — 5.5's "28 embeddings, not 160
 * comparisons" economics.
 *
 * @returns {Promise<{
 *   matched: Array<{required: string, found: string, layer: 'normalisation'|'embedding', similarity: number}>,
 *   missing: string[],
 *   counters: { normalisation: number, embedding: number, none: number, borderline: number }
 * }>}
 */
export async function matchTermSet(requiredTerms, candidateTerms, { embedTexts, threshold }) {
  const required = [...new Set((requiredTerms || []).filter(Boolean))];
  const candidates = [...new Set((candidateTerms || []).filter(Boolean))];
  const normCandidates = candidates.map((c) => ({ raw: c, norm: normalizeTerm(c) }));

  const matched = [];
  const missing = [];
  const counters = { normalisation: 0, embedding: 0, none: 0, borderline: 0 };
  const remaining = []; // required terms that need layer 3

  for (const req of required) {
    const reqNorm = normalizeTerm(req);
    const hit = normCandidates.find((c) => c.norm === reqNorm);
    if (hit) {
      matched.push({ required: req, found: hit.raw, layer: "normalisation", similarity: 1 });
      counters.normalisation++;
    } else {
      remaining.push(req);
    }
  }

  if (remaining.length) {
    const vectors = await embedUnique([...remaining, ...candidates], embedTexts);
    for (const req of remaining) {
      const reqVec = vectors.get(req);
      let best = null;
      for (const cand of candidates) {
        const candVec = vectors.get(cand);
        if (!reqVec || !candVec) continue;
        const sim = cosine(reqVec, candVec);
        if (!best || sim > best.similarity) best = { candidate: cand, similarity: sim };
      }
      if (best && Math.abs(best.similarity - threshold) <= BORDERLINE_BAND) counters.borderline++;
      if (best && clearsThreshold(best.similarity, threshold)) {
        matched.push({ required: req, found: best.candidate, layer: "embedding", similarity: best.similarity });
        counters.embedding++;
      } else {
        missing.push(req);
        counters.none++;
      }
    }
  }

  return { matched, missing, counters };
}
