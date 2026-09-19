// READ-ONLY (§1/§2 diagnosis). Per-position breakdown of applications by stage,
// so the "N candidates" count and the delete-confirmation wording can be stated
// from real numbers rather than guessed at.
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
const grab = async (n) => (await getDocs(collection(db, n))).docs.map((d) => ({ id: d.id, ...d.data() }));

const positions = await grab("positions");
const apps = await grab("applications");
const scores = await grab("applicationScores");
const employees = await grab("employees");

for (const p of positions) {
  const mine = apps.filter((a) => a.positionId === p.id);
  const byStage = {};
  for (const a of mine) byStage[a.stage || "?"] = (byStage[a.stage || "?"] || 0) + 1;
  const emps = employees.filter((e) => e.positionId === p.id);
  const scoreCount = scores.filter((s) => s.positionId === p.id).length;
  const inProcess = mine.filter((a) => a.stage !== "hired" && a.stage !== "rejected").length;
  const rejected = mine.filter((a) => a.stage === "rejected").length;
  console.log(`\n${p.id} "${p.title}"  (headcount field = ${p.headcount ?? 1}, hiredCount = ${p.hiredCount ?? 0})`);
  console.log(`   applications: ${mine.length}  ${JSON.stringify(byStage)}`);
  console.log(`   -> in process (excl hired+rejected): ${inProcess}`);
  console.log(`   -> rejected (currently counted, would be excluded): ${rejected}`);
  console.log(`   employees pointing here: ${emps.length} ${emps.map((e) => e.id).join(", ")}`);
  console.log(`   applicationScores: ${scoreCount}`);
  console.log(`   TODAY the header shows: ${mine.length + emps.length} candidates`);
  console.log(`   AFTER the fix it shows: ${inProcess}`);
}
await signOut(auth);
process.exit(0);
