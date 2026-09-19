// Tests the real migration twice to verify record selection and idempotence.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8189";
const projectId = "demo-hyre-repair";
const db = getFirestore(initializeApp({ projectId }));
await fetch(`http://127.0.0.1:8189/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
const at = Timestamp.fromMillis;
const fixture = {
  "positions/RM-01": { title: "Regional Manager", department: "Sales", createdAt: at(1000), status: "Open", description: "Recreated vacancy" },
  "positions/BD-01": { title: "Backend Dev", createdAt: at(1000), status: "Open" },
  "employees/old-hire": { positionId: "RM-01", hiredAt: at(500), employeeRole: "Regional manager", employeeDept: "Sales", history: [{ type: "hire", at: 500 }] },
  "applications/current": { positionId: "RM-01", appliedAt: at(1500) },
  "applications/ambiguous": { positionId: "RM-01", appliedAt: at(900), history: [{ type: "stage", at: 2000 }] },
  "applications/old": { positionId: "RM-01", appliedAt: at(500) },
  "applications/unrelated-orphan": { positionId: "SFD-03", appliedAt: at(500) },
  "applicationScores/current": { positionId: "RM-01", score: 80 },
  "applicationScores/ambiguous": { positionId: "RM-01", score: 50 },
  "applicationScores/old": { positionId: "RM-01", score: 30 },
  "interviews/current": { positionId: "RM-01", applicationId: "current", createdAt: at(2000) },
  "validation_logs/old": { positionId: "RM-01", at: at(500) },
};
try {
  for (const [path, data] of Object.entries(fixture)) await db.doc(path).set(data);
  const run = () => {
    const result = spawnSync(process.execPath, ["scripts/repair-position-identities.mjs", "--emulator", "--apply", "--keep-active-ambiguous"], { encoding: "utf8", timeout: 60000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  run();
  run();
  assert.equal((await db.doc("positions/RM-01").get()).exists, false);
  assert.equal((await db.doc("positions/RM-02").get()).data().description, "Recreated vacancy");
  assert.equal((await db.doc("positionArchive/RM-01").get()).data().recordState, "Deleted");
  assert.equal((await db.doc("positionArchive/RM-02").get()).data().recordState, "Active");
  assert.equal((await db.doc("positionSequences/RM").get()).data().next, 2);
  assert.equal((await db.doc("positionSequences/SFD").get()).data().next, 3);
  for (const path of ["applications/current", "applications/ambiguous", "applicationScores/current", "applicationScores/ambiguous", "interviews/current"]) assert.equal((await db.doc(path).get()).data().positionId, "RM-02", path);
  for (const path of ["applications/old", "applicationScores/old", "employees/old-hire", "validation_logs/old"]) assert.equal((await db.doc(path).get()).data().positionId, "RM-01", path);
  assert.deepEqual((await db.doc("employees/old-hire").get()).data().history, fixture["employees/old-hire"].history);
  assert.equal((await db.doc("positionIdentityRepairs/RM-01").get()).data().state, "Complete");
  assert.equal((await db.doc("applications/unrelated-orphan").get()).exists, true);
  console.log("PASS: collision repair, preserved employment history, application/score/interview relocation, older-record retention, all known identities reserved, idempotent rerun.");
} finally { await db.terminate(); }
