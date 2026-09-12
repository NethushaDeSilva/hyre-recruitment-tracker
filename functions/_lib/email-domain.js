// Signup email validation, layer 1 (see CLAUDE.md) — a DNS-over-HTTPS MX/A
// lookup on the domain half of an email address. This is deliberately the
// weaker, cheap layer: it proves the DOMAIN can receive mail, never that the
// specific mailbox exists (no API can prove that without sending to it, and
// SMTP verification is blocked by every major provider). Layer 2 (Firebase
// email verification) is the only real proof; this just catches invented and
// mistyped domains (rushen.lk, gmial.com) before they ever reach layer 2.
//
// Uses Cloudflare's own DNS-over-HTTPS resolver — free, no API key, no
// third-party "email validation" service (we are free-tier only and those
// services can't give certainty either).
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const DOH_TIMEOUT_MS = 4000;

async function dohQuery(name, type) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOH_TIMEOUT_MS);
  try {
    const res = await fetch(`${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`, {
      headers: { accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`DoH HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// A record type present in the Answer section (Cloudflare's JSON API returns
// numeric DNS types: 15 = MX, 1 = A).
const hasRecordType = (dohResult, type) =>
  Array.isArray(dohResult?.Answer) && dohResult.Answer.some((a) => a.type === type);

/**
 * @param {string} email
 * @returns {Promise<{ deliverable: boolean, reason: string, domain: string }>}
 *   deliverable=false ONLY when both MX and A lookups succeeded and neither
 *   found a record ("this domain cannot receive mail"). Every other outcome
 *   — malformed input aside — fails OPEN (deliverable=true): never block a
 *   real signup because DNS was slow or errored (10.1's "never resolve in
 *   the permissive direction" is about our OWN infra failing a user, not
 *   about a third party's DNS — the permissive direction here is BLOCKING
 *   nothing, since we have no way to distinguish "our DoH call broke" from
 *   "a real but unusual domain", and a false reject is worse than a missed
 *   catch this layer was never guaranteed to make anyway).
 */
export async function checkDomainDeliverable(email) {
  const at = String(email || "").lastIndexOf("@");
  const domain = at >= 0 ? String(email).slice(at + 1).trim().toLowerCase() : "";
  if (!domain || !domain.includes(".")) {
    return { deliverable: true, reason: "invalid-domain-skip", domain };
  }

  let mx, a;
  try {
    mx = await dohQuery(domain, "MX");
  } catch (e) {
    console.error("email-domain: MX lookup failed:", domain, e.message);
    return { deliverable: true, reason: "dns-error", domain };
  }
  if (hasRecordType(mx, 15)) {
    return { deliverable: true, reason: "has-mx", domain };
  }

  try {
    a = await dohQuery(domain, "A");
  } catch (e) {
    console.error("email-domain: A lookup failed:", domain, e.message);
    return { deliverable: true, reason: "dns-error", domain };
  }
  if (hasRecordType(a, 1)) {
    return { deliverable: true, reason: "has-a-fallback", domain };
  }

  console.error("email-domain: no MX and no A record, rejecting:", domain);
  return { deliverable: false, reason: "no-mx-no-a", domain };
}
