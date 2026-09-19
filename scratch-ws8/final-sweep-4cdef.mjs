// READ-ONLY. Task 4c-4e: collection counts, ledger-vs-live per prefix, and
// TEST-POS/X absence check.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");
const grab = async n => { try { return (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()})); } catch(e){ return {error: e.code||e.message}; } };

console.log("=== 4c: collection counts ===");
const names = ["positions","positionSequences","positionArchive","applications","applicationScores","interviews","employees","candidates"];
const data = {};
for (const n of names) {
  const rows = await grab(n);
  data[n] = rows;
  console.log(`  ${n.padEnd(20)} ${Array.isArray(rows) ? rows.length : "UNREADABLE: "+rows.error}`);
}

console.log("\n=== 4d: ledger vs live vs archived, per prefix ===");
const prefixOf = id => String(id).replace(/-\d+$/, "");
const numOf = id => { const m=/-(\d+)$/.exec(String(id)); return m?Number(m[1]):null; };
const positions = data.positions, archive = data.positionArchive, seqs = data.positionSequences;
const prefixes = new Set([...positions.map(p=>prefixOf(p.id)), ...seqs.map(s=>s.id)]);
let allOk = true;
for (const pre of [...prefixes].sort()) {
  const ledger = seqs.find(s=>s.id===pre);
  const liveMax = Math.max(0, ...positions.filter(p=>prefixOf(p.id)===pre).map(p=>numOf(p.id)||0));
  const archMax = Math.max(0, ...archive.filter(a=>prefixOf(a.id)===pre && numOf(a.id)!==null).map(a=>numOf(a.id)||0));
  const led = ledger ? ledger.next : null;
  const ok = led !== null && led >= liveMax && led >= archMax;
  if (!ok) allOk = false;
  console.log(`  ${pre.padEnd(6)} ledger.next=${String(led).padEnd(4)} highestLive=${String(liveMax).padEnd(4)} highestArchived=${String(archMax).padEnd(4)} -> ${ok?"OK":"*** BEHIND ***"}`);
}
console.log(`  ALL PREFIXES OK: ${allOk}`);

console.log("\n=== 4e: TEST-POS / X absence in positions, presence in archive ===");
console.log(`  positions contains TEST-POS or X: ${positions.some(p=>p.id==="TEST-POS"||p.id==="X")}`);
const archTest = archive.find(a=>a.id==="TEST-POS");
const archX = archive.find(a=>a.id==="X");
console.log(`  positionArchive/TEST-POS: exists=${!!archTest} recordState=${archTest?.recordState}`);
console.log(`  positionArchive/X: exists=${!!archX} recordState=${archX?.recordState}`);

console.log("\n=== interviews still exactly 2, employees still exactly 2 (context) ===");
console.log(`  interviews: ${data.interviews.length}`, data.interviews.map(i=>`${i.id}(${i.positionId})`));
console.log(`  employees: ${data.employees.length}`, data.employees.map(e=>`${e.id}(${e.positionId}, hiredPosition=${e.hiredPosition?"present":"ABSENT"})`));

await signOut(auth); process.exit(0);
