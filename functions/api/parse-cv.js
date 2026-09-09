// Hyre — WS4 CV parsing/extraction, as a Cloudflare Pages Function at
// /api/parse-cv (same pattern as /api/validate-cv — Workers AI, no API key).
//
// Runs AFTER a CV has already passed WS3 validation. Takes the SAME extracted
// text the client already pulled out of the file for validation (no second
// extraction pass) and turns it into the strict candidate-profile schema from
// CLAUDE.md WS4. The candidate never types this — this fills their profile in.
// The actual model logic lives in functions/_lib/cv-ai.js, shared with
// validate-cv.js — no separate code path.
//
// RELIABILITY CONTRACT: never invent data. Missing field -> "" / null / empty
// array, never a fabricated qualification. If the model call fails twice, the
// caller gets ok:false and the candidate's profile simply stays unparsed —
// never a guess passed off as fact.
//
// 5.10: the model extracts experience[] date ranges only — it never computes
// totalYearsExperience itself (arithmetic over dates, overlaps and gaps is
// exactly where small models fail quietly). This route computes it in JS via
// the pure function in _lib/filtration/, and is the one place under this
// route allowed to read the clock — computeTotalYearsExperience() itself
// never does.
//
// Contract:
//   POST { text: string }
//   -> { ok: true, profile: { fullName, email, phone, location, education[],
//                              experience[], totalYearsExperience, skills[],
//                              certifications[], languages[] } }
//   -> { ok: false } on repeated model failure

import { parseCvProfile, MODEL } from "../_lib/cv-ai.js";
import { computeTotalYearsExperience } from "../_lib/filtration/computeExperience.js";

const MAX_TEXT_CHARS = 6000;

const ALLOWED_ORIGINS = new Set([
  "https://hyre-hiring.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: origin ? corsHeaders(origin) : {} });
}

export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
  const cors = origin ? corsHeaders(origin) : {};
  const bound = typeof env?.AI?.run === "function";
  return json({ ok: bound, model: MODEL }, bound ? 200 : 503, cors);
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
  const cors = origin ? corsHeaders(origin) : {};

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400, cors);
  }

  const text = String(body.text || "").trim().slice(0, MAX_TEXT_CHARS);
  if (!text) return json({ ok: false, error: "Missing 'text'." }, 400, cors);

  const profile = await parseCvProfile(env, text);
  if (!profile) return json({ ok: false }, 200, cors); // caller leaves the profile unparsed — never a guess

  const totalYearsExperience = computeTotalYearsExperience(profile.experience, new Date());

  return json({ ok: true, profile: { ...profile, totalYearsExperience } }, 200, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
