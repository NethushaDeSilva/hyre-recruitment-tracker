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

import { cosine, embedUnique } from "./matching.js";

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
 *   evidence: string|null, offset: number|null, confidence: number }>}
 */
export async function verifyTerm(term, extractedText, { embedTexts, threshold }) {
  const text = String(extractedText || "");
  const t = String(term || "").trim();
  if (!t) return { term: t, status: "unverifiable", evidence: null, offset: null, confidence: 0 };

  const direct = buildSearchPattern(t).exec(text);
  if (direct) {
    return { term: t, status: "verified", evidence: direct[0], offset: direct.index, confidence: 1 };
  }

  const sentences = splitSentences(text);
  if (!sentences.length) {
    return { term: t, status: "unverifiable", evidence: null, offset: null, confidence: 0 };
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
  if (best && best.similarity > threshold) {
    return { term: t, status: "inferred", evidence: best.sentence.text, offset: best.sentence.offset, confidence: best.similarity };
  }
  return { term: t, status: "unverifiable", evidence: null, offset: null, confidence: best ? best.similarity : 0 };
}

/** Verify a batch of already-matched terms against one CV's extracted text. */
export async function verifyTerms(terms, extractedText, deps) {
  const results = [];
  for (const term of terms) {
    results.push(await verifyTerm(term, extractedText, deps));
  }
  return results;
}
