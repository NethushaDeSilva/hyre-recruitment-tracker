// Shared origin allowlist for every Pages Function under functions/api/ — one
// implementation, never a second copy (same principle as cv-ai.js's single
// classifier). This exists because the exact-match version of this check
// broke CV validation in production: every `wrangler pages deploy` prints a
// unique https://<hash>.hyre-hiring.pages.dev URL, and every branch preview
// gets its own https://<branch>.hyre-hiring.pages.dev — neither matches a
// hardcoded Set containing only the bare https://hyre-hiring.pages.dev
// alias. The symptom was silent: the browser's CORS preflight (OPTIONS) got
// a 403 with no Access-Control-Allow-Origin header, so the actual POST never
// even fired — fetch() surfaced it as a generic network error, which the
// client correctly (per WS3/10.1) reports as "we couldn't check your CV
// right now," never as a verdict on the candidate's file. The fix is a
// suffix match against every subdomain of hyre-hiring.pages.dev, not one
// more hardcoded branch name (score-application.js and rescore-vacancy.js
// had already hit this once and been patched with a single extra entry for
// "screening-correctness" — that approach doesn't scale to every future
// preview branch or deploy hash, so it's replaced here, not extended).
const ALLOWED_SUFFIX = ".hyre-hiring.pages.dev";
const ALLOWED_EXACT = new Set([
  "https://hyre-hiring.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

/** True if `origin` may call this endpoint. A missing Origin (same-origin requests don't always send one) is always allowed — this is the REAL gate, checked before any model call runs, not just a response header. */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_EXACT.has(origin)) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.hostname.endsWith(ALLOWED_SUFFIX);
}
