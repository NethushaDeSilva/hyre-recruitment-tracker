import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const app = initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID});
const auth=getAuth(app); const db=getFirestore(app);
await signInWithEmailAndPassword(auth,"hr@hyre.app","hyre1234");
// Never print file/data-URL content (a CV, a photo, anything base64) — only
// its length and MIME prefix. Applies to any field, not just cvDataUrl by
// name, so a differently-named file field can't slip through unredacted.
const redact = (value) => {
  if (typeof value === "string" && (value.startsWith("data:") || value.length > 500)) {
    const mime = /^data:([^;,]+)/.exec(value)?.[1] || "(not a data URL)";
    return `[REDACTED ${mime}, ${value.length} chars]`;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
  return value;
};

const snap = await getDoc(doc(db,"candidates","bandarasandun1990@gmail.com"));
console.log("exists:", snap.exists());
if (snap.exists()) console.log(JSON.stringify(redact(snap.data()), null, 2));
await signOut(auth); process.exit(0);
