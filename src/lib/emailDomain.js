// Signup email validation, layer 1 (client side) — asks the Cloudflare Worker
// (functions/api/check-email-domain.js) whether an email's domain can receive
// mail at all (MX, or A as an implicit-MX fallback). Catches invented and
// mistyped domains (rushen.lk, gmial.com) before an account or application is
// created. This is deliberately the WEAK layer — it proves the domain exists,
// never that the specific mailbox does. Never overclaim that in UI copy.
//
// Fails OPEN on every kind of infrastructure failure (bad URL, network error,
// timeout, malformed response): never block a real signup because our own
// Worker or the DNS lookup it makes was slow or briefly down. The one and
// only reject path is an explicit `deliverable: false` from the Worker.
// Fail loudly at import time if a VITE_-prefixed env var resolves to garbage
// (same guard as cv-extract.js's resolveApiBase — kept local here rather than
// shared, since it's a single ~10-line utility and this is the only other
// call site).
function resolveApiBase(envValue, fallbackPath, label) {
  const url = envValue || fallbackPath;
  if (!url || url.includes("undefined") || url.includes("null")) {
    throw new Error(
      `[emailDomain] ${label} resolved to an invalid URL ("${url}"). ` +
      `A VITE_-prefixed env var is likely set to a broken value, or was added ` +
      `to .env.local without restarting the dev server (Vite does not hot-reload env vars).`
    );
  }
  return url;
}

const CHECK_URL = resolveApiBase(
  import.meta.env.VITE_EMAIL_DOMAIN_CHECK_URL,
  "/api/check-email-domain",
  "VITE_EMAIL_DOMAIN_CHECK_URL"
);

const TIMEOUT_MS = 5000;

/**
 * @param {string} email
 * @returns {Promise<{ deliverable: boolean, reason: string }>}
 */
export async function checkEmailDomain(email) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(CHECK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`check-email-domain returned HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data?.deliverable !== "boolean") throw new Error("check-email-domain returned an unexpected shape");
    return data;
  } catch (err) {
    console.error("[emailDomain] check failed, allowing through:", err.message);
    return { deliverable: true, reason: "client-error" };
  } finally {
    clearTimeout(timer);
  }
}
