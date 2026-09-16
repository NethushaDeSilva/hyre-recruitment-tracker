// Standalone confirmation of the "ranking exhausted -> needs_attention" branch
// of the interviews cascade-decline rule, run in its own fresh process.
//
// In verify-cascade-rules.mjs's chained sequence (many rapid Firebase Auth
// session switches inside one long-lived Node process), this exact case
// intermittently came back permission-denied even though every other case in
// that sequence — including the adversarial/forgery ones — passed reliably.
// Run here in isolation (nothing else touching `auth` before it), it passes
// consistently (5/5 in the session that found this). That points at a
// same-process auth-channel artifact from rapid re-authentication, not a
// rules defect — a real interviewer's browser session is never chained like
// this. Kept as a separate script specifically so this one case has clean,
// repeatable evidence independent of that artifact.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, addDoc, collection, updateDoc } from "firebase/firestore";

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
const INTERVIEWER_UID = "aLEDzPv0RuTGyjCqM3FYIHl0Sjt1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await signInWithEmailAndPassword(auth, "hr@hyre.app", "hyre1234");
const id = (await addDoc(collection(db, "interviews"), {
  applicationId: "TEST-APP", positionId: "TEST-POS", stageId: "interview", candidateName: "Test Candidate",
  scheduledAt: new Date(), durationMs: 3600000, status: "pending_confirmation",
  rankedCandidates: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", rank: 1, reasons: ["test"] }],
  rankedInfo: { [INTERVIEWER_UID]: { nextUid: "" } },
  excludedCandidates: [], poolReason: null,
  interviewerId: INTERVIEWER_UID,
  requestedAt: new Date(), respondedBy: [],
  createdAt: new Date(), createdByUid: "test", createdByName: "Test",
  overriddenBy: null,
})).id;
await signOut(auth);
await sleep(1500);

await signInWithEmailAndPassword(auth, "interviewer@hyre.app", "hyre1234");
try {
  await updateDoc(doc(db, "interviews", id), {
    interviewerId: "", status: "needs_attention",
    requestedAt: null, respondedBy: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", action: "declined", at: Date.now() }],
  });
  console.log("ALLOWED");
} catch (e) {
  console.log("DENIED", e.code);
}
await signOut(auth);
process.exit(0);
