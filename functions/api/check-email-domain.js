// Signup email validation, layer 1 — DNS-over-HTTPS MX/A lookup at
// /api/check-email-domain (same pattern as /api/validate-cv). Catches
// invented/mistyped domains (rushen.lk, gmial.com) before signup. Does NOT
// and cannot prove a specific mailbox exists — that's layer 2 (Firebase email
// verification). The actual lookup logic lives in functions/_lib/email-domain.js,
// so it can be unit-tested in isolation from the CORS/HTTP plumbing here.
//
// Contract:
//   POST { email: string }
//   ->   { deliverable: bool, reason: string, domain: string }

import { checkDomainDeliverable } from "../_lib/email-domain.js";
import { isAllowedOrigin } from "../_lib/cors.js";

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
  if (!isAllowedOrigin(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: origin ? corsHeaders(origin) : {} });
}

export async function onRequestPost({ request }) {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(origin)) {
    return new Response(null, { status: 403 });
  }
  const cors = origin ? corsHeaders(origin) : {};

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400, cors);
  }

  const email = String(body.email || "").trim();
  if (!email || !email.includes("@")) {
    return json({ error: "Missing or malformed 'email'." }, 400, cors);
  }

  const result = await checkDomainDeliverable(email);
  return json(result, 200, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
