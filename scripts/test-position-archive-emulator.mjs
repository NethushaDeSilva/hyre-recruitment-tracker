// Local emulator only; exercises production persistence functions and rules.
// Start Firestore with project demo-hyre-lifecycle, rules firestore.rules, port 8189.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp as adminApp } from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, deleteDoc, getDoc, terminate } from "firebase/firestore";
import { allocatePosition, getPositionDeletionSummary, removePersistedPosition } from "../src/lib/positionPersistence.js";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8189";
const projectId = "demo-hyre-lifecycle";
const rulesResponse = await fetch(`http://127.0.0.1:8189/emulator/v1/projects/${projectId}:securityRules`, {
  method: "PUT", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: readFileSync("firestore.rules", "utf8") }] } }),
});
assert.equal(rulesResponse.ok, true, await rulesResponse.text());
const admin = adminFirestore(adminApp({ projectId }));
await fetch(`http://127.0.0.1:8189/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
await admin.doc("users/hr").set({ role: "HR" });
await admin.doc("users/candidate").set({ role: "Candidate" });
const client = (uid) => {
  const db = getFirestore(initializeApp({ projectId, apiKey: "demo-key" }, uid));
  connectFirestoreEmulator(db, "127.0.0.1", 8189, { mockUserToken: { sub: uid, email: `${uid}@test.invalid` } });
  return db;
};
const db = client("hr");
const candidate = client("candidate");
const denied = async operation => assert.rejects(operation, error => error.code === "permission-denied");
const positionData = { title: "Regional Manager", department: "Sales", status: "Open", createdByUid: "manager", stageAssignees: { final: [{ uid: "manager" }] } };

try {
  const created = await Promise.all(Array.from({ length: 3 }, () => allocatePosition(db, positionData)));
  assert.equal(new Set(created.map(p => p.id)).size, 3, "concurrent creates must be unique");
  await denied(setDoc(doc(db, "positions", "RM-99"), positionData));
  await denied(deleteDoc(doc(db, "positionSequences", "RM")));
  await denied(setDoc(doc(db, "positionSequences", "RM"), { next: 1 }));
  await denied(allocatePosition(candidate, positionData));

  assert.deepEqual(created.map(p => p.id).sort(), ["RM-01", "RM-02", "RM-03"]);
  const other = await allocatePosition(db, { ...positionData, title: "Backend Dev" });
  assert.equal(other.id, "BD-01");
  const positionId = created[0].id;
  await denied(deleteDoc(doc(db, "positionArchive", positionId)));
  await denied(updateDoc(doc(db, "positionArchive", positionId), { title: "Forged" }));
  await updateDoc(doc(db, "positions", positionId), { description: "Final edited description" });
  const seed = [];
  for (let i = 0; i < 405; i++) {
    seed.push([`applications/a${i}`, { positionId, stage: i % 2 ? "rejected" : "applied", history: [] }]);
    seed.push([`applicationScores/a${i}`, { positionId }]);
  }
  for (const name of ["interviews", "notifications", "validation_logs"]) seed.push([`${name}/related`, { positionId }]);
  seed.push(["employees/retained", { positionId, stage: "hired", employeeRole: "Original role", employeeDept: "Original department", history: [] }]);
  seed.push(["candidates/person", { email: "person@test.invalid" }]);
  seed.push(["applications/existing-orphan", { positionId: "missing-before-test", stage: "rejected" }]);
  seed.push(["applications/unrelated", { positionId: created[1].id, stage: "applied" }]);
  for (let i = 0; i < seed.length; i += 400) {
    const batch = admin.batch();
    seed.slice(i, i + 400).forEach(([path, data]) => batch.set(admin.doc(path), data));
    await batch.commit();
  }
  assert.equal((await getPositionDeletionSummary(db, positionId)).applications, 405);
  await denied(deleteDoc(doc(db, "positions", positionId)));
  await denied(deleteDoc(doc(db, "applications", "a1"))); // rejected, no deletion lock
  await denied(deleteDoc(doc(db, "applicationScores", "a0")));
  await updateDoc(doc(db, "positions", positionId), { deleting: true, status: "Closed" });
  for (const name of ["applications", "applicationScores", "interviews", "notifications", "validation_logs", "employees"]) {
    await denied(setDoc(doc(db, name, "late"), { positionId, stage: "hired", employeeId: "late", submittedByUid: "hr" }));
  }
  await denied(updateDoc(doc(db, "positions", positionId), { deleting: false }));
  await removePersistedPosition(db, positionId); // resumes an already locked vacancy
  for (const name of ["applications", "applicationScores", "interviews", "notifications", "validation_logs"]) {
    assert.equal((await admin.collection(name).where("positionId", "==", positionId).get()).size, 0, name);
  }
  assert.equal((await getDoc(doc(db, "positions", positionId))).exists(), false);
  const archived = (await getDoc(doc(db, "positionArchive", positionId))).data();
  assert.equal(archived.recordState, "Deleted");
  assert.equal(archived.description, "Final edited description");
  assert.equal(archived.title, "Regional Manager");
  assert.ok(archived.deletedAt);
  await denied(deleteDoc(doc(db, "positionArchive", positionId)));
  await denied(updateDoc(doc(db, "positionArchive", positionId), { recordState: "Active" }));
  const employee = (await getDoc(doc(db, "employees", "retained"))).data();
  assert.equal(employee.employeeRole, "Original role");
  assert.equal(employee.hiredPosition.title, "Original role");
  assert.equal(employee.hiredPosition.createdByUid, "manager");
  assert.equal(employee.employeeDept, "Original department");
  assert.equal((await admin.doc("candidates/person").get()).exists, true);
  assert.equal((await admin.doc("applications/existing-orphan").get()).exists, true);
  assert.equal((await admin.doc("applications/unrelated").get()).exists, true);
  await removePersistedPosition(db, positionId); // idempotent retry after success
  const recreated = await allocatePosition(db, positionData);
  assert.equal(recreated.id, "RM-04");
  await denied(setDoc(doc(db, "applications", "after-delete"), { positionId, stage: "applied" }));
  await removePersistedPosition(db, recreated.id);
  const next = await allocatePosition(db, positionData);
  assert.equal(next.id, "RM-05", "deleting the highest number must never lower the sequence");
  const sameCode = await allocatePosition(db, { ...positionData, title: "Retail Manager" });
  assert.equal(sameCode.id, "RM-06", "different titles sharing initials must never collide");
  assert.equal((await getDoc(doc(db, "positionArchive", "RM-04"))).data().recordState, "Deleted");
  console.log("PASS: permanent archives, per-code counters, same-initial titles, concurrent identities, immutable counter, >500 dependent records, rejection cleanup, deletion locks, employee snapshots, isolated cleanup, retry, and same-title recreation.");
} finally {
  await Promise.all([terminate(db), terminate(candidate), admin.terminate()]);
}
