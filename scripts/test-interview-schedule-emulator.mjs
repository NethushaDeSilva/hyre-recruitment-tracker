// Local emulator only. Never reads credentials or connects to production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp as adminApp } from "firebase-admin/app";
import { getFirestore as adminFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, getDocs, collection, terminate } from "firebase/firestore";
import { commitInterviewChanges } from "../src/lib/interviewPersistence.js";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8189";
const projectId = "demo-hyre-schedule";
const endpoint = `http://127.0.0.1:8189/emulator/v1/projects/${projectId}`;
const response = await fetch(`${endpoint}:securityRules`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: readFileSync("firestore.rules", "utf8") }] } }) });
assert.equal(response.ok, true, await response.text());
await fetch(`${endpoint}/databases/(default)/documents`, { method: "DELETE" });
const admin = adminFirestore(adminApp({ projectId }));
for (const [id, role] of [["hr", "HR"], ["dilani", "Interviewer"], ["other", "Interviewer"], ["candidate", "Candidate"]]) await admin.doc(`users/${id}`).set({ role });
for (const id of ["BD-01", "RM-02"]) await admin.doc(`positions/${id}`).set({ title: id, status: "Open", stageAssignees: {} });
const clients = [];
function client(uid) {
  const db = getFirestore(initializeApp({ projectId, apiKey: "demo-key" }, uid));
  connectFirestoreEmulator(db, "127.0.0.1", 8189, { mockUserToken: { sub: uid, email: `${uid}@test.invalid` } });
  clients.push(db);
  return db;
}
const hr = client("hr"), dilani = client("dilani"), other = client("other"), candidate = client("candidate");
const at = (hour, day = 19) => new Date(`2026-09-${day}T${String(hour).padStart(2, "0")}:00:00Z`);
let id = 0;
const booking = (start, end, extra = {}) => ({ positionId: "BD-01", positionTitle: "Backend Developer", stageId: "final", stageLabel: "Final Interview", interviewerId: "dilani", interviewerName: "Dilani", scheduledAt: at(start), durationMs: (end - start) * 3600000, status: "confirmed", ...extra });
const create = (data, db = hr) => commitInterviewChanges(db, () => [{ id: `booking-${++id}`, data }]);
try {
  await create(booking(10, 12));
  for (const [start, end] of [[9, 11], [10, 11], [10.5, 11.5], [11, 13]]) {
    const data = booking(10, 12, { positionId: "RM-02", scheduledAt: new Date(at(10).getTime() + (start - 10) * 3600000), durationMs: (end - start) * 3600000 });
    await assert.rejects(create(data), /Busy.*Backend Developer/);
  }
  await create(booking(8, 10, { positionId: "RM-02" }));
  await create(booking(12, 14, { positionId: "RM-02" }));
  await create(booking(10, 12, { positionId: "RM-02", scheduledAt: at(10, 18) }));
  assert.equal((await getDoc(doc(hr, "interviews", "booking-1"))).data().positionId, "BD-01");

  // An entire stage team plus its position configuration commits atomically.
  const team = [{ uid: "person-a", name: "A" }, { uid: "person-b", name: "B" }];
  const patch = { id: "RM-02", data: { stageAssignees: { final: team } } };
  await commitInterviewChanges(hr, () => team.map((p) => ({ id: p.uid, data: booking(10, 12, { positionId: "RM-02", interviewerId: p.uid, kind: "stage_assignment" }) })), patch);
  assert.deepEqual((await getDoc(doc(hr, "positions", "RM-02"))).data().stageAssignees.final, team);
  await assert.rejects(commitInterviewChanges(hr, () => [{ id: "bad-team", data: booking(11, 13) }], { id: "RM-02", data: { stageAssignees: {} } }), /Busy/);
  assert.deepEqual((await getDoc(doc(hr, "positions", "RM-02"))).data().stageAssignees.final, team);

  // Two fresh clients see the same free slot; only one may reserve it.
  const results = await Promise.allSettled([
    create(booking(15, 17, { interviewerId: "race" })),
    create(booking(15, 17, { interviewerId: "race", positionId: "RM-02" })),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(results.find((r) => r.status === "rejected").reason.message, /Busy/);

  // Requests, overrides and replies use this same persistence path.
  await create(booking(17, 18, { status: "pending_confirmation", rankedInfo: { dilani: { nextUid: "other" } }, respondedBy: [] }));
  const requestId = `booking-${id}`;
  await assert.rejects(commitInterviewChanges(other, () => [{ id: requestId, update: true, data: { status: "confirmed" } }]), (e) => e.code === "permission-denied");
  await commitInterviewChanges(dilani, () => [{ id: requestId, update: true, data: { status: "confirmed" } }]);
  await assert.rejects(commitInterviewChanges(hr, () => [{ id: requestId, update: true, data: { scheduledAt: at(11), durationMs: 3600000 } }]), /Busy/);
  // A busy next-ranked person, or a manual request with no rankedInfo entry,
  // can be declined back to HR without assigning an arbitrary replacement.
  for (const rankedInfo of [{ dilani: { nextUid: "other" } }, {}]) {
    const changes = await create(booking(19, 20, { status: "pending_confirmation", rankedInfo, respondedBy: [] }));
    const declineId = changes[0].id;
    await assert.rejects(commitInterviewChanges(dilani, () => [{ id: declineId, update: true, data: {
      interviewerId: "forged", status: "pending_confirmation", requestedAt: new Date(), respondedBy: [{ uid: "dilani", action: "declined" }],
    } }]), (e) => e.code === "permission-denied");
    await commitInterviewChanges(dilani, () => [{ id: declineId, update: true, data: {
      interviewerId: "", status: "needs_attention", requestedAt: null, respondedBy: [{ uid: "dilani", action: "declined" }],
    } }]);
  }
  await assert.rejects(setDoc(doc(hr, "interviews", "unguarded"), booking(10, 12)), (e) => e.code === "permission-denied");
  await assert.rejects(getDocs(collection(candidate, "interviews")), (e) => e.code === "permission-denied");
  await assert.rejects(setDoc(doc(candidate, "counters", "interviewSchedule"), { next: 1000 }), (e) => e.code === "permission-denied");
  console.log("PASS: overlaps, boundaries, dates, cross-position preservation, atomic team saves, concurrent bookings, response permissions, raw-write and candidate denial.");
} finally {
  await Promise.all(clients.map(terminate));
  await admin.terminate();
}
