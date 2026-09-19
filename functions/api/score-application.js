// Hyre — WS5 scoring, as a Cloudflare Pages Function at /api/score-application
// (same CORS pattern as /api/parse-cv). Scores ONE application against ONE
// vacancy's requirements, via filtration-ai.js's orchestration layer.
//
// Called automatically by the client right after WS4 parsing succeeds — the
// candidate never clicks anything to trigger this; it's the last link in the
// validate -> parse -> score chain that already runs on every apply.
//
// RELIABILITY CONTRACT (10.1): a scoring failure is never a zero and never
// silent. Two distinct failure shapes:
//   - no structured requirements on the vacancy -> { ok:false, reason:"no-requirements" }
//     (block scoring with a clear message telling HR to complete the vacancy)
//   - anything else (embedding call failed, malformed candidate, etc.)
//     -> { ok:false, reason:"failed", error }
//     ("not scored — retry" in the UI, never a fabricated score)
//
// Contract:
//   POST { candidate: object, requirements: object }
//   -> { ok: true, result: {overallScore, capApplied, breakdown, meta, instrumentation} }
//   -> { ok: false, reason: "no-requirements" | "failed", error?: string }

import { scoreOneApplication, ScoringError } from "../_lib/filtration-ai.js";
import { requireStaff } from "../_lib/staff-auth.js";
import { isAllowedOrigin } from "../_lib/cors.js";

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

  const candidate = body.candidate && typeof body.candidate === "object" ? body.candidate : null;
  const requirements = body.requirements && typeof body.requirements === "object" ? body.requirements : null;
  if (!candidate) return json({ ok: false, reason: "failed", error: "Missing 'candidate'." }, 400, cors);

  try {
    const result = await scoreOneApplication({ candidate, requirements, env });
    return json({ ok: true, result }, 200, cors);
  } catch (e) {
    if (e instanceof ScoringError) {
      return json({ ok: false, reason: "no-requirements", error: e.message }, 200, cors);
    }
    console.error("score-application:", e);
    return json({ ok: false, reason: "failed", error: e.message || "Scoring failed." }, 200, cors);
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
