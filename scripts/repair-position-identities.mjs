// Dry run by default. --apply reserves all known identities and repairs reused
// positions. No applications, scores, employees, or interview records are deleted.
// --keep-active-ambiguous retains applications submitted before recreation when
// subsequent pipeline actions demonstrate continued use of the current vacancy.
import { readFileSync, writeFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { positionCode, positionIdFor, hiredPositionSnapshot } from "../src/lib/positionLifecycle.js";

const apply = process.argv.includes("--apply");
const keepAmbiguous = process.argv.includes("--keep-active-ambiguous");
const preserveAmbiguous = process.argv.includes("--keep-ambiguous-historical");
const emulator = process.argv.includes("--emulator");
if (emulator) process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8189";
initializeApp(emulator ? { projectId: "demo-hyre-repair" } : { credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();
const names = ["positions", "applications", "applicationScores", "employees", "interviews", "notifications", "validation_logs", "candidates", "positionArchive", "positionSequences", "positionIdentityRepairs"];
const millis = value => value?.toMillis?.() || (typeof value === "number" ? value : 0);
const readAll = async transaction => new Map(await Promise.all(names.map(async name => [name, (await (transaction ? transaction.get(db.collection(name)) : db.collection(name).get())).docs])));

function plan(data) {
  const rows = name => data.get(name).map(doc => ({ id: doc.id, data: doc.data(), ref: doc.ref }));
  const known = new Map();
  const maxima = new Map(rows("positionSequences").map(row => [row.id, row.data.next]));
  const reserve = (id, title = "", department = "") => {
    if (!id) return;
    const entry = known.get(id) || { title: "", department: "" };
    if (!entry.title && title) entry.title = title;
    if (!entry.department && department) entry.department = department;
    known.set(id, entry);
    const match = /^([A-Z0-9]{1,5})-(\d+)$/.exec(id);
    if (match) maxima.set(match[1], Math.max(maxima.get(match[1]) || 0, Number(match[2])));
  };
  for (const name of names) for (const row of rows(name)) {
    if (name === "positions" || name === "positionArchive") reserve(row.id, row.data.title, row.data.department);
    reserve(row.data.positionId, row.data.employeeRole || row.data.appliedRole, row.data.employeeDept);
    reserve(row.data.fromPositionId);
  }
  const collisions = [];
  for (const position of rows("positions")) {
    const repair = rows("positionIdentityRepairs").find(r => r.data.sourceId === position.id && r.data.state === "Preparing");
    const original = repair?.data.originalPosition || position.data;
    const cutoff = millis(original.createdAt);
    const oldEmployees = rows("employees").filter(e => e.data.positionId === position.id && millis(e.data.hiredAt) > 0 && millis(e.data.hiredAt) < cutoff);
    if (!oldEmployees.length) continue;
    const code = positionCode(original.title);
    const sequence = repair?.data.sequence || (maxima.get(code) || 0) + 1;
    maxima.set(code, sequence);
    const targetId = repair?.data.targetId || positionIdFor(sequence, code);
    const applications = rows("applications").filter(a => a.data.positionId === position.id);
    const ambiguous = applications.filter(a => millis(a.data.appliedAt) < cutoff && (a.data.history || []).some(h => millis(h.at) >= cutoff));
    const movedApplications = applications.filter(a => millis(a.data.appliedAt) >= cutoff || (keepAmbiguous && ambiguous.some(x => x.id === a.id)));
    const applicationIds = new Set(movedApplications.map(a => a.id));
    const moves = movedApplications.map(a => ({ collection: "applications", id: a.id }));
    for (const name of ["applicationScores", "interviews", "notifications", "validation_logs", "employees"]) {
      for (const row of rows(name).filter(r => r.data.positionId === position.id)) {
        const applicationId = name === "applicationScores" ? row.id : row.data.applicationId || row.data.candidateId;
        const timestamp = millis(name === "employees" ? row.data.hiredAt : row.data.createdAt || row.data.at || row.data.scoredAt);
        if (applicationId ? applicationIds.has(applicationId) : timestamp >= cutoff) moves.push({ collection: name, id: row.id });
      }
    }
    collisions.push({ sourceId: position.id, targetId, code, sequence, cutoff, original, oldEmployees: oldEmployees.map(e => e.id), ambiguousApplications: ambiguous.map(a => a.id), moves });
  }
  return { known, maxima, collisions };
}

try {
  let data = await readAll();
  let planned = plan(data);
  const summary = p => ({ reservedIdentities: [...p.known.keys()], sequences: Object.fromEntries(p.maxima), repairs: p.collisions.map(({ original, ...repair }) => repair) });
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY RUN", ...summary(planned) }, null, 2));
  if (!apply) process.exitCode = 0;
  else {
    if (!keepAmbiguous && !preserveAmbiguous && planned.collisions.some(c => c.ambiguousApplications.length)) throw Error("Ambiguous active applications require an explicit migration decision.");
    const backup = `position-identity-backup-${Date.now()}.local`;
    writeFileSync(backup, JSON.stringify(Object.fromEntries([...data].map(([name, docs]) => [name, docs.map(d => ({ id: d.id, data: d.data() }))])), null, 2));
    console.log(`Backup: ${backup}`);
    // Freeze only colliding live vacancies. Existing deployed rules block new
    // dependents while locked, so the repair cannot strand a concurrent write.
    for (const repair of planned.collisions) {
      await db.runTransaction(async tx => {
        const ref = db.doc(`positions/${repair.sourceId}`);
        const live = await tx.get(ref);
        const repairRef = db.doc(`positionIdentityRepairs/${repair.sourceId}`);
        const existing = await tx.get(repairRef);
        if (!live.exists) throw Error("Position changed before migration");
        if (existing.exists && existing.data().state === "Preparing") return;
        tx.create(repairRef, { ...repair, originalPosition: live.data(), state: "Preparing", startedAt: Timestamp.now() });
        tx.update(ref, { deleting: true, status: "Closed" });
      });
    }
    await db.runTransaction(async tx => {
      data = await readAll(tx);
      planned = plan(data);
      if (!keepAmbiguous && !preserveAmbiguous && planned.collisions.some(c => c.ambiguousApplications.length)) throw Error("New ambiguous application found");
      const lookup = name => new Map(data.get(name).map(d => [d.id, d.data()]));
      const positions = lookup("positions");
      const archives = lookup("positionArchive");
      const employees = lookup("employees");
      const now = Timestamp.now();
      for (const [id, recovered] of planned.known) {
        if (archives.has(id) || planned.collisions.some(c => c.sourceId === id)) continue;
        const live = positions.get(id);
        tx.create(db.doc(`positionArchive/${id}`), live
          ? { ...live, recordState: "Active", reservedAt: now }
          : { ...recovered, recordState: "Deleted", recovered: true, recoveryNote: "Original position document no longer exists; identity recovered from surviving references.", reservedAt: now });
      }
      for (const [code, next] of planned.maxima) tx.set(db.doc(`positionSequences/${code}`), { next });
      for (const repair of planned.collisions) {
        if (positions.has(repair.targetId) || archives.has(repair.targetId)) throw Error(`Target identity already reserved: ${repair.targetId}`);
        const corrected = { ...repair.original, identityCode: repair.code, identitySequence: repair.sequence };
        delete corrected.deleting;
        tx.create(db.doc(`positions/${repair.targetId}`), corrected);
        tx.create(db.doc(`positionArchive/${repair.targetId}`), { ...corrected, recordState: "Active", reservedAt: now });
        const oldEmployee = employees.get(repair.oldEmployees[0]);
        tx.set(db.doc(`positionArchive/${repair.sourceId}`), {
          title: oldEmployee.employeeRole || repair.original.title,
          department: oldEmployee.employeeDept || repair.original.department,
          recordState: "Deleted", recovered: true, reservedAt: now,
          recoveryNote: "Original vacancy was deleted before archival existed; recovered from earlier employee hire records, not the recreated vacancy.",
          employeeRecordIds: repair.oldEmployees,
        });
        for (const employeeId of repair.oldEmployees) {
          const employee = employees.get(employeeId);
          tx.update(db.doc(`employees/${employeeId}`), { hiredPosition: employee.hiredPosition || hiredPositionSnapshot({ title: employee.employeeRole, department: employee.employeeDept }) });
        }
        for (const move of repair.moves) tx.update(db.doc(`${move.collection}/${move.id}`), { positionId: repair.targetId });
        tx.update(db.doc(`positionIdentityRepairs/${repair.sourceId}`), { state: "Complete", completedAt: now, moves: repair.moves, ambiguousApplicationsKept: keepAmbiguous ? repair.ambiguousApplications : [], ambiguityDecision: keepAmbiguous ? "Retained in current vacancy based on post-recreation pipeline actions; earlier appliedAt preserved unchanged." : "Preserved under historical identity." });
        tx.delete(db.doc(`positions/${repair.sourceId}`));
      }
    });
    console.log("Applied identity reservations and collision repairs. No dependent records deleted.");
  }
} finally { await db.terminate(); }
