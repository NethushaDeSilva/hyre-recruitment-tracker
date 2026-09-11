// Hyre — shared Workers AI CV logic (WS3 classification + WS4 extraction).
// A leading underscore keeps this out of Cloudflare Pages' routing (only a
// plain module other functions import from, never a route itself).
//
// Both validate-cv.js (WS3) and parse-cv.js (WS4) — called from
// src/lib/cv-extract.js after the client extracts a file's text — call these
// SAME functions, so there is exactly one implementation of "is this a CV"
// and "what does this CV say," never a second copy that can quietly drift
// from the first.

export const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MODEL_TIMEOUT_MS = 15000;

// Keep in sync with SECTION_MARKERS in src/lib/cv-extract.js — the two run
// independently (client heuristic vs. this shared server-side one) but should
// agree on what "the standard CV sections" are.
export const ALL_SECTIONS = ["work experience", "education", "skills", "work history", "contact details"];
const SECTION_MARKERS = [
  { key: "work experience", re: /\b(work experience|professional experience|employment history|career history)\b/i },
  { key: "education", re: /\beducation\b/i },
  { key: "skills", re: /\bskills\b/i },
  { key: "work history", re: /\bwork history\b/i },
  { key: "contact details", re: /[^\s@]+@[^\s@]+\.[^\s@]+/ },
];

export const MIN_CHARS = 200;
export const MAX_CHARS = 20000;

/** Same section heuristic as cv-extract.js's client-side checkSections(). */
export function checkSections(text) {
  const found = [];
  for (const { key, re } of SECTION_MARKERS) if (re.test(text)) found.push(key);
  return found;
}

/** Same cheap length thresholds WS3 applies before ever calling the model. */
export function cheapTextChecks(text) {
  if (text.length < MIN_CHARS) return { ok: false, stage: "too-short", reason: "This file has very little text to check." };
  if (text.length > MAX_CHARS) return { ok: false, stage: "too-long", reason: "This file has an unusual amount of text for a CV." };
  return { ok: true };
}

const CLASSIFY_SCHEMA = {
  type: "json_schema",
  json_schema: {
    type: "object",
    properties: {
      isCv: { type: "boolean" },
      confidence: { type: "number" },
      reason: { type: "string" },
      missingSections: { type: "array", items: { type: "string" } },
    },
    required: ["isCv", "confidence", "reason", "missingSections"],
  },
};

const PARSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    type: "object",
    properties: {
      fullName: { type: "string" },
      email: { type: "string" },
      phone: { type: "string" },
      location: { type: "string" },
      education: {
        type: "array",
        items: {
          type: "object",
          // Split into TWO separate facts, not one combined "degree" string.
          // Squashing "BSc (Hons) Computer Science" into one string left the
          // model free to drop the field of study when it templated the
          // award-type portion — a real bug, not a hypothetical one (a
          // candidate scored 0/25 on a degree they held, because our parser
          // silently lost "Computer Science" from the string). awardType and
          // field are now two independently-required schema slots, so there
          // is no longer a single string for either to get lost inside of.
          properties: {
            awardType: { type: "string" }, // e.g. "BSc (Hons)", "Master of Science", "PhD" — never the field of study
            field: { type: "string" },     // e.g. "Computer Science" — empty string if the CV genuinely states none
            institution: { type: "string" },
            year: { type: "string" },
          },
          required: ["awardType", "field", "institution", "year"],
        },
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" }, company: { type: "string" },
            startDate: { type: "string" }, endDate: { type: "string" }, summary: { type: "string" },
          },
          required: ["title", "company", "startDate", "endDate", "summary"],
        },
      },
      skills: { type: "array", items: { type: "string" } },
      certifications: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
    },
    required: [
      "fullName", "email", "phone", "location", "education", "experience",
      "skills", "certifications", "languages",
    ],
  },
};

/**
 * WS3 — is this text a real CV? Tries the model, retries once, and falls back
 * to a deterministic section-count verdict if the model can't be reached —
 * a model hiccup must never block a valid candidate. Returns
 * { isCv, confidence, reason, missingSections, fallback }.
 */
export async function classifyCv(env, text, sectionsFound) {
  const system =
    "You are screening whether a document is a genuine CV/resume, for a hiring platform. " +
    "Judge from the text given: does it contain real work experience, education, skills, or " +
    "career history for one specific person? A CV in any language counts. An invoice, contract, " +
    "blank page, essay, or unrelated document does not. " +
    "Respond with STRICT JSON only matching the given schema — no prose, no markdown.";
  const user =
    `Text extracted from the uploaded file:\n"""\n${text}\n"""\n\n` +
    `Our own quick scan already found these sections present: ${sectionsFound.length ? sectionsFound.join(", ") : "none"}.\n\n` +
    `Decide: isCv (true/false), confidence (0 to 1), a one-sentence reason, and missingSections — ` +
    `which of these standard CV sections you could NOT find evidence of: ${ALL_SECTIONS.join(", ")}.`;
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];

  let result = await tryModel(env, messages, CLASSIFY_SCHEMA, 400, normalizeClassify);
  if (!result) result = await tryModel(env, messages, CLASSIFY_SCHEMA, 400, normalizeClassify);
  let fallback = false;
  if (!result) { result = heuristicFallback(sectionsFound); fallback = true; }
  return { ...result, fallback };
}

