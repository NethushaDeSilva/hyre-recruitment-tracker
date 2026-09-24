// Rules-emulator regression test for the stage-move/reject authorization
// bug: an Interviewer who is NOT assigned to a position's stage used to be
// able to write a stage-transition directly to Firestore (the UI hid the
// button correctly, but nothing on the server checked WHO was moving the
// candidate, only their ROLE). This exercises the deployed rule itself
// (stageAssignmentOk() in firestore.rules), not the app code — proving the
// server-side gap is actually closed, independent of any client behaving.
//
// Requires the Firestore emulator (Java 21+). Run with:
//   npx firebase emulators:exec --only firestore "npx vitest run firestore.rules.stageAssignment.test.js"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const PROJECT_ID = "hyre-rules-test";
let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed a position with ONE interviewer assigned to the "interview" stage —
  // and its stageAssigneeUids mirror, exactly as savePipeline() writes it.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "positions", "pos_1"), {
      title: "Frontend Developer",
      status: "Open",
      stages: ["applied", "screening", "dept", "interview", "final", "hired"],
      stageAssignees: { interview: [{ uid: "assigned-uid", name: "Assigned Person", role: "Interviewer" }] },
      stageAssigneeUids: { interview: ["assigned-uid"] },
    });
    await setDoc(doc(db, "applications", "app_1"), {
      positionId: "pos_1", personId: "candidate@example.com", email: "candidate@example.com",
      stage: "interview", appliedRole: "Frontend Developer", history: [], comments: [],
    });
    // --- fixture 2: multi-stage interviews for the getInterviewsForApplication()
    // read-permission bug. pos_2's Dept Review is owned by "dept-uid", Initial
    // Interview by "assigned-uid" — TWO DIFFERENT people, each with their own
    // interview doc against the SAME application, exactly the ASANKA BANDARA
    // scenario (comments from multiple stages/reviewers on one candidate).
    await setDoc(doc(db, "positions", "pos_2"), {
      title: "Frontend Developer",
      status: "Open",
      stages: ["applied", "screening", "dept", "interview", "final", "hired"],
      stageAssignees: {
        dept: [{ uid: "dept-uid", name: "Dept Reviewer", role: "Interviewer" }],
        interview: [{ uid: "assigned-uid", name: "Assigned Person", role: "Interviewer" }],
      },
      stageAssigneeUids: { dept: ["dept-uid"], interview: ["assigned-uid"] },
    });
    await setDoc(doc(db, "applications", "app_2"), {
      positionId: "pos_2", personId: "asanka@example.com", email: "asanka@example.com",
      stage: "dept", appliedRole: "Frontend Developer", history: [], comments: [],
    });
    await setDoc(doc(db, "interviews", "iv_dept"), {
      kind: "stage_assignment", applicationId: "app_2", positionId: "pos_2",
      stageId: "dept", interviewerId: "dept-uid", status: "confirmed",
    });
    await setDoc(doc(db, "interviews", "iv_interview"), {
      kind: "stage_assignment", applicationId: "app_2", positionId: "pos_2",
      stageId: "interview", interviewerId: "assigned-uid", status: "confirmed",
    });

    // Staff user profiles — the rules' myRole()/isStaff() read /users/{uid}.
    await setDoc(doc(db, "users", "assigned-uid"), { role: "Interviewer", name: "Assigned Person" });
    await setDoc(doc(db, "users", "rehan-uid"), { role: "Interviewer", name: "Rehan Silva" });
    await setDoc(doc(db, "users", "mgmt-uid"), { role: "Management", name: "Management Person" });
    await setDoc(doc(db, "users", "dept-uid"), { role: "Interviewer", name: "Dept Reviewer" });
    await setDoc(doc(db, "users", "hr-uid"), { role: "HR", name: "HR Person" });
    await setDoc(doc(db, "users", "outsider-uid"), { role: "Interviewer", name: "Outsider" });
  });
});

function readAllInterviewsForApplication(uid, applicationId) {
  const db = ctxAs(uid).firestore();
  return getDocs(query(collection(db, "interviews"), where("applicationId", "==", applicationId)));
}

function ctxAs(uid) {
  return testEnv.authenticatedContext(uid, { email: `${uid}@hyre.app` });
}

describe("applications/{id} update — per-stage assignment (stageAssignmentOk)", () => {
  it("REJECTS a stage-transition write from an Interviewer who is NOT assigned to this stage on this position", async () => {
    const db = ctxAs("rehan-uid").firestore();
    await assertFails(
      updateDoc(doc(db, "applications", "app_1"), { stage: "final" })
    );
  });

  it("ALLOWS the stage-transition write from the Interviewer actually assigned to this stage", async () => {
    const db = ctxAs("assigned-uid").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "applications", "app_1"), { stage: "final" })
    );
  });

  it("ALLOWS Management to write the stage-transition regardless of the assigned team", async () => {
    const db = ctxAs("mgmt-uid").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "applications", "app_1"), { stage: "final" })
    );
  });
});

// getInterviewsForApplication() (src/data/store.js) runs ONE unfiltered-on-
// interviewerId query for ALL of an application's interview docs, so the
// review modal can show every stage's comments at once — this is what threw
// "Missing or insufficient permissions" for a plain Interviewer once the
// stage-assignment fix landed (isRecruiter()-OR-SELF can't prove an unfiltered
// query for a non-recruiter when the result set spans multiple interviewerIds).
describe("interviews/{id} read — multi-stage visibility (interviewerOnApplication)", () => {
  it("REPRODUCES the bug pre-fix intuition: a plain outsider Interviewer (assigned to NEITHER stage on this position) is still correctly denied", async () => {
    await assertFails(readAllInterviewsForApplication("outsider-uid", "app_2"));
  });

  it("FIXED: an interviewer assigned to Initial Interview can read ALL of the application's interview docs, including Dept Review's (a different reviewer's) comment", async () => {
    const snap = await readAllInterviewsForApplication("assigned-uid", "app_2");
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["iv_dept", "iv_interview"]);
  });

  it("FIXED: an interviewer assigned to Dept Review can likewise read Initial Interview's doc on the same application", async () => {
    const snap = await readAllInterviewsForApplication("dept-uid", "app_2");
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["iv_dept", "iv_interview"]);
  });

  it("HR/Recruiter reads everything, as before", async () => {
    const snap = await readAllInterviewsForApplication("hr-uid", "app_2");
    expect(snap.docs.map((d) => d.id).sort()).toEqual(["iv_dept", "iv_interview"]);
  });

  it("does NOT regress the write-side fix: the Initial-Interview interviewer can now READ Dept Review's doc, but still cannot WRITE a stage-move on app_2 (currently at 'dept', which they are not assigned to)", async () => {
    const db = ctxAs("assigned-uid").firestore();
    await assertFails(updateDoc(doc(db, "applications", "app_2"), { stage: "interview" }));
  });
});
