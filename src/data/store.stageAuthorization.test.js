// Stage gate: ASSIGNMENT IS THE ONLY AUTHORITY.
//
// To move OR reject a candidate sitting in a configured stage, the actor must
// BOTH (a) have been assigned to that stage on that position by HR, and
// (b) hold a confirmed interview booking for it. Three former escape hatches
// are gone, and each is pinned below:
//   1. Management short-circuited to allowed on every stage.
//   2. A stage with NOBODY assigned was open to every holder of the owning role.
//   3. Only HR Screening required a booked time; the other four stages let an
//      assigned-but-never-scheduled person through.
//
// Runs in mock/demo mode (firebaseReady false) against the seed pipeline. The
// store module is re-imported per test because mock mode keeps pipeline state
// in module scope — a test that successfully rejects someone would otherwise
// leave them terminal for every test after it.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/firebase/config", () => ({ db: {}, firebaseReady: false }));

const ASSIGNED = { uid: "assigned-uid", role: "Interviewer", name: "Dinesh Kunawardena" };
const OTHER_INTERVIEWER = { uid: "rehan-uid", role: "Interviewer", name: "Rehan Silva" };
const MANAGEMENT = { uid: "mgmt-uid", role: "Management", name: "Buddhi Wijayaratne" };
const HR = { uid: "hr-uid", role: "HR", name: "Priya Fernando" };

const STAGES = ["applied", "screening", "dept", "interview", "final", "hired"];
// cand_6 is a seed application sitting in "interview" (Initial Interview) on pos_1.
const CANDIDATE = "cand_6";
const STAGE = "interview";

let store;

/** Configure pos_1: assign `team` to Initial Interview, and optionally book them a slot. */
async function configure({ team, booked }) {
  await store.savePipeline("pos_1", {
    stages: STAGES,
    stageMeta: {},
    stageAssignees: team ? { [STAGE]: [team] } : {},
    stageSlots: booked
      ? [{ stageId: STAGE, stageLabel: "Initial Interview", interviewerId: booked.uid, interviewerName: booked.name, scheduledAt: Date.now() + 86400000, durationMs: 3600000 }]
      : [],
    removedBookingIds: [],
    actor: HR,
  });
}
const advance = (actor) => store.advanceStage(CANDIDATE, actor);
const reject = (actor) => store.rejectCandidate(CANDIDATE, { reason: "Not a fit", actor });

// No default configuration here: savePipeline() APPENDS bookings in mock
// mode, so a slot booked in beforeEach could not be un-booked by a test that
// needs the "assigned but never scheduled" case. Each test states its own
// full setup instead.
beforeEach(async () => {
  vi.resetModules();
  store = await import("./store.js");
});

describe("assignment is required", () => {
  it("lets the assigned, scheduled interviewer act — the whole point of the gate", async () => {
    await configure({ team: ASSIGNED, booked: ASSIGNED });
    expect((await reject(ASSIGNED)).ok).toBe(true);
  });

  it("refuses an interviewer who was never assigned to this stage", async () => {
    await configure({ team: ASSIGNED, booked: ASSIGNED });
    expect(await advance(OTHER_INTERVIEWER)).toMatchObject({ ok: false, reason: "stage-assignment-required" });
    expect(await reject(OTHER_INTERVIEWER)).toMatchObject({ ok: false, reason: "stage-assignment-required" });
  });

  it("refuses HR too — HR configures the stage, it does not staff itself onto one", async () => {
    await configure({ team: ASSIGNED, booked: ASSIGNED });
    expect(await advance(HR)).toMatchObject({ ok: false, reason: "stage-assignment-required" });
  });
});

describe("Management has no special powers (gap 1)", () => {
  it("refuses an UNASSIGNED Management user to move or reject, same as anyone else", async () => {
    await configure({ team: ASSIGNED, booked: ASSIGNED });
    expect(await advance(MANAGEMENT)).toMatchObject({ ok: false, reason: "stage-assignment-required" });
    expect(await reject(MANAGEMENT)).toMatchObject({ ok: false, reason: "stage-assignment-required" });
  });

  it("still lets Management act where HR DID assign and schedule them", async () => {
    await configure({ team: MANAGEMENT, booked: MANAGEMENT });
    expect((await reject(MANAGEMENT)).ok).toBe(true);
  });
});

describe("an unstaffed stage is closed to everyone (gap 2)", () => {
  it("refuses every role when HR has assigned nobody to the stage", async () => {
    await configure({ team: null, booked: null });
    for (const actor of [ASSIGNED, OTHER_INTERVIEWER, MANAGEMENT, HR]) {
      expect(await advance(actor)).toMatchObject({ ok: false, reason: "stage-assignment-required" });
      expect(await reject(actor)).toMatchObject({ ok: false, reason: "stage-assignment-required" });
    }
  });
});

describe("a booked interview time is required on every stage, not just HR Screening (gap 3)", () => {
  it("refuses the assigned interviewer when no time has been scheduled for them", async () => {
    await configure({ team: ASSIGNED, booked: null });
    expect(await advance(ASSIGNED)).toMatchObject({ ok: false, reason: "stage-time-required" });
    expect(await reject(ASSIGNED)).toMatchObject({ ok: false, reason: "stage-time-required" });
  });

  it("refuses when the booked slot belongs to a DIFFERENT person on the same stage", async () => {
    await configure({ team: ASSIGNED, booked: OTHER_INTERVIEWER });
    expect(await advance(ASSIGNED)).toMatchObject({ ok: false, reason: "stage-time-required" });
  });
});
