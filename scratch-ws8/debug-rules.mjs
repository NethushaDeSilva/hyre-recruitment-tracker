import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const cred = await signInWithEmailAndPassword(auth, "interviewer@hyre.app", "hyre1234");
console.log("uid:", cred.user.uid);

const userSnap = await getDoc(doc(db, "users", cred.user.uid));
console.log("users doc exists:", userSnap.exists(), "data:", userSnap.exists() ? userSnap.data() : null);

try {
  const availSnap = await getDoc(doc(db, "availability", cred.user.uid));
  console.log("availability read OK. exists:", availSnap.exists(), availSnap.exists() ? availSnap.data() : null);
} catch (e) {
  console.log("availability read FAILED:", e.code, e.message);
}

process.exit(0);
