// BACKFILL employee IDs for candidates who were ALREADY hired before the
// employee-ID feature existed (e.g. Nethusha De Silva → Senior Network Engineer).
//
// For every candidate at stage "hired" WITHOUT an employeeId, it mints one:
//     {DEPT}-{ROLE}-{NUMBER}      e.g.  SE-SNE-0001
// pulling DEPT + ROLE from the candidate's position and NUMBER from a global,
// monotonic counter (counters/employees.next) — the exact same format the app
// issues on hire going forward (src/data/store.js). Idempotent: re-running skips
// anyone who already has an employeeId, so numbers are never reissued.
//
// Uses the Firebase ADMIN SDK (bypasses the locked rules). ONLY writes the
// `employeeId` / `employeeDept` / `employeeRole` / `hiredAt` fields on hired
// candidate docs + the counters/employees doc — nothing else is touched.
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/backfill-employee-ids.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

// --- department codes (mirror of src/lib/departments.js) ---
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

// --- id format (mirror of src/data/store.js) ---
const fmtEmployeeNum = (n) => String(n).padStart(4, "0");
const roleCode = (title) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "EMP";
  const alnum = (w) => w.replace(/[^A-Za-z0-9]/g, "");
  if (words.length === 1) return (alnum(words[0]).slice(0, 4) || "EMP").toUpperCase();
  return (words.map((w) => alnum(w)[0] || "").join("").slice(0, 5) || "EMP").toUpperCase();
};
const makeEmployeeId = (deptName, title, n) => `${departmentCode(deptName)}-${roleCode(title)}-${fmtEmployeeNum(n)}`;

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

const hireStamp = (c) => {
  if (c.hiredAt?.toMillis) return c.hiredAt.toMillis();
  const h = Array.isArray(c.history) ? c.history.find((e) => e.to === "hired" || e.type === "hire") : null;
  if (h?.at) return Number(h.at);
  if (c.appliedAt?.toMillis) return c.appliedAt.toMillis();
  return Date.now();
};

async function run() {
  // positions map: id → { department, title }
  const posSnap = await db.collection("positions").get();
  const positions = new Map();
  posSnap.docs.forEach((d) => positions.set(d.id, d.data()));

  // every hired candidate missing an employeeId, earliest hire first
  const candSnap = await db.collection("candidates").where("stage", "==", "hired").get();
  const pending = candSnap.docs
    .map((d) => ({ ref: d.ref, ...d.data() }))
    .filter((c) => !c.employeeId)
    .sort((a, b) => hireStamp(a) - hireStamp(b));

  if (!pending.length) {
    console.log("✓ Nothing to backfill — every hired candidate already has an employee ID.");
    return;
  }

  // starting number from the counter (default 1)
  const counterRef = db.doc("counters/employees");
  const counter = await counterRef.get();
  let next = counter.exists ? Number(counter.data().next) || 1 : 1;

  const batch = db.batch();
  const issued = [];
  for (const c of pending) {
    const pos = positions.get(c.positionId) || {};
    const deptName = pos.department || "";
    const title = pos.title || c.appliedRole || "";
    const employeeId = makeEmployeeId(deptName, title, next);
    batch.update(c.ref, {
      employeeId,
      employeeDept: deptName,
      employeeRole: title,
      hiredAt: c.hiredAt || Timestamp.fromMillis(hireStamp(c)),
    });
    issued.push({ name: c.name, candidateId: c.candidateId || "—", employeeId, role: title, dept: deptName });
    next += 1;
  }
  batch.set(counterRef, { next }, { merge: true });
  await batch.commit();

  console.log(`✓ Issued ${issued.length} employee ID(s):`);
  for (const i of issued) console.log(`   ${i.employeeId}  ←  ${i.name} (${i.candidateId})  ·  ${i.role} · ${i.dept}`);
  console.log(`✓ counters/employees.next = ${next}`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
