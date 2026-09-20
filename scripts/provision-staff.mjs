// One-off provisioner: write the staff role documents (users/{uid}.role) for the
// fixed HR / Interviewer / Management accounts.
//
// WHY THIS EXISTS: the locked-down Firestore rules trust users/{uid}.role for
// every permission, and DELIBERATELY forbid a user from granting themselves a
// staff role (otherwise anyone could sign in and become HR). So staff roles must
// be written out-of-band. This script signs in as each staff account and stamps
// the correct role on its profile doc.
//
// RUN THIS ONCE, BEFORE you deploy the locked rules (i.e. while Firestore is
// still in open/test mode) — after the lock lands, writing a staff role is
// (correctly) denied:
//
//   node scripts/provision-staff.mjs
//   firebase deploy --only firestore:rules
//
// Reads the public web config from .env.local (same keys the app uses). The
// staff password defaults to the demo password; override with HYRE_STAFF_PASSWORD.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// --- read .env.local (VITE_FIREBASE_* keys) ---
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

const PASSWORD = process.env.HYRE_STAFF_PASSWORD || "hyre1234";

// Mirrors ROLE_USERS in src/context/AuthContext.jsx.
const STAFF = [
  { email: "hr@hyre.app", role: "HR", displayName: "Priya Fernando", title: "HR Recruiter", avatarColor: "#1F3A5F" },
  { email: "interviewer@hyre.app", role: "Interviewer", displayName: "Rehan Silva", title: "Interviewer", avatarColor: "#4F46E5" },
  { email: "management@hyre.app", role: "Management", displayName: "Dilani Perera", title: "Manager", avatarColor: "#E0A422" },
];

let ok = 0;
for (const s of STAFF) {
  try {
    const cred = await signInWithEmailAndPassword(auth, s.email, PASSWORD);
    await setDoc(
      doc(db, "users", cred.user.uid),
      { displayName: s.displayName, title: s.title, role: s.role, avatarColor: s.avatarColor, photoURL: "", email: s.email },
      { merge: true }
    );
    console.log(`✓ provisioned ${s.email} → ${s.role}  (uid ${cred.user.uid})`);
    await signOut(auth);
    ok++;
  } catch (e) {
    console.error(`✗ ${s.email}: ${e.code || e.message}`);
  }
}
console.log(`\nDone: ${ok}/${STAFF.length} staff provisioned.`);
console.log("Next: firebase deploy --only firestore:rules");
process.exit(ok === STAFF.length ? 0 : 1);
