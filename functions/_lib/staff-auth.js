import { createRemoteJWKSet, jwtVerify } from "jose";

const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const STAFF_ROLES = new Set(["HR", "Interviewer", "Management"]);

export class StaffAuthError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function verifyFirebaseToken(token, projectId, keys = googleKeys) {
  if (!projectId) throw new StaffAuthError(503, "Staff authentication is not configured.");
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ["RS256"], audience: projectId, issuer: `https://securetoken.google.com/${projectId}`,
      requiredClaims: ["sub", "iat", "exp", "auth_time"],
    });
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128 ||
      !Number.isFinite(payload.iat) || payload.iat > now || !Number.isFinite(payload.auth_time) || payload.auth_time > now) {
      throw new StaffAuthError(401, "Invalid Firebase ID token.");
    }
    return payload;
  } catch (e) {
    if (e instanceof StaffAuthError) throw e;
    const invalid = ["ERR_JWT_EXPIRED", "ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JWS_INVALID", "ERR_JWT_INVALID", "ERR_JOSE_ALG_NOT_ALLOWED", "ERR_JWKS_NO_MATCHING_KEY"].includes(e.code);
    throw new StaffAuthError(invalid ? 401 : 503, invalid ? "Invalid or expired Firebase ID token." : "Token verification is temporarily unavailable.");
  }
}

export async function authorizeStaff(request, env, { verify = verifyFirebaseToken, fetcher = fetch } = {}) {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("Authorization") || "");
  if (!match) throw new StaffAuthError(401, "A Firebase ID token is required.");
  const projectId = env.FIREBASE_PROJECT_ID;
  const claims = await verify(match[1], projectId);
  let response;
  try {
    response = await fetcher(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/users/${encodeURIComponent(claims.sub)}`, {
      headers: { Authorization: `Bearer ${match[1]}` }, signal: AbortSignal.timeout(10000),
    });
  } catch { throw new StaffAuthError(503, "Staff authorization is temporarily unavailable."); }
  if (response.status === 401) throw new StaffAuthError(401, "Firebase authentication was rejected.");
  if ([403, 404].includes(response.status)) throw new StaffAuthError(403, "Staff access is required.");
  if (!response.ok) throw new StaffAuthError(503, "Staff authorization is temporarily unavailable.");
  let profile;
  try { profile = await response.json(); } catch { throw new StaffAuthError(503, "Invalid staff authorization response."); }
  const role = profile.fields?.role?.stringValue;
  if (!STAFF_ROLES.has(role)) throw new StaffAuthError(403, "Staff access is required.");
  return { uid: claims.sub, role };
}

export async function requireStaff(request, env, headers) {
  try { await authorizeStaff(request, env); return null; }
  catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof StaffAuthError ? e.message : "Staff authorization failed." }), {
      status: e instanceof StaffAuthError ? e.status : 503,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
}
