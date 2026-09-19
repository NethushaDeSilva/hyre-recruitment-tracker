// Task 2 — every employee record, resolvable with no live position doc.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");
const employees = (await getDocs(collection(db,"employees"))).docs.map(d=>({id:d.id,...d.data()}));
const positions = (await getDocs(collection(db,"positions"))).docs.map(d=>({id:d.id,...d.data()}));
const liveIds = new Set(positions.map(p=>p.id));
console.log(`${employees.length} employee record(s):\n`);
for (const e of employees) {
  const live = liveIds.has(e.positionId);
  const hp = e.hiredPosition;
  const complete = !!(hp && hp.title && hp.department);
  console.log(`${e.id}`);
  console.log(`  positionId: ${e.positionId}  ->  ${live ? "LIVE position" : "tombstone (no live position doc)"}`);
  console.log(`  hiredPosition: ${hp ? "present" : "ABSENT"}${hp ? `  title="${hp.title}" department="${hp.department}"` : ""}  -> ${complete ? "complete (title+department present)" : "INCOMPLETE"}`);
  console.log(`  self-sufficient without live position doc: ${live || complete ? "YES" : "NO"}\n`);
}
await signOut(auth); process.exit(0);
