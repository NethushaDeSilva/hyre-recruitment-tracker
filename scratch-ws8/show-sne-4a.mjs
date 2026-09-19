// READ-ONLY (Task 4a/4b). Shows employees/SE-SNE-0001 as it stands and
// positionArchive/SNE-01, to derive the hiredPosition object to propose.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");

const redact = (value) => {
  if (typeof value === "string" && (value.startsWith("data:") || value.length > 500)) {
    const mime = /^data:([^;,]+)/.exec(value)?.[1] || "(not a data URL)";
    return `[REDACTED ${mime}, ${value.length} chars]`;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
};

const emp = await getDoc(doc(db, "employees", "SE-SNE-0001"));
console.log("=== employees/SE-SNE-0001 (4a) ===");
console.log(JSON.stringify(redact(emp.data()), null, 2));

const arch = await getDoc(doc(db, "positionArchive", "SNE-01"));
console.log("\n=== positionArchive/SNE-01 (source for reconstruction) ===");
console.log("exists:", arch.exists());
console.log(JSON.stringify(redact(arch.data()), null, 2));

// For comparison — Amara's already-backfilled record, to match the same shape.
const amara = await getDoc(doc(db, "employees", "SAL-RM-0037"));
console.log("\n=== employees/SAL-RM-0037 (already backfilled, for shape reference) ===");
console.log(JSON.stringify(redact(amara.data().hiredPosition), null, 2));

await signOut(auth); process.exit(0);
