import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

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

const interviewerCred = await signInWithEmailAndPassword(auth, "interviewer@hyre.app", "hyre1234");
const interviewerUid = interviewerCred.user.uid;
await signOut(auth);

// R-style check 1: a Candidate cannot read anyone's declared availability.
const candCred = await signInWithEmailAndPassword(auth, "desilvanethusha+priya@gmail.com", "HyreSeed2026!");
try {
  await getDoc(doc(db, "availability", interviewerUid));
  console.log("FAIL: Candidate read availability — should have been blocked");
} catch (e) {
  console.log("PASS: Candidate blocked from reading availability (" + e.code + ")");
}
try {
  await setDoc(doc(db, "availability", candCred.user.uid), { timeZone: "Asia/Colombo", slots: [], exceptions: [], declaredAt: new Date(), validUntil: new Date() });
  console.log("FAIL: Candidate wrote their own availability doc — should have been blocked (not staff)");
} catch (e) {
  console.log("PASS: Candidate blocked from writing availability (" + e.code + ")");
}
await signOut(auth);

// R-style check 2: HR can READ another staff member's declared availability
// (needed for the calendar view) but cannot WRITE it (§15's own-declaration-only rule).
const hrCred = await signInWithEmailAndPassword(auth, "hr@hyre.app", "hyre1234");
try {
  const snap = await getDoc(doc(db, "availability", interviewerUid));
  console.log("PASS: HR can read another staff member's availability. exists:", snap.exists());
} catch (e) {
  console.log("FAIL: HR blocked from reading staff availability (" + e.code + ") — breaks the calendar view");
}
try {
  await setDoc(doc(db, "availability", interviewerUid), { timeZone: "Asia/Colombo", slots: [{ dayOfWeek: 3, startTime: "10:00", endTime: "11:00" }], exceptions: [], declaredAt: new Date(), validUntil: new Date() });
  console.log("FAIL: HR wrote the INTERVIEWER's own availability doc — this should be blocked");
} catch (e) {
  console.log("PASS: HR blocked from writing someone else's availability (" + e.code + ")");
}
await signOut(auth);
process.exit(0);
