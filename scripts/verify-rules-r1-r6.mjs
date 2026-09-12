// CLAUDE.md 6.7 — Role-based access tests (R1-R6, plus a regression check for
// a real bug found 2026-09-12, R7). Tests against FIRESTORE RULES via the
// real client SDK (never firebase-admin, which bypasses rules entirely),
// signed in as real accounts. "Test against Firestore rules, not the UI...
// attempt the read from the console and confirm the rule rejects it" — this
// is that attempt, automated so it re-runs after every rules change (6.7:
// "Automate what can be automated").
//
// Touches ZERO Firestore documents: every check here is a READ (R1-R6 read
// existing real project data or a deliberately nonexistent path for R7;
// nothing is ever written). Sign-in uses a throwaway Auth account deleted at
// the end of the run — a candidate identity is only ever created in
// Firestore when someone actually applies, which this script never does.
//
//   node scripts/verify-rules-r1-r6.mjs
//
// Exits 0 if every check matches its expected result, 1 otherwise.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import {
  getAuth, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword, deleteUser,
} from "firebase/auth";
import { getFirestore, doc, getDoc, getDocs, collection, query } from "firebase/firestore";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
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

const HR_PASSWORD = process.env.HYRE_STAFF_PASSWORD || "hyre1234";

// Real, live project data these checks read against. If any of these ids stop
// existing, swap in another real doc of the same status/kind — never a
// fabricated id, since a permission-denied on a nonexistent doc and one on a
// real doc are indistinguishable from the client's point of view anyway.
const REAL_POSITION_OPEN = "BD-01";
const REAL_POSITION_CLOSED = "NE-01";
const REAL_OTHER_CANDIDATE = "kodithuwakusamantha@gmail.com";
const REAL_APPLICATION = "6H9281nZ57kSN51JqeUQ";

const results = [];
function record(id, desc, expected, actual, detail = "") {
  results.push({ id, desc, expected, actual, pass: expected === actual, detail });
}

async function expectDenied(fn) {
  try {
    await fn();
    return "allowed";
  } catch (e) {
    return e.code === "permission-denied" ? "denied" : `error:${e.code || e.message}`;
  }
}

// --- R5: signed out ---
const r5 = await expectDenied(() => getDocs(collection(db, "positions")));
record("R5", "Signed out: open any HR route directly (read positions unauthenticated)", "denied", r5);

// --- R4: HR full access ---
await signInWithEmailAndPassword(auth, "hr@hyre.app", HR_PASSWORD);
record("R4a", "HR: read all positions", "allowed", await expectDenied(() => getDocs(collection(db, "positions"))));
record("R4b", "HR: read all applications", "allowed", await expectDenied(() => getDocs(collection(db, "applications"))));
record("R4c", "HR: read all applicationScores", "allowed", await expectDenied(() => getDocs(collection(db, "applicationScores"))));
await signOut(auth);

// --- throwaway candidate account (Auth only — zero Firestore writes) ---
const testEmail = `zz.rulestest.${Date.now()}@example.test`;
const testPassword = "RulesTest_" + Math.random().toString(36).slice(2);
await createUserWithEmailAndPassword(auth, testEmail, testPassword);

record(
  "R1",
  "Candidate: open HR pipeline (unfiltered applications query)",
  "denied",
  await expectDenied(() => getDocs(query(collection(db, "applications"))))
);
record(
  "R2",
  "Candidate: read another candidate's record",
  "denied",
  await expectDenied(() => getDoc(doc(db, "candidates", REAL_OTHER_CANDIDATE))),
  `target: candidates/${REAL_OTHER_CANDIDATE}`
);
record(
  "R3",
  "Candidate: read own/any match score",
  "denied",
  await expectDenied(() => getDoc(doc(db, "applicationScores", REAL_APPLICATION))),
  `target: applicationScores/${REAL_APPLICATION}`
);
// Regression check, not one of the numbered R1-R6 tests: a first-time
// applicant's own upsertIdentityInTx() (src/data/store.js) does a tx.get()
// on their OWN candidates/{email} doc BEFORE it exists (check-before-create).
// Found live 2026-09-12 — the read rule dereferenced resource.data on a null
// resource for a nonexistent doc, which Firestore treats as denied, blocking
// every brand-new candidate's very first application outright. Existing
// candidate docs never exercised this path (created by staff, whose
// isStaff() branch never touches `resource`, or already existed by the time
// this check was added) — that's exactly why it went unnoticed until a real
// first-time applicant hit it.
record(
  "R7",
  "Candidate: read own identity doc before it exists (check-before-create)",
  "allowed",
  await expectDenied(() => getDoc(doc(db, "candidates", testEmail))),
  `target: candidates/${testEmail} (deliberately does not exist)`
);
record(
  "R6",
  "Any role: read a draft/closed vacancy directly by id",
  "denied",
  await expectDenied(() => getDoc(doc(db, "positions", REAL_POSITION_CLOSED))),
  `target: positions/${REAL_POSITION_CLOSED} (status=Closed)`
);
// Sanity check, not a numbered test: the same candidate reading an OPEN
// position must still work — proves R6's rule doesn't over-block public browsing.
record(
  "R6-sanity",
  "Candidate: read an OPEN vacancy directly by id (must stay allowed)",
  "allowed",
  await expectDenied(() => getDoc(doc(db, "positions", REAL_POSITION_OPEN))),
  `target: positions/${REAL_POSITION_OPEN} (status=Open)`
);

await deleteUser(auth.currentUser);

console.log("=== R1-R6 role-based access tests (CLAUDE.md 6.7) ===\n");
for (const r of results) {
  console.log(`[${r.pass ? "PASS" : "FAIL"}] ${r.id} — ${r.desc}: expected ${r.expected}, got ${r.actual}${r.detail ? "  (" + r.detail + ")" : ""}`);
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
process.exit(failed.length ? 1 : 0);
