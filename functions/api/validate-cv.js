// Hyre — WS3 CV validation gate, as a Cloudflare Pages Function at
// /api/validate-cv (same pattern as /api/screen — Workers AI, no API key).
//
// The client has ALREADY run the cheap checks (length, image-only) before
// ever calling this — this endpoint's only job is the AI classification pass:
// given already-extracted CV text and which of the standard sections the
// client's own heuristic scan found, decide whether this reads like a real
// CV, and if not, say specifically why. The actual model logic lives in
// functions/_lib/cv-ai.js, shared with parse-cv.js — there is exactly one
// implementation of "is this a CV," never a second copy.
//
// Contract:
//   POST { text: string, sectionsFound: string[] }
//   ->   { isCv: bool, confidence: 0..1, reason: string,
//          missingSections: string[], fallback?: true }

import { classifyCv, MODEL } from "../_lib/cv-ai.js";

// Only these origins may call this endpoint. This is the REAL gate — checked
// before any model call runs, not just a response header. CORS headers below
// are the browser-facing half of the same policy (they stop another site's JS
// from reading a response its own browser was ever allowed to receive) — they
// do not by themselves stop a non-browser caller from reaching this code, the
// origin check does that.
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

// Cheap health check — the client pings this on load so a misconfigured or
// undeployed function is visible immediately, not only when a candidate
// actually submits a CV. No AI call, just confirms the binding exists.
export async function onRequestGet({ request, env }) {
  const origin = request.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
  const cors = origin ? corsHeaders(origin) : {};
  const bound = typeof env?.AI?.run === "function";
  return json({ ok: bound, model: MODEL }, bound ? 200 : 503, cors);
}

const MAX_TEXT_CHARS = 6000;

export async function onRequestPost({ request, env }) {
  const origin = request.headers.get("Origin");
  // A present Origin that isn't ours is refused outright — no model call runs.
  // A missing Origin (same-origin requests don't always send one) is allowed.
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return new Response(null, { status: 403 });
  }
  const cors = origin ? corsHeaders(origin) : {};

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const text = String(body.text || "").trim().slice(0, MAX_TEXT_CHARS);
  const sectionsFound = Array.isArray(body.sectionsFound)
    ? body.sectionsFound.filter((s) => typeof s === "string").slice(0, 10)
    : [];
  if (!text) return json({ error: "Missing 'text'." }, 400, cors);

  const result = await classifyCv(env, text, sectionsFound);
  return json(result, 200, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
