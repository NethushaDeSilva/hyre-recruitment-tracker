// Hyre — WS5 batch re-scoring, as a Cloudflare Pages Function at
// /api/rescore-vacancy (same CORS pattern as /api/parse-cv). Scores every
// given candidate against ONE vacancy's requirements in one request, sharing
// filtration-ai.js's cross-candidate embedding cache (5.5).
//
// Called when: requirements were edited (existing scores marked stale by
// updatePosition() in src/data/store.js), the calibrated thresholds changed,
// or ENGINE_VERSION changed — never automatically; HR triggers this
// explicitly from the shortlist screen. The client does the actual Firestore
// writes (applicationScores/{id}) after this returns, same division of
// labour as parse-cv/validate-cv: this route is pure compute.
//
// Contract:
//   POST { candidates: [{candidateId, ...profile}], requirements: object }
//   -> { ok: true, results: [{candidateId, status:"scored"|"failed", result?, error?}] }
//   -> { ok: false, reason: "no-requirements" | "failed", error?: string }

import { scoreVacancyApplications, ScoringError } from "../_lib/filtration-ai.js";

const ALLOWED_ORIGINS = new Set([
  "https://hyre-hiring.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

// 100+ CVs per vacancy is the MVP's stated realistic volume (CLAUDE.md
// section 3) — this cap gives headroom above that while bounding one
// Function invocation's CPU time (5.5).
const MAX_CANDIDATES = 300;

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

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
  const cors = origin ? corsHeaders(origin) : {};

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "failed", error: "Invalid JSON body" }, 400, cors);
  }

  const candidates = Array.isArray(body.candidates) ? body.candidates.slice(0, MAX_CANDIDATES) : [];
  const requirements = body.requirements && typeof body.requirements === "object" ? body.requirements : null;
  if (!candidates.length) return json({ ok: false, reason: "failed", error: "No candidates to score." }, 400, cors);
  if (!requirements || !Array.isArray(requirements.requiredSkills) || !requirements.requiredSkills.length) {
    return json({ ok: false, reason: "no-requirements", error: "Vacancy has no structured requirements to score against." }, 200, cors);
  }

  try {
    const results = await scoreVacancyApplications({ candidates, requirements, env });
    return json({ ok: true, results }, 200, cors);
  } catch (e) {
    if (e instanceof ScoringError) {
      return json({ ok: false, reason: "no-requirements", error: e.message }, 200, cors);
    }
    console.error("rescore-vacancy:", e);
    return json({ ok: false, reason: "failed", error: e.message || "Batch scoring failed." }, 200, cors);
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
