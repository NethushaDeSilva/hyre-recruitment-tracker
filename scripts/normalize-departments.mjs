// ONE-OFF: normalize legacy free-text position departments to the 8 FIXED
// departments (so the dropdown shows valid values and employee IDs derive clean
// codes), then RE-ISSUE any already-hired employee's ID to match its corrected
// department — keeping the SAME employee number (no counter churn).
//
// Idempotent-ish: only writes a position whose department actually changes, and
// only rewrites an employee ID whose department code changed.
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/normalize-departments.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// title → correct fixed department (Regional manager already = "Sales", skipped)
const MAP = {
  "Senior network engineer": "Software Engineering",
  "Network Engineer": "Software Engineering",
  "Senior Frontend Developer": "Software Engineering",
  "HR Executive": "People & Culture",
  "Sales Manager": "Sales",
  "QA Engineer": "Quality Engineering",
  "UI/UX Designer": "Software Engineering", // no "Design" dept in the fixed 8 — flagged
};

// --- id format (mirror of src/data/store.js + src/lib/departments.js) ---
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
  const initials = String(name || "").replace(/&/g, " ").split(/\s+/).filter(Boolean).map((w) => w[0]).join("").toUpperCase();
  return initials.slice(0, 3) || "GEN";
};
const roleCode = (title) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "EMP";
  const alnum = (w) => w.replace(/[^A-Za-z0-9]/g, "");
  if (words.length === 1) return (alnum(words[0]).slice(0, 4) || "EMP").toUpperCase();
  return (words.map((w) => alnum(w)[0] || "").join("").slice(0, 5) || "EMP").toUpperCase();
};
const empNum = (id) => { const m = /(\d+)\s*$/.exec(String(id || "")); return m ? Number(m[1]) : 0; };
const makeEmployeeId = (deptName, title, n) => `${departmentCode(deptName)}-${roleCode(title)}-${String(n).padStart(4, "0")}`;

let sa;
try { sa = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url), "utf8")); }
catch { console.error("✗ serviceAccountKey.json not found in project root."); process.exit(1); }
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function run() {
  const posSnap = await db.collection("positions").get();
  const batch = db.batch();
  const changed = new Map(); // positionId → new department

  console.log("Departments:");
  for (const d of posSnap.docs) {
    const x = d.data();
    const target = MAP[x.title];
    if (target && target !== x.department) {
      batch.update(d.ref, { department: target });
      changed.set(d.id, target);
      console.log(`   • ${x.title}:  "${x.department}"  →  "${target}"  (${departmentCode(target)})`);
    } else {
      console.log(`   • ${x.title}:  "${x.department}"  — unchanged (${departmentCode(x.department)})`);
    }
  }

  // re-issue employee IDs for hired candidates whose position department changed
  const hiredSnap = await db.collection("candidates").where("stage", "==", "hired").get();
  const reissued = [];
  for (const d of hiredSnap.docs) {
    const c = d.data();
    if (!c.employeeId) continue;
    const newDept = changed.get(c.positionId);
    if (!newDept) continue;
    const title = c.employeeRole || c.appliedRole || "";
    const n = empNum(c.employeeId) || 1;
    const newId = makeEmployeeId(newDept, title, n);
    if (newId !== c.employeeId) {
      batch.update(d.ref, { employeeId: newId, employeeDept: newDept });
      reissued.push({ name: c.name, from: c.employeeId, to: newId });
    }
  }

  await batch.commit();
  console.log(`\n✓ Updated ${changed.size} position department(s).`);
  if (reissued.length) {
    console.log("✓ Re-issued employee ID(s):");
    for (const r of reissued) console.log(`   ${r.from}  →  ${r.to}  (${r.name})`);
  } else {
    console.log("✓ No employee IDs needed re-issuing.");
  }
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
