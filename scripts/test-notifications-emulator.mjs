// Emulator only: atomic delivery, recipient isolation, reminder deduplication.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp as adminApp } from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, getDoc, runTransaction, terminate } from "firebase/firestore";
import { commitInterviewChanges, respondToOwnInterview } from "../src/lib/interviewPersistence.js";
import { persistAvailabilityReminder, writeNotifications } from "../src/lib/notificationPersistence.js";
import { hireNotification } from "../src/lib/notifications.js";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8189";
const projectId = "demo-hyre-notifications";
const endpoint = `http://127.0.0.1:8189/emulator/v1/projects/${projectId}`;
const rules = await fetch(`${endpoint}:securityRules`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: readFileSync("firestore.rules", "utf8") }] } }) });
assert.equal(rules.ok, true, await rules.text());
await fetch(`${endpoint}/databases/(default)/documents`, { method: "DELETE" });
const admin = adminFirestore(adminApp({ projectId }));
for (const [id, role] of [["hr", "HR"], ["interviewer", "Interviewer"], ["candidate", "Candidate"]]) await admin.doc(`users/${id}`).set({ role });
await admin.doc("positions/BD-02").set({ title: "Backend Developer", status: "Open" });
const clients = [];
const client = (uid) => {
  const db = getFirestore(initializeApp({ projectId, apiKey: "demo-key" }, uid));
  connectFirestoreEmulator(db, "127.0.0.1", 8189, { mockUserToken: { sub: uid, email: `${uid}@test.invalid` } });
  clients.push(db); return db;
};
const hr = client("hr"), interviewer = client("interviewer"), candidate = client("candidate");
const notes = async () => (await admin.collection("notifications").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
try {
  const booking = { positionId: "BD-02", positionTitle: "Backend Developer", stageId: "dept", stageLabel: "Department Review", interviewerId: "interviewer", interviewerName: "Dilani", createdByUid: "hr", scheduledAt: new Date("2026-09-21T10:00:00Z"), durationMs: 7200000, status: "pending_confirmation" };
  await commitInterviewChanges(hr, () => [{ id: "one", data: booking }]);
  assert.equal((await notes()).length, 2);
  const request = (await notes()).find((n) => n.toUid === "interviewer");
  assert.equal(request.type, "interview_request");
  assert.equal(request.durationMs, 7200000);
  assert.equal((await getDoc(doc(interviewer, "notifications", request.id))).exists(), true);
  await assert.rejects(getDoc(doc(candidate, "notifications", request.id)), (e) => e.code === "permission-denied");
  await assert.rejects(commitInterviewChanges(hr, () => [{ id: "conflict", data: booking }]), /Busy/);
  assert.equal((await notes()).length, 2, "failed booking must not notify anyone");
  await respondToOwnInterview(interviewer, "one", { accept: true, actor: { uid: "interviewer", role: "Interviewer" } });
  assert.equal((await notes()).length, 4);
  await commitInterviewChanges(hr, () => [{ id: "one", update: true, data: { status: "confirmed" } }]);
  assert.equal((await notes()).length, 4, "unchanged save must not duplicate notices");
  await commitInterviewChanges(hr, () => [{ id: "two", data: { ...booking, scheduledAt: new Date("2026-09-22T10:00:00Z"), respondedBy: [] } }]);
  await respondToOwnInterview(interviewer, "two", { accept: false, actor: { uid: "interviewer", role: "Interviewer" } });
  assert.equal((await notes()).filter((n) => n.title === "Interview needs attention" && n.toUid === "hr").length, 1);

  await Promise.all([persistAvailabilityReminder(interviewer, { uid: "interviewer", role: "Interviewer" }), persistAvailabilityReminder(interviewer, { uid: "interviewer", role: "Interviewer" })]);
  assert.equal((await notes()).filter((n) => n.type === "availability_reminder").length, 1);
  await admin.doc("availability/hr").set({ declaredAt: new Date(), validUntil: new Date(Date.now() + 7 * 86400000), slots: [] });
  await persistAvailabilityReminder(hr, { uid: "hr", role: "HR" });
  await persistAvailabilityReminder(candidate, { uid: "candidate", role: "Candidate" });
  assert.equal((await notes()).filter((n) => n.type === "availability_reminder").length, 1, "no reminders after an update or to applicants");

  await runTransaction(hr, async (tx) => {
    tx.set(doc(hr, "employees", "EMP-01"), { employeeId: "EMP-01", stage: "hired", positionId: "BD-02", submittedByUid: "candidate" });
    writeNotifications(tx, hr, [hireNotification({ uid: "candidate", employeeId: "EMP-01", title: "Backend Developer", company: "Hyre" })]);
  });
  const hired = (await notes()).find((n) => n.type === "hired");
  assert.equal((await getDoc(doc(candidate, "notifications", hired.id))).exists(), true);
  assert.equal(hired.positionId, undefined, "hire notice must not depend on a live position");
  console.log("PASS: atomic assignment/confirmation notifications, no duplicates, no notices on failed bookings, recipient-only reads, concurrent reminder deduplication, reminders stop after saving, candidate exclusion, and hire delivery.");
} finally {
  await Promise.all(clients.map(terminate));
  await admin.terminate();
}
