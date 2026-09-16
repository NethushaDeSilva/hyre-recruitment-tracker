import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, addDoc, collection, updateDoc, getDoc, deleteField } from "firebase/firestore";

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

const INTERVIEWER_UID = "aLEDzPv0RuTGyjCqM3FYIHl0Sjt1"; // interviewer@hyre.app
const MANAGEMENT_UID = "VjbdlnkzlCR8h1PdOtOsWzyn9Wn1"; // management@hyre.app

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// try/finally is load-bearing here: several tests EXPECT fn() to throw
// (a correctly-denied write). Without finally, a thrown rejection skipped
// signOut() entirely, leaving that session active into the NEXT test and
// corrupting every subsequent assumption about "who is currently signed in."
async function asHR(fn) {
  await signInWithEmailAndPassword(auth, "hr@hyre.app", "hyre1234");
  try {
    return await fn();
  } finally {
    await signOut(auth);
    // A real interviewer always responds well after HR creates the request
    // (they have to receive a notification, open the app, navigate). This
    // delay just keeps the TEST from hitting a same-process session-switch
    // propagation race that never occurs in real usage.
    await sleep(1500);
  }
}
async function asInterviewer(fn) {
  await signInWithEmailAndPassword(auth, "interviewer@hyre.app", "hyre1234");
  try {
    return await fn();
  } finally {
    await signOut(auth);
  }
}

const baseDoc = (overrides = {}) => ({
  applicationId: "TEST-APP", positionId: "TEST-POS", stageId: "interview", candidateName: "Test Candidate",
  scheduledAt: new Date(), durationMs: 3600000,
  status: "pending_confirmation",
  rankedCandidates: [
    { uid: INTERVIEWER_UID, name: "Rehan Silva", rank: 1, reasons: ["test"] },
    { uid: MANAGEMENT_UID, name: "Dilani Perera", rank: 2, reasons: ["test"] },
  ],
  rankedInfo: {
    [INTERVIEWER_UID]: { nextUid: MANAGEMENT_UID },
    [MANAGEMENT_UID]: { nextUid: "" },
  },
  excludedCandidates: [], poolReason: null,
  interviewerId: INTERVIEWER_UID,
  requestedAt: new Date(), respondedBy: [],
  createdAt: new Date(), createdByUid: "test", createdByName: "Test",
  overriddenBy: null,
  ...overrides,
});

// --- test 1: legitimate accept ---
const id1 = await asHR(async () => (await addDoc(collection(db, "interviews"), baseDoc())).id);
try {
  await asInterviewer(async () => updateDoc(doc(db, "interviews", id1), { status: "confirmed" }));
  console.log("PASS: legitimate accept succeeded");
} catch (e) { console.log("FAIL: legitimate accept was blocked —", e.code); }

// --- test 2: legitimate decline-cascade (advances to the correct next person) ---
const id2 = await asHR(async () => (await addDoc(collection(db, "interviews"), baseDoc())).id);
try {
  await asInterviewer(async () => updateDoc(doc(db, "interviews", id2), {
    interviewerId: MANAGEMENT_UID, status: "pending_confirmation",
    requestedAt: new Date(), respondedBy: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", action: "declined", at: Date.now() }],
  }));
  console.log("PASS: legitimate decline-cascade to the correct next person succeeded");
} catch (e) { console.log("FAIL: legitimate decline-cascade was blocked —", e.code); }

// --- test 3: FORGED decline — tries to reassign to an arbitrary uid not the real nextUid ---
const id3 = await asHR(async () => (await addDoc(collection(db, "interviews"), baseDoc())).id);
try {
  await asInterviewer(async () => updateDoc(doc(db, "interviews", id3), {
    interviewerId: "some-friend-uid-not-in-ranking", status: "pending_confirmation",
    requestedAt: new Date(), respondedBy: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", action: "declined", at: Date.now() }],
  }));
  console.log("FAIL: forged reassignment to an arbitrary uid was ALLOWED — real security hole");
} catch (e) { console.log("PASS: forged reassignment correctly blocked —", e.code); }

// --- test 3b: forged decline that tries to STAY as themselves (skip the cascade, re-request self) ---
const id3b = await asHR(async () => (await addDoc(collection(db, "interviews"), baseDoc())).id);
try {
  await asInterviewer(async () => updateDoc(doc(db, "interviews", id3b), {
    interviewerId: INTERVIEWER_UID, status: "pending_confirmation",
    requestedAt: new Date(), respondedBy: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", action: "declined", at: Date.now() }],
  }));
  console.log("FAIL: interviewer reassigned the request to THEMSELVES while declining — real security hole");
} catch (e) { console.log("PASS: self-reassignment-while-declining correctly blocked —", e.code); }

// --- test 4: decline when ranking is exhausted (only 1 candidate, nextUid null) → needs_attention ---
// NOTE: this specific case intermittently reports DENIED when run chained
// after several prior sign-in/sign-out cycles in this one process — see
// verify-cascade-exhaustion-isolated.mjs, which runs the identical case in a
// fresh process and passes reliably (5/5). Treated as a same-process auth
// artifact, not a rules defect — do not "fix" this by loosening the rule.
const id4 = await asHR(async () => (await addDoc(collection(db, "interviews"), baseDoc({
  rankedCandidates: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", rank: 1, reasons: ["test"] }],
  rankedInfo: { [INTERVIEWER_UID]: { nextUid: "" } },
}))).id);
try {
  await asInterviewer(async () => updateDoc(doc(db, "interviews", id4), {
    interviewerId: "", status: "needs_attention",
    requestedAt: null, respondedBy: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", action: "declined", at: Date.now() }],
  }));
  const snap = await getDoc(doc(db, "interviews", id4));
  console.log("PASS: exhausted decline correctly reached needs_attention. status:", snap.data().status, "interviewerId:", JSON.stringify(snap.data().interviewerId));
} catch (e) { console.log("FAIL: legitimate exhaustion-to-needs_attention was blocked —", e.code); }

// --- test 4b: forged "exhaustion" when there WAS a real next person (tries to skip them) ---
const id4b = await asHR(async () => (await addDoc(collection(db, "interviews"), baseDoc())).id); // has a real nextUid = MANAGEMENT_UID
try {
  await asInterviewer(async () => updateDoc(doc(db, "interviews", id4b), {
    interviewerId: "", status: "needs_attention",
    requestedAt: null, respondedBy: [{ uid: INTERVIEWER_UID, name: "Rehan Silva", action: "declined", at: Date.now() }],
  }));
  console.log("FAIL: interviewer forged exhaustion, skipping a real next candidate — real security hole");
} catch (e) { console.log("PASS: forged exhaustion (skipping a real next candidate) correctly blocked —", e.code); }

// --- test 5: candidate (non-staff, non-interviewer) cannot touch it at all ---
const id5 = await asHR(async () => (await addDoc(collection(db, "interviews"), baseDoc())).id);
try {
  await signInWithEmailAndPassword(auth, "desilvanethusha+priya@gmail.com", "HyreSeed2026!");
  await updateDoc(doc(db, "interviews", id5), { status: "confirmed" });
  await signOut(auth);
  console.log("FAIL: an unrelated candidate wrote to an interview record — real security hole");
} catch (e) { await signOut(auth).catch(() => {}); console.log("PASS: unrelated candidate blocked —", e.code); }

process.exit(0);
