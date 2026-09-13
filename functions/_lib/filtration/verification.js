// WS5/5.6 — three outcomes, not two. Checks whether a term the requirement
// engine matched against a candidate's parsed skills[]/education[] is
// actually grounded in the CV's stored extracted text (WS4 keeps the full
// text alongside the structured data for exactly this). A matched skill the
// extraction model hallucinated into the parsed profile is a hiring
// liability, not a rounding error — this is what catches it before it earns
// credit.
//
// This runs on the STORED extracted text (already captured at WS4 parse
// time), never the raw uploaded file — 5.1's "no raw CV text in the scoring
// path" is about not re-scanning the original document, not about ignoring
// the text WS4 already extracted once.
//
// This is the embedding-backed comparison matching.js's layer 3 was REMOVED
// FROM (5.4, 2026-09-12) and this one deliberately was NOT. Same
// infrastructure (cosine, embedUnique, the calibrated threshold), opposite
// purpose and opposite failure mode: layer 3 AWARDS credit for a term the
// candidate may not actually have — a false positive there invents a skill.
// This WITHHOLDS credit for a term already matched from the candidate's own
// stated skills — a false negative here drops a skill the candidate legitimately
// has, just because WS4 phrased it slightly differently than the CV's own
// wording. In a hiring system those are not symmetric risks, and keeping a
// control that protects candidates in order to win a cleaner determinism
// claim would be the wrong trade. See test-fixtures/ws6-results.md 5.4 for
// the full evidence and reasoning.

import { cosine, embedUnique, BORDERLINE_BAND } from "./matching.js";
import { clearsThreshold } from "./thresholds.js";

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary pattern via lookaround, not \b — \b fails at a boundary
 * between two non-word characters (a symbol-heavy term like "C++" followed
 * by a space has no \w-to-\W transition there), which is exactly the case
 * 5.6 calls out by name. Multi-word terms require the words adjacent
 * (flexible whitespace/hyphen only) so "Machine Learning" can never match
 * against scattered occurrences like "...learning to use the machine...". */
function buildSearchPattern(term) {
  let escaped = escapeRegex(term.trim()).replace(/\s+/g, "[\\s-]+");
  // Node.js / NodeJS / node js — same variant family 5.4 layer 1 normalises,
  // extended here to text search: make a trailing ".js" suffix flexible.
  escaped = escaped.replace(/\\\.js$/i, "[.\\s]?js");
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i");
}

/** Naive sentence split that preserves each sentence's offset in the
 * original text, so 'inferred' evidence can report a real position. */
function splitSentences(text) {
  const sentences = [];
  const re = /[^.!?\n]+[.!?\n]*/g;
  let m;
  while ((m = re.exec(text))) {
    const s = m[0].trim();
    if (s) sentences.push({ text: s, offset: m.index });
  }
  return sentences;
}

/**
 * @param {string} term - the matched skill/qualification string to verify
 * @param {string} extractedText - WS4's stored full extracted CV text
 * @param {{ embedTexts: Function, threshold: number }} deps
 * @returns {Promise<{ term: string, status: 'verified'|'inferred'|'unverifiable',
 *   evidence: string|null, offset: number|null, confidence: number,
 *   firedEmbedding: boolean, borderline: boolean }>}
 *   firedEmbedding/borderline are the 5.4 instrumentation, relabeled to track
 *   THIS layer's firing rate now that matching.js's own layer 3 is gone —
 *   never permanently-zero counters left over from a removed feature.
 */
export async function verifyTerm(term, extractedText, { embedTexts, threshold }) {
  const text = String(extractedText || "");
  const t = String(term || "").trim();
  if (!t) return { term: t, status: "unverifiable", evidence: null, offset: null, confidence: 0, firedEmbedding: false, borderline: false };

  const direct = buildSearchPattern(t).exec(text);
  if (direct) {
    return { term: t, status: "verified", evidence: direct[0], offset: direct.index, confidence: 1, firedEmbedding: false, borderline: false };
  }

  const sentences = splitSentences(text);
  if (!sentences.length) {
    return { term: t, status: "unverifiable", evidence: null, offset: null, confidence: 0, firedEmbedding: false, borderline: false };
  }

  const vectors = await embedUnique([t, ...sentences.map((s) => s.text)], embedTexts);
  const termVec = vectors.get(t);
  let best = null;
  if (termVec) {
    for (const s of sentences) {
      const v = vectors.get(s.text);
      if (!v) continue;
      const sim = cosine(termVec, v);
      if (!best || sim > best.similarity) best = { sentence: s, similarity: sim };
    }
  }
  const borderline = !!best && Math.abs(best.similarity - threshold) <= BORDERLINE_BAND;
  if (best && clearsThreshold(best.similarity, threshold)) {
    return { term: t, status: "inferred", evidence: best.sentence.text, offset: best.sentence.offset, confidence: best.similarity, firedEmbedding: true, borderline };
  }
  return { term: t, status: "unverifiable", evidence: null, offset: null, confidence: best ? best.similarity : 0, firedEmbedding: true, borderline };
}

/** Verify a batch of already-matched terms against one CV's extracted text. */
export async function verifyTerms(terms, extractedText, deps) {
  const results = [];
  for (const term of terms) {
    results.push(await verifyTerm(term, extractedText, deps));
  }
  return results;
}
