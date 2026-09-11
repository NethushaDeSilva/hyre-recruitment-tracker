// WS5/5.4 — splits a free-text degree title into {level, field}. Degree
// LEVEL is the strict structural rule (5.4: candidate level >= required
// level); degree FIELD is the only part that ever reaches layer-3 embedding
// comparison. Conflating the two — feeding a full title like "BSc Computer
// Science" into a field-similarity check — was WS6.1's first failed
// calibration round: it mostly measured type-equivalence, not field
// equivalence. This module is what keeps that split real at runtime, not
// just in the calibration pairs.
//
// Heuristic, not exhaustive — covers the degree-type vocabulary this project
// actually uses (see normalization-canonicalization-pairs.json for the same
// mappings as calibration reference data). An unrecognised prefix returns
// level: null rather than guessing; 5.4's level check treats null as "cannot
// verify," never as a pass.

const WHOLE_NAME = [
  { re: /^bba$/i, level: 6, field: "Business Administration" },
  { re: /^mba$/i, level: 7, field: "Business Administration" },
  { re: /^llb$/i, level: 6, field: "Law" },
  { re: /^llm$/i, level: 7, field: "Law" },
  { re: /^phd$/i, level: 8, field: null },
];

// Ordered most-specific first — "Doctor of Philosophy in" must be checked
// before a bare "Master of"/"Bachelor of" pattern could ever apply.
const PREFIXED = [
  { re: /^doctor of philosophy in\s+(.+)$/i, level: 8 },
  { re: /^phd\s+(.+)$/i, level: 8 },
  { re: /^master of\s+(.+)$/i, level: 7 },
  { re: /^(?:msc|meng|ma)\s+(.+)$/i, level: 7 },
  { re: /^bachelor of\s+(.+)$/i, level: 6 },
  { re: /^(?:bsc|beng|ba|bbs)\s+(.+)$/i, level: 6 },
];

/**
 * @param {string} raw - e.g. "BSc Computer Science", "MBA", "Doctor of Philosophy in Physics"
 * @returns {{ level: 6|7|8|null, field: string|null, recognised: boolean }}
 */
export function classifyDegree(raw) {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return { level: null, field: null, recognised: false };

  for (const { re, level, field } of WHOLE_NAME) {
    if (re.test(s)) return { level, field, recognised: true };
  }
  for (const { re, level } of PREFIXED) {
    const m = s.match(re);
    if (m) return { level, field: m[1].trim() || null, recognised: true };
  }
  return { level: null, field: null, recognised: false };
}

// Level-only lookup for the current WS4 shape, where the extraction model
// returns awardType and field as two separate, honest facts (never one
// squashed string for the model to lose a field inside of — see cv-ai.js).
// Matches anywhere in the string (not anchored) since awardType can carry
// trailing qualifiers like "(Hons)" that a whole-string match would miss.
const AWARD_LEVEL = [
  { re: /\bphd\b|doctor of philosophy|doctorate/i, level: 8 },
  { re: /\bm\.?sc\b|\bm\.?eng\b|\bm\.?a\b|\bmba\b|\bllm\b|master'?s?\s+(of|degree|in)|master of/i, level: 7 },
  { re: /\bb\.?sc\b|\bb\.?eng\b|\bb\.?a\b|\bbba\b|\bbbs\b|\bllb\b|bachelor'?s?\s+(of|degree|in)|bachelor of/i, level: 6 },
];

/**
 * @param {string} raw - e.g. "BSc (Hons)", "Master of Science", "PhD" — the
 *   qualification TYPE only, never mixed with a field of study (that's a
 *   separate extracted fact — see cv-ai.js's PARSE_SCHEMA).
 * @returns {{ level: 6|7|8|null, recognised: boolean }}
 */
export function classifyAwardType(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return { level: null, recognised: false };
  for (const { re, level } of AWARD_LEVEL) {
    if (re.test(s)) return { level, recognised: true };
  }
  return { level: null, recognised: false };
}