/**
 * WS4 — extract a structured profile from CV text. Never invents data: a
 * missing field comes back as "" / 0 / an empty array. Returns the profile
 * object, or null if the model couldn't be reached after one retry (the
 * caller leaves the candidate's profile unparsed rather than ever guessing).
 */
export async function parseCvProfile(env, text) {
  const system =
    "You extract structured profile data from CV/resume text for a hiring platform. " +
    "Extract ONLY what is actually written — never invent, guess, or embellish a qualification, " +
    "job title, employer, or skill that isn't clearly stated. If a field isn't present in the " +
    "text, use an empty string (or 0 for the numeric field, or an empty array). " +
    "Respond with STRICT JSON only matching the given schema — no prose, no markdown.";
  const user =
    `CV text:\n"""\n${text}\n"""\n\n` +
    "Extract: fullName, email, phone, location, " +
    "education (per entry: awardType — the qualification TYPE only, e.g. \"BSc (Hons)\", " +
    "\"Master of Science\", \"Higher National Diploma\", \"PhD\" — and field — the subject or " +
    "field of study, e.g. \"Computer Science\", kept SEPARATE from awardType even when the CV " +
    "states them together as one phrase like \"BSc (Hons) Computer Science\". " +
    "Use an empty string for field ONLY if the CV genuinely does not state a field of study " +
    "for that qualification (e.g. an MBA or a PhD with no named field) — never omit or merge it " +
    "into awardType instead; also institution/year per entry), " +
    "experience (title/company/startDate/endDate/summary per entry, most recent first — " +
    "startDate/endDate as written, e.g. \"2019-03\", \"March 2019\", or \"Present\" if ongoing; " +
    "do not calculate durations yourself), skills, certifications, languages.";
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];

  let result = await tryModel(env, messages, PARSE_SCHEMA, 1400, normalizeParse);
  if (!result) result = await tryModel(env, messages, PARSE_SCHEMA, 1400, normalizeParse);
  return result;
}

async function tryModel(env, messages, schema, maxTokens, normalizeFn) {
  try {
    const ai = await withTimeout(
      env.AI.run(MODEL, { messages, max_tokens: maxTokens, temperature: 0.1, response_format: schema }),
      MODEL_TIMEOUT_MS
    );
    const raw = (ai && (ai.response ?? ai.result?.response)) ?? "";
    const obj = raw && typeof raw === "object" ? raw : extractJson(raw);
    if (!obj || typeof obj !== "object") return null;
    return normalizeFn(obj);
  } catch {
    return null;
  }
}

function normalizeClassify(obj) {
  if (typeof obj.isCv !== "boolean" || typeof obj.confidence !== "number") return null;
  return {
    isCv: !!obj.isCv,
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0)),
    reason: String(obj.reason || "").slice(0, 400),
    missingSections: Array.isArray(obj.missingSections)
      ? obj.missingSections.filter((s) => typeof s === "string").slice(0, 10)
      : [],
  };
}

const str = (v) => (typeof v === "string" ? v.trim() : "");
const nullableStr = (v) => { const s = str(v); return s ? s : null; };

function normalizeParse(obj) {
  const education = Array.isArray(obj.education) ? obj.education.slice(0, 20) : [];
  const experience = Array.isArray(obj.experience) ? obj.experience.slice(0, 20) : [];
  return {
    fullName: str(obj.fullName),
    email: str(obj.email),
    phone: str(obj.phone),
    location: nullableStr(obj.location),
    education: education.map((e) => ({
      awardType: str(e?.awardType), field: nullableStr(e?.field), institution: str(e?.institution), year: nullableStr(e?.year),
    })).filter((e) => e.awardType || e.institution),
    experience: experience.map((e) => ({
      title: str(e?.title), company: str(e?.company),
      startDate: nullableStr(e?.startDate), endDate: nullableStr(e?.endDate), summary: str(e?.summary),
    })).filter((e) => e.title || e.company),
    skills: Array.isArray(obj.skills) ? obj.skills.filter((s) => typeof s === "string" && s.trim()).slice(0, 40) : [],
    certifications: Array.isArray(obj.certifications) ? obj.certifications.filter((s) => typeof s === "string" && s.trim()).slice(0, 20) : [],
    languages: Array.isArray(obj.languages) ? obj.languages.filter((s) => typeof s === "string" && s.trim()).slice(0, 20) : [],
  };
}

// Deterministic stand-in when the model can't be reached or won't parse — a
// hiccup on our end must never block a valid candidate. Confidence is derived
// purely from how many of the standard sections the caller's own scan found.
function heuristicFallback(sectionsFound) {
  const total = ALL_SECTIONS.length;
  const found = sectionsFound.filter((s) => ALL_SECTIONS.includes(s));
  const missingSections = ALL_SECTIONS.filter((s) => !found.includes(s));
  const confidence = Math.max(0.05, Math.min(0.95, found.length / total));
  return {
    isCv: found.length >= 3,
    confidence,
    reason: found.length >= 3
      ? `Found ${found.length} of ${total} typical CV sections.`
      : `Only found ${found.length} of ${total} typical CV sections.`,
    missingSections,
  };
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("model-timeout")), ms))]);
}

function extractJson(text) {
  const s = String(text).trim();
  try { return JSON.parse(s); } catch {}
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}
