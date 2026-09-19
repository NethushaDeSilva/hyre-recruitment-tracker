// READ-ONLY. Lists every interview, splitting scratch (TEST-POS/X) from survivors.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");
const ts=v=>!v?"(none)":(typeof v==="object"&&typeof v.seconds==="number")?new Date(v.seconds*1000).toISOString():(typeof v==="number"?new Date(v).toISOString():String(v));
const rows = (await getDocs(collection(db,"interviews"))).docs.map(d=>({id:d.id,...d.data()}));
console.log(`Total interviews: ${rows.length}\n`);
const scratch = rows.filter(r=>r.positionId==="TEST-POS"||r.positionId==="X");
const survivors = rows.filter(r=>!(r.positionId==="TEST-POS"||r.positionId==="X"));
console.log(`=== SCRATCH (positionId TEST-POS or X): ${scratch.length} ===`);
for (const r of scratch) console.log(`  ${r.id}  positionId=${r.positionId}  candidateName=${JSON.stringify(r.candidateName)}  applicationId=${r.applicationId}  interviewerId=${r.interviewerId}  status=${r.status}  createdAt=${ts(r.createdAt)}`);
console.log(`\n=== SURVIVORS (NOT scratch): ${survivors.length} ===`);
for (const r of survivors) console.log(`  ${r.id}\n    positionId=${r.positionId}\n    candidateName=${JSON.stringify(r.candidateName)}\n    applicationId=${r.applicationId}\n    interviewerId=${r.interviewerId}\n    stageId=${r.stageId}\n    status=${r.status}\n    scheduledAt=${ts(r.scheduledAt)}\n    createdAt=${ts(r.createdAt)}\n    requestedAt=${ts(r.requestedAt)}\n    full=${JSON.stringify(r)}\n`);
await signOut(auth); process.exit(0);
