// Task 1 — backfill employees/SE-SNE-0001.hiredPosition using the CANONICAL
// function, not a hand-written object. Input is the positionArchive/SNE-01
// stub itself, per instruction. Client SDK, signed in as HR (rules permit:
// employees update requires isStaff() && historyAppendOnly(), which only
// constrains the history array — hiredPosition is unrestricted).
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";
import { hiredPositionSnapshot } from "../src/lib/positionLifecycle.js";

const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");

const archiveSnap = await getDoc(doc(db, "positionArchive", "SNE-01"));
if (!archiveSnap.exists()) throw new Error("positionArchive/SNE-01 does not exist — aborting.");
const stub = archiveSnap.data();
console.log("positionArchive/SNE-01 (input):", JSON.stringify(stub));

const snapshot = hiredPositionSnapshot(stub);
console.log("\nhiredPositionSnapshot(stub) returned:", JSON.stringify(snapshot, null, 2));

const empRef = doc(db, "employees", "SE-SNE-0001");
const before = await getDoc(empRef);
if (before.data().hiredPosition) {
  console.log("\n*** hiredPosition already present — aborting, not overwriting. ***");
  console.log(JSON.stringify(before.data().hiredPosition));
} else {
  await updateDoc(empRef, { hiredPosition: snapshot });
  const after = await getDoc(empRef);
  console.log("\nWrite committed. employees/SE-SNE-0001.hiredPosition is now:");
  console.log(JSON.stringify(after.data().hiredPosition, null, 2));
}

await signOut(auth); process.exit(0);
