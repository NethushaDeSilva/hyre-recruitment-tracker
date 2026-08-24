// BACKFILL employee IDs for STAFF (HR / Interviewer / Management) — every user in
// the system gets a unique signature ID, in the SAME format as a hired employee:
//     {DEPT}-{ROLE}-{NUMBER}      e.g.  PC-HR-0002, SE-BD-0003, DPM-PM-0004
//   • DEPT   = department derived from their job TITLE (departmentForTitle)
//   • ROLE   = abbreviation of their title (roleCode)
//   • NUMBER = the SAME global counter hired candidates use (counters/employees),
//              so a staff ID can NEVER collide with a hired-candidate ID.
//
// Idempotent: skips anyone who already has an employeeId. Ends with a DUPLICATE
// AUDIT across BOTH `users` and `candidates` — no two people may share an ID.
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/backfill-staff-ids.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// --- id format (mirror of src/lib/departments.js + src/data/store.js) ---
const DEPARTMENTS = [
  { name: "People & Culture", code: "PC" }, { name: "Software Engineering", code: "SE" },
  { name: "Quality Engineering", code: "QE" }, { name: "AI & Data Analytics", code: "AI" },
  { name: "Delivery & Project Management", code: "DPM" }, { name: "Sales", code: "SAL" },
  { name: "Marketing", code: "MKT" }, { name: "Customer Support", code: "CS" },
];
const departmentCode = (name) => {
  const key = String(name || "").trim().toLowerCase();
  const found = DEPARTMENTS.find((d) => d.name.toLowerCase() === key);
  if (found) return found.code;
  const ini = String(name || "").replace(/&/g, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase();
  return ini.slice(0, 3) || "GEN";
};
const departmentForTitle = (title) => {
  const t = String(title || "").toLowerCase();
  if (/\b(hr|recruit|recruiter|talent|people|culture)\b/.test(t)) return "People & Culture";
  if (/\b(qa|quality|test|sdet)\b/.test(t)) return "Quality Engineering";
  if (/\b(data|ml|machine learning|ai|analytics|scientist)\b/.test(t)) return "AI & Data Analytics";
  if (/\b(sales|account)\b/.test(t)) return "Sales";
  if (/\b(marketing|brand|content|seo)\b/.test(t)) return "Marketing";
  if (/\b(support|customer|helpdesk)\b/.test(t)) return "Customer Support";
  if (/\b(project|delivery|program|product|operations|scrum|owner|release)\b/.test(t)) return "Delivery & Project Management";
  return "Software Engineering";
};
const roleCode = (title) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "EMP";
  const alnum = (w) => w.replace(/[^A-Za-z0-9]/g, "");
  if (words.length === 1) return (alnum(words[0]).slice(0, 4) || "EMP").toUpperCase();
  return (words.map((w) => alnum(w)[0] || "").join("").slice(0, 5) || "EMP").toUpperCase();
};
const makeEmployeeId = (deptName, title, n) => `${departmentCode(deptName)}-${roleCode(title)}-${String(n).padStart(4, "0")}`;

const STAFF_ROLES = ["HR", "Interviewer", "Management"];
const ROLE_ORDER = { HR: 0, Interviewer: 1, Management: 2 };

let sa;
try { sa = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url), "utf8")); }
catch { console.error("✗ serviceAccountKey.json not found in project root."); process.exit(1); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function run() {
  // gather EVERY existing employee ID (staff + hired candidates) up front, so we
  // never mint a value that's already in use and can audit for duplicates.
  const usersSnap = await db.collection("users").get();
  const candsSnap = await db.collection("candidates").get();
  const taken = new Set();
  const record = (id, who) => { if (id) taken.add(id); };
  usersSnap.docs.forEach((d) => record(d.data().employeeId));
  candsSnap.docs.forEach((d) => record(d.data().employeeId));

  // staff without an ID, deterministic order (role, then email) → stable numbers
  const pending = usersSnap.docs
    .map((d) => ({ ref: d.ref, id: d.id, ...d.data() }))
    .filter((u) => STAFF_ROLES.includes(u.role) && !u.employeeId)
    .sort((a, b) => (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]) || String(a.email).localeCompare(String(b.email)));

  if (!pending.length) {
    console.log("✓ Every staff member already has an employee ID.");
  } else {
    const counterRef = db.doc("counters/employees");
    const counter = await counterRef.get();
    let next = counter.exists ? Number(counter.data().next) || 1 : 1;

    const batch = db.batch();
    const issued = [];
    for (const u of pending) {
      const dept = departmentForTitle(u.title);
      let id = makeEmployeeId(dept, u.title, next);
      // defensive: skip any number that (somehow) already produced a taken id
      while (taken.has(id)) { next += 1; id = makeEmployeeId(dept, u.title, next); }
      taken.add(id);
      batch.update(u.ref, { employeeId: id, employeeDept: dept, employeeRole: u.title });
      issued.push({ name: u.displayName || u.email, role: u.role, title: u.title, dept, id });
      next += 1;
    }
    batch.set(counterRef, { next }, { merge: true });
    await batch.commit();

    console.log(`✓ Issued ${issued.length} staff employee ID(s):`);
    for (const i of issued) console.log(`   ${i.id.padEnd(14)} ${i.name}  ·  ${i.role} / ${i.title}  →  ${i.dept}`);
    console.log(`✓ counters/employees.next = ${next}`);
  }

  // --- DUPLICATE AUDIT across EVERYONE (users + candidates) ---
  const seen = new Map(); // id → [owners]
  const add = (id, owner) => { if (!id) return; seen.set(id, [...(seen.get(id) || []), owner]); };
  (await db.collection("users").get()).docs.forEach((d) => add(d.data().employeeId, `user:${d.data().email || d.id}`));
  (await db.collection("candidates").get()).docs.forEach((d) => add(d.data().employeeId, `cand:${d.data().name || d.id}`));
  const dups = [...seen.entries()].filter(([, owners]) => owners.length > 1);
  if (dups.length) {
    console.error(`\n⚠ DUPLICATE EMPLOYEE IDs FOUND (${dups.length}):`);
    for (const [id, owners] of dups) console.error(`   ${id}  ←  ${owners.join(" , ")}`);
    process.exitCode = 2;
  } else {
    console.log(`\n✓ Duplicate audit passed — ${seen.size} unique employee ID(s), none shared.`);
  }
}

run().then(() => process.exit(process.exitCode || 0)).catch((e) => { console.error(e); process.exit(1); });
