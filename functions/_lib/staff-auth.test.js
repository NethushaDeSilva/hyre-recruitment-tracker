import { it, expect, beforeAll } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { verifyFirebaseToken, authorizeStaff } from "./staff-auth.js";

let keys;
beforeAll(async () => { keys = await generateKeyPair("RS256"); });
async function token(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: "staff-1", aud: "project", iss: "https://securetoken.google.com/project", iat: now, auth_time: now, exp: now + 3600, ...overrides })
    .setProtectedHeader({ alg: "RS256", kid: "test" }).sign(keys.privateKey);
}
it("verifies a genuinely signed Firebase-shaped ID token", async () => {
  expect((await verifyFirebaseToken(await token(), "project", keys.publicKey)).sub).toBe("staff-1");
});
it.each([{ aud: "other" }, { iss: "other" }, { exp: 1 }, { sub: "" }, { auth_time: 9999999999 }])("rejects invalid claims %j", async overrides => {
  await expect(verifyFirebaseToken(await token(overrides), "project", keys.publicKey)).rejects.toMatchObject({ status: 401 });
});
it("rejects an invalid signature", async () => {
  const other = await generateKeyPair("RS256");
  await expect(verifyFirebaseToken(await token(), "project", other.publicKey)).rejects.toMatchObject({ status: 401 });
});
const request = new Request("https://example.test", { headers: { Authorization: "Bearer token" } });
const verify = async () => ({ sub: "staff-1" });
it.each(["HR", "Interviewer", "Management"])("allows current stored staff role %s", async role => {
  const result = await authorizeStaff(request, { FIREBASE_PROJECT_ID: "project" }, { verify, fetcher: async () => Response.json({ fields: { role: { stringValue: role } } }) });
  expect(result.role).toBe(role);
});
it("rejects candidates, absent tokens and role lookup outages", async () => {
  await expect(authorizeStaff(new Request("https://example.test"), {})).rejects.toMatchObject({ status: 401 });
  await expect(authorizeStaff(request, { FIREBASE_PROJECT_ID: "project" }, { verify, fetcher: async () => Response.json({ fields: { role: { stringValue: "Candidate" } } }) })).rejects.toMatchObject({ status: 403 });
  await expect(authorizeStaff(request, { FIREBASE_PROJECT_ID: "project" }, { verify, fetcher: async () => { throw new Error("offline"); } })).rejects.toMatchObject({ status: 503 });
});
