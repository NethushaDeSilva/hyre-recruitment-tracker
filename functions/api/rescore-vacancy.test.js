import { it, expect, vi } from "vitest";
// Batch-contract tests start after authorization. Real token validation and
// endpoint denial are covered separately in staff-auth/scoring-auth tests.
vi.mock("../_lib/staff-auth.js", () => ({ requireStaff: async () => null }));
import { onRequestPost } from "./rescore-vacancy.js";

const candidates = n => Array.from({ length: n }, (_, i) => ({ candidateId: `app-${i}`, skills: ["React"], extractedText: "React", education: [], totalYearsExperience: 1 }));
const request = list => new Request("https://hyre-hiring.pages.dev/api/rescore-vacancy", { method: "POST", body: JSON.stringify({ batchId: "batch-1", candidates: list, requirements: { requiredSkills: ["React"] } }) });
it("rejects 301 applications with complete outstanding reconciliation", async () => {
  const response = await onRequestPost({ request: request(candidates(301)), env: {} });
  expect(response.status).toBe(413);
  const data = await response.json();
  expect(data.requested).toBe(301);
  expect(data.outstanding).toBe(301);
  expect(data.results).toHaveLength(301);
});
it("accounts for every application with stable application IDs", async () => {
  const response = await onRequestPost({ request: request(candidates(2)), env: {} });
  const data = await response.json();
  expect(data.batchId).toBe("batch-1");
  expect(data.requested).toBe(data.completed + data.failed + data.outstanding);
  expect(data.results.map(r => [r.applicationId, r.status])).toEqual([["app-0", "completed"], ["app-1", "completed"]]);
});
it("rejects duplicate application IDs", async () => {
  const list = candidates(1);
  expect((await onRequestPost({ request: request([...list, ...list]), env: {} })).status).toBe(400);
});
