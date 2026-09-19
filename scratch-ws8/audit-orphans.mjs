// READ-ONLY diagnostic (§3c). Counts records pointing at positions that no
// longer exist. Deletes NOTHING — reports only.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);
await signInWithEmailAndPassword(auth, "hr@hyre.app", "hyre1234");

const grab = async (name) => (await getDocs(collection(db, name))).docs.map((d) => ({ id: d.id, ...d.data() }));

const positions = await grab("positions");
const livePositionIds = new Set(positions.map((p) => p.id));
console.log(`\n=== LIVE POSITIONS (${positions.length}) ===`);
for (const p of positions) console.log(`  ${p.id.padEnd(10)} "${p.title}"  status=${p.status}  hiredCount=${p.hiredCount ?? 0}/${p.headcount ?? 1}`);

const report = async (name, refField = "positionId") => {
  let rows;
  try { rows = await grab(name); } catch (e) { console.log(`\n=== ${name}: UNREADABLE (${e.code || e.message}) ===`); return; }
  const orphans = rows.filter((r) => r[refField] && !livePositionIds.has(r[refField]));
  const noRef = rows.filter((r) => !r[refField]);
  console.log(`\n=== ${name}: ${rows.length} total, ${orphans.length} ORPHANED, ${noRef.length} with no ${refField} ===`);
  const byPos = {};
  for (const o of orphans) (byPos[o[refField]] ||= []).push(o);
  for (const [pid, list] of Object.entries(byPos)) {
    console.log(`  -> points at missing position "${pid}" (${list.length}):`);
    for (const o of list) {
      const who = o.name || o.email || o.candidateName || o.appliedRole || "";
      console.log(`       ${o.id}  stage=${o.stage ?? "-"}  ${who}`);
    }
  }
};

await report("applications");
await report("applicationScores");
await report("employees");
await report("interviews");

// Employees are SUPPOSED to survive a deleted position (§3b) — the question is
// only whether their record can stand alone without it.
const employees = await grab("employees");
console.log(`\n=== EMPLOYEE SELF-SUFFICIENCY (${employees.length}) ===`);
for (const e of employees) {
  const posAlive = e.positionId && livePositionIds.has(e.positionId);
  console.log(`  ${e.id.padEnd(12)} positionId=${(e.positionId || "(none)").padEnd(10)} ${posAlive ? "live" : "DANGLING"}  employeeRole="${e.employeeRole || ""}"  appliedRole="${e.appliedRole || ""}"`);
}

await signOut(auth);
process.exit(0);
