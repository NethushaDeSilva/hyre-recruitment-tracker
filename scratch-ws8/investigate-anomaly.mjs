import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
console.log("Project:", env.VITE_FIREBASE_PROJECT_ID);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");

console.log("\n=== direct doc reads for the 2 expected survivors ===");
for (const id of ["3fSob4l8ogttXo8rqzps","EYwsqOfkvmnP1aDZ7Td5"]) {
  const s = await getDoc(doc(db,"interviews",id));
  console.log(`  interviews/${id}: exists=${s.exists()}`);
}

console.log("\n=== full positions collection, raw ===");
const positions = (await getDocs(collection(db,"positions"))).docs;
for (const d of positions) console.log(`  ${d.id}  title="${d.data().title}"  identityCode=${d.data().identityCode} identitySequence=${d.data().identitySequence}`);

console.log("\n=== full positionSequences, raw ===");
const seqs = (await getDocs(collection(db,"positionSequences"))).docs;
for (const d of seqs) console.log(`  ${d.id}: next=${d.data().next}`);

console.log("\n=== applicationScores, raw ===");
const scores = (await getDocs(collection(db,"applicationScores"))).docs;
console.log(`  count: ${scores.length}`);
for (const d of scores) console.log(`  ${d.id}  positionId=${d.data().positionId}`);

console.log("\n=== interviews collection query again ===");
const iv = (await getDocs(collection(db,"interviews"))).docs;
console.log(`  count: ${iv.length}`);

await signOut(auth); process.exit(0);
