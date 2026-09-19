import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");
const ts=v=>!v?"(none)":(typeof v==="object"&&typeof v.seconds==="number")?new Date(v.seconds*1000).toISOString():String(v);
const grab = async n => (await getDocs(collection(db,n))).docs.map(d=>({id:d.id,...d.data()}));

const positions = await grab("positions");
const liveIds = new Set(positions.map(p=>p.id));
console.log("=== positions (raw, with timestamps) ===");
for (const p of positions) console.log(`  ${p.id}  "${p.title}"  createdAt=${ts(p.createdAt)}  status=${p.status}`);

console.log("\n=== applications: any orphans now, beyond the known HE-01/SFD-01? ===");
const apps = await grab("applications");
for (const a of apps) console.log(`  ${a.id}  positionId=${a.positionId}  ${liveIds.has(a.positionId)?"live":"ORPHAN"}  stage=${a.stage}`);

console.log("\n=== positionArchive current full list ===");
const arch = await grab("positionArchive");
for (const a of arch) console.log(`  ${a.id.padEnd(10)} recordState=${a.recordState}`);

console.log("\n=== employees (unaffected by BD/RM churn - both point at long-gone tombstones already) ===");
const emps = await grab("employees");
for (const e of emps) console.log(`  ${e.id}  positionId=${e.positionId}  hiredPosition=${e.hiredPosition?"present":"ABSENT"}`);

await signOut(auth); process.exit(0);
