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

import { scoreVacancyApplications } from "../_lib/filtration-ai.js";
import { requireStaff } from "../_lib/staff-auth.js";
import { isAllowedOrigin } from "../_lib/cors.js";

// 100+ CVs per vacancy is the MVP's stated realistic volume (CLAUDE.md
// section 3) — this cap gives headroom above that while bounding one
// Function invocation's CPU time (5.5).
export const MAX_CANDIDATES = 300;

function reconcile(batchId, results) {
  return { batchId, requested: results.length,
    completed: results.filter(r => r.status === "completed").length,
    failed: results.filter(r => r.status === "failed").length,
    outstanding: results.filter(r => r.status === "outstanding").length, results };
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export async function onRequestOptions({ request }) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: origin ? corsHeaders(origin) : {} });
}

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  const cors = origin ? corsHeaders(origin) : {};
  const denied = await requireStaff(request, env, cors);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "failed", error: "Invalid JSON body" }, 400, cors);
  }

  const candidates = Array.isArray(body?.candidates) ? body.candidates : [];
  const batchId = body?.batchId;
  if (typeof batchId !== "string" || !batchId.trim() || candidates.some(c => !c || typeof c.candidateId !== "string" || !c.candidateId.trim()) ||
      new Set(candidates.map(c => c.candidateId)).size !== candidates.length) {
    return json({ ok: false, error: "A batchId and unique application IDs are required." }, 400, cors);
  }
  const unprocessed = reason => reconcile(batchId, candidates.map(c => ({ applicationId: c.candidateId, status: "outstanding", reason })));
  if (candidates.length > MAX_CANDIDATES) return json({ ok: false, ...unprocessed("batch-too-large"), error: `Maximum ${MAX_CANDIDATES} applications per request.` }, 413, cors);
  const requirements = body.requirements && typeof body.requirements === "object" ? body.requirements : null;
  if (!candidates.length) return json({ ok: false, reason: "failed", error: "No candidates to score." }, 400, cors);
  if (!requirements || !Array.isArray(requirements.requiredSkills) || !requirements.requiredSkills.length) {
    return json({ ok: false, ...unprocessed("no-requirements"), error: "Vacancy has no structured requirements to score against." }, 400, cors);
  }

  try {
    const scored = await scoreVacancyApplications({ candidates, requirements, env });
    const results = scored.map(r => r.status === "scored"
      ? { applicationId: r.candidateId, status: "completed", result: r.result }
      : { applicationId: r.candidateId, status: "failed", error: { code: "SCORING_FAILED", message: r.error, retryable: true } });
    return json({ ok: true, ...reconcile(batchId, results) }, 200, cors);
  } catch (e) {
    console.error("rescore-vacancy:", e);
    return json({ ok: false, ...unprocessed("batch-failed"), error: e.message || "Batch scoring failed." }, 503, cors);
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
