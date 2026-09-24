// Regression test for the stage-move/reject authorization bug: a candidate
// in "Initial Interview" was moved to "Final Interview" by an Interviewer
// who was NOT the interviewer assigned to that stage for that position — the
// UI already hid the button correctly (canAdvanceStageFor in src/lib/stages.js),
// but advanceStage()/rejectCandidate() themselves never verified assignment
// before writing, so a direct call (bypassing the UI) went through anyway.
//
// Runs in mock/demo mode (firebaseReady: false) — SEED_POSITIONS/SEED_CANDIDATES
// give a real in-memory pipeline with no Firestore mocking needed; savePipeline's
// mock-mode branch lets us assign a specific interviewer to pos_1's "interview"
// stage exactly like HR would via StageConfigModal.
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/firebase/config", () => ({ db: {}, firebaseReady: false }));

const { advanceStage, rejectCandidate, savePipeline } = await import("./store.js");

const ASSIGNED = { uid: "assigned-uid", role: "Interviewer", name: "Assigned Person" };
const UNASSIGNED = { uid: "rehan-uid", role: "Interviewer", name: "Rehan Silva" };
const MANAGEMENT = { uid: "mgmt-uid", role: "Management", name: "Management Person" };

beforeEach(async () => {
  // pos_1 / cand_6 are seed fixtures: cand_6 sits in "interview" ("Initial
  // Interview") on pos_1. Assign ONLY "Assigned Person" to that stage.
  await savePipeline("pos_1", {
    stages: ["applied", "screening", "dept", "interview", "final", "hired"],
    stageMeta: {},
    stageAssignees: { interview: [ASSIGNED] },
    stageSlots: [],
    removedBookingIds: [],
    actor: { uid: "hr-uid", role: "HR", name: "HR Person" },
  });
});

it("rejects a Move/Reject attempt from an Interviewer who IS NOT assigned to this stage on this position", async () => {
  const moveResult = await advanceStage("cand_6", UNASSIGNED);
  expect(moveResult.ok).toBe(false);
  expect(moveResult.reason).toBe("stage-assignment-required");

  const rejectResult = await rejectCandidate("cand_6", { reason: "Not a fit", actor: UNASSIGNED });
  expect(rejectResult.ok).toBe(false);
  expect(rejectResult.reason).toBe("stage-assignment-required");
});

it("lets the ASSIGNED interviewer past the assignment gate (any later failure is a different, unrelated check)", async () => {
  const moveResult = await advanceStage("cand_6", ASSIGNED);
  expect(moveResult.reason).not.toBe("stage-assignment-required");

  const rejectResult = await rejectCandidate("cand_6", { reason: "Not a fit", actor: ASSIGNED });
  expect(rejectResult.ok).toBe(true); // reject has no review-gate to clear, unlike advance
});

it("Management always passes the assignment gate, regardless of the per-stage team", async () => {
  const moveResult = await advanceStage("cand_6", MANAGEMENT);
  expect(moveResult.reason).not.toBe("stage-assignment-required");

  const rejectResult = await rejectCandidate("cand_6", { reason: "Not a fit", actor: MANAGEMENT });
  expect(rejectResult.ok).toBe(true);
});
