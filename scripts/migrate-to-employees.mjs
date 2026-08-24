// ONE-TIME MIGRATION → readable document ids + a separate /employees collection.
//
// Before: /candidates held everyone (pipeline AND hired) under random document ids
//         like `aB3xYz9…`, with the readable number only in a `candidateId` field.
// After:  • /candidates docs are re-keyed so the DOCUMENT ID *is* the number
//           → candidates/CAND-0061
//         • every HIRED person is MOVED into /employees, keyed by their employee id
//           → employees/SE-SNE-0001   (and removed from /candidates)
//         • counters/candidates.next and counters/employees.next are advanced past
//           everything issued, so live applications/hires continue the sequence.
//
// REJECTED candidates are NEVER deleted — they're only re-keyed (talent pool stays).
// Idempotent: re-running skips docs already in their final shape, and never reissues
// a number. Uses the Firebase ADMIN SDK (bypasses the locked security rules).
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/migrate-to-employees.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// --- id helpers (mirror src/lib/departments.js + src/data/store.js) ---
const DEPARTMENTS = [
  { name: "People & Culture", code: "PC" },
  { name: "Software Engineering", code: "SE" },
  { name: "Quality Engineering", code: "QE" },
  { name: "AI & Data Analytics", code: "AI" },
  { name: "Delivery & Project Management", code: "DPM" },
  { name: "Sales", code: "SAL" },
  { name: "Marketing", code: "MKT" },
  { name: "Customer Support", code: "CS" },
];
const departmentCode = (name) => {
  const key = String(name || "").trim().toLowerCase();
  const found = DEPARTMENTS.find((d) => d.name.toLowerCase() === key);
  if (found) return found.code;
  const initials = String(name || "").replace(/&/g, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase();
  return initials.slice(0, 3) || "GEN";
};
const fmtEmployeeNum = (n) => String(n).padStart(4, "0");
const roleCode = (title) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "EMP";
  const alnum = (w) => w.replace(/[^A-Za-z0-9]/g, "");
  if (words.length === 1) return (alnum(words[0]).slice(0, 4) || "EMP").toUpperCase();
  return (words.map((w) => alnum(w)[0] || "").join("").slice(0, 5) || "EMP").toUpperCase();
};
const makeEmployeeId = (deptName, title, n) => `${departmentCode(deptName)}-${roleCode(title)}-${fmtEmployeeNum(n)}`;
const fmtCandidateId = (n) => `CAND-${String(n).padStart(4, "0")}`;
const CANDIDATE_SEQ_START = 61;
const parseNum = (id) => { const m = /(\d+)\s*$/.exec(String(id || "")); return m ? Number(m[1]) : 0; };

const hireStamp = (c) => {
  if (c.hiredAt?.toMillis) return c.hiredAt.toMillis();
  const h = Array.isArray(c.history) ? c.history.find((e) => e.to === "hired" || e.type === "hire") : null;
  if (h?.at) return Number(h.at);
  if (c.appliedAt?.toMillis) return c.appliedAt.toMillis();
  return Date.now();
};

// --- init admin ---
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url), "utf8"));
} catch {
  console.error("✗ Could not read serviceAccountKey.json (Console → Project settings → Service accounts → Generate new private key).");
  process.exit(1);
}
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// A tiny auto-flushing batch (Firestore caps a batch at 500 writes).
function makeBatcher(limit = 400) {
  let batch = db.batch();
  let n = 0;
  const pending = [];
  const maybeFlush = async () => { if (n >= limit) { pending.push(batch.commit()); batch = db.batch(); n = 0; } };
  return {
    set: async (ref, data, opts) => { opts ? batch.set(ref, data, opts) : batch.set(ref, data); n++; await maybeFlush(); },
    del: async (ref) => { batch.delete(ref); n++; await maybeFlush(); },
    commit: async () => { pending.push(batch.commit()); await Promise.all(pending); },
  };
}

