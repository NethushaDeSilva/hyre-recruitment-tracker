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
const cred = await signInWithEmailAndPassword(auth, "interviewer@hyre.app", "hyre1234");

// Reset the smoke-test artifacts (duplicate windows from repeated script runs)
// back to a clean, single, tidy declaration rather than leaving test debris on
// the shared demo account.
await setDoc(doc(db, "availability", cred.user.uid), {
  timeZone: "Asia/Colombo",
  slots: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
  exceptions: [],
  declaredAt: new Date(),
  validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
}, { merge: false });
await setDoc(doc(db, "users", cred.user.uid), { domain: "devops", levels: [] }, { merge: true });
console.log("cleaned up.");
process.exit(0);
