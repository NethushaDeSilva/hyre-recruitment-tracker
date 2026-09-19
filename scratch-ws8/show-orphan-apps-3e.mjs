// READ-ONLY. Pulls the 2 orphaned applications (HE-01, SFD-01) in full.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");
const ts=v=>!v?"(none)":(typeof v==="object"&&typeof v.seconds==="number")?new Date(v.seconds*1000).toISOString():(typeof v==="number"?new Date(v).toISOString():String(v));
const apps = (await getDocs(collection(db,"applications"))).docs.map(d=>({id:d.id,...d.data()}));
const positions = (await getDocs(collection(db,"positions"))).docs.map(d=>({id:d.id,...d.data()}));
const liveIds = new Set(positions.map(p=>p.id));
for (const target of ["HE-01","SFD-01"]) {
  const a = apps.find(x=>x.positionId===target);
  console.log(`\n=== applications/${a.id}  (positionId=${target}) ===`);
  console.log(`  In live positions? ${liveIds.has(target)} -> ${liveIds.has(target) ? "would show" : "EXCLUDED from Candidates table (ids.has(c.positionId) is false)"}`);
  console.log(JSON.stringify(a, null, 2));
}
await signOut(auth); process.exit(0);