async function run() {
  // positions: id → { department, title }
  const posSnap = await db.collection("positions").get();
  const positions = new Map(posSnap.docs.map((d) => [d.id, d.data()]));

  const candSnap = await db.collection("candidates").get();
  const empSnap = await db.collection("employees").get();

  // Never reuse a number: start the sequences past the counters AND past everything
  // already present in either collection.
  const curCand = await db.doc("counters/candidates").get();
  const curEmp = await db.doc("counters/employees").get();
  let nextCand = curCand.exists ? Number(curCand.data().next) || CANDIDATE_SEQ_START : CANDIDATE_SEQ_START;
  let nextEmp = curEmp.exists ? Number(curEmp.data().next) || 1 : 1;
  const bump = () => {
    for (const d of candSnap.docs) {
      const x = d.data();
      nextCand = Math.max(nextCand, parseNum(x.candidateId) + 1);
      if (x.employeeId) nextEmp = Math.max(nextEmp, parseNum(x.employeeId) + 1);
    }
    for (const d of empSnap.docs) {
      const x = d.data();
      nextCand = Math.max(nextCand, parseNum(x.candidateId) + 1);
      nextEmp = Math.max(nextEmp, parseNum(x.employeeId) + 1);
    }
  };
  bump();

  const usedCandIds = new Set(); // guard against two docs targeting the same id
  const usedEmpIds = new Set(empSnap.docs.map((d) => d.id));
  const batcher = makeBatcher();
  const moved = [];   // → employees
  const rekeyed = []; // → candidates re-keyed
  let skipped = 0;

  // Process oldest-first so numbers we assign track application order.
  const docs = candSnap.docs
    .map((d) => ({ ref: d.ref, id: d.id, data: d.data() }))
    .sort((a, b) => (a.data.appliedAt?.toMillis?.() || 0) - (b.data.appliedAt?.toMillis?.() || 0));

  for (const { ref, id, data } of docs) {
    // Ensure a candidate number.
    let candidateId = data.candidateId || "";
    if (!candidateId) candidateId = fmtCandidateId(nextCand++);

    if (data.stage === "hired") {
      const pos = positions.get(data.positionId) || {};
      const deptName = data.employeeDept || pos.department || "";
      const title = data.employeeRole || pos.title || data.appliedRole || "";
      let employeeId = data.employeeId || "";
      if (!employeeId || usedEmpIds.has(employeeId)) {
        do { employeeId = makeEmployeeId(deptName, title, nextEmp++); } while (usedEmpIds.has(employeeId));
      }
      usedEmpIds.add(employeeId);
      await batcher.set(db.collection("employees").doc(employeeId), {
        ...data,
        candidateId,
        stage: "hired",
        employeeId,
        employeeDept: deptName,
        employeeRole: title,
        hiredAt: data.hiredAt || Timestamp.fromMillis(hireStamp(data)),
      });
      await batcher.del(ref); // remove from /candidates
      moved.push({ name: data.name, candidateId, employeeId, role: title, dept: deptName });
    } else {
      // Non-hired (incl. rejected): re-key so the DOCUMENT ID is the number.
      if (usedCandIds.has(candidateId)) candidateId = fmtCandidateId(nextCand++); // collision guard
      usedCandIds.add(candidateId);
      if (id === candidateId && data.candidateId === candidateId) { skipped++; continue; } // already final
      await batcher.set(db.collection("candidates").doc(candidateId), { ...data, candidateId });
      if (id !== candidateId) await batcher.del(ref); // drop the old random-id doc
      rekeyed.push({ name: data.name, from: id, to: candidateId, stage: data.stage });
    }
  }

  // Advance the counters so live writes never collide with anything above.
  await batcher.set(db.doc("counters/candidates"), { next: nextCand }, { merge: true });
  await batcher.set(db.doc("counters/employees"), { next: nextEmp }, { merge: true });
  await batcher.commit();

  console.log(`\n✓ Migration complete.`);
  console.log(`  • Moved to /employees: ${moved.length}`);
  for (const m of moved) console.log(`      ${m.employeeId}  ←  ${m.name} (${m.candidateId}) · ${m.role} · ${m.dept}`);
  console.log(`  • Re-keyed in /candidates: ${rekeyed.length}`);
  for (const r of rekeyed) console.log(`      ${r.from}  →  candidates/${r.to}  (${r.stage})`);
  console.log(`  • Already-final, skipped: ${skipped}`);
  console.log(`  • counters/candidates.next = ${nextCand}   counters/employees.next = ${nextEmp}\n`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
