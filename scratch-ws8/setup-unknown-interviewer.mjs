import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

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

// Give management@hyre.app a DevOps domain WITHOUT ever declaring
// availability, so listInterviewers() picks them up as a second person whose
// state is genuinely 'unknown' — needed to verify the unknown-state grid
// rendering actually differs from a person with real declared data. No
// availability/{uid} doc is created for them on purpose.
const arg = process.argv[2]; // "set" | "revert"
const cred = await signInWithEmailAndPassword(auth, "management@hyre.app", "hyre1234");
if (arg === "revert") {
  await setDoc(doc(db, "users", cred.user.uid), { domain: "", levels: [] }, { merge: true });
  console.log("reverted management@hyre.app domain.");
} else {
  await setDoc(doc(db, "users", cred.user.uid), { domain: "devops", levels: ["senior"] }, { merge: true });
  console.log("set management@hyre.app domain=devops, levels=[senior], uid:", cred.user.uid);
}
process.exit(0);
