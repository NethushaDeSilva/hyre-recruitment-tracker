// Create company staff accounts in the NEW email scheme — both the Firebase Auth
// login and the Firestore users/{uid} role document.
//
//   HR:           name@hyre.com
//   Interviewer:  name.interviewer@hyre.com
//   Management:   name.management@hyre.com
//
// Add as many people per role as you like in the STAFF list below, then run:
//
//   node scripts/create-staff.mjs
//
// IMPORTANT — run this while Firestore is still OPEN, BEFORE deploying the locked
// rules (the rules forbid self-assigning a staff role, so staff docs are written
// out-of-band here). Existing accounts are updated in place (signed in), new ones
// are created.
//
// These are REAL working accounts (separate from the easy hyre.app demo chips on
// the login page). Passwords are unique + typeable but still somewhat patterned —
// fine for the assignment demo; rotate them for anything real.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// ---------------------------------------------------------------------------
// EDIT ME: the staff to create. role must be "HR" | "Interviewer" | "Management",
// and the email must match the scheme for that role.
// ---------------------------------------------------------------------------
const STAFF = [
  // The three known team members
  { email: "priya@hyre.com",               role: "HR",          displayName: "Priya Fernando",  title: "HR Recruiter", avatarColor: "#1F3A5F", password: "Priya-Hyre-4821" },
  { email: "rehan.interviewer@hyre.com",   role: "Interviewer", displayName: "Rehan Silva",     title: "Interviewer",  avatarColor: "#4F46E5", password: "Rehan-Hyre-2754" },
  { email: "dilani.management@hyre.com",   role: "Management",  displayName: "Dilani Perera",   title: "Manager",      avatarColor: "#E0A422", password: "Dilani-Hyre-9036" },
  // A few more, to show several people can share a role
  { email: "nimal@hyre.com",               role: "HR",          displayName: "Nimal Perera",    title: "HR Recruiter", avatarColor: "#2563EB", password: "Nimal-Hyre-6390" },
  { email: "ishara.interviewer@hyre.com",  role: "Interviewer", displayName: "Ishara Wickrama", title: "Interviewer",  avatarColor: "#0EA5E9", password: "Ishara-Hyre-5108" },
  { email: "sunil.management@hyre.com",     role: "Management",  displayName: "Sunil Bandara",   title: "Supervisor",   avatarColor: "#DB2777", password: "Sunil-Hyre-1472" },
];

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

let ok = 0;
for (const s of STAFF) {
  try {
    let uid;
    try {
      const cred = await createUserWithEmailAndPassword(auth, s.email, s.password);
      uid = cred.user.uid;
      console.log(`＋ created ${s.email}`);
    } catch (e) {
      if (e.code === "auth/email-already-in-use") {
        const cred = await signInWithEmailAndPassword(auth, s.email, s.password);
        uid = cred.user.uid;
        console.log(`↻ exists, updating ${s.email}`);
      } else {
        throw e;
      }
    }
    await setDoc(
      doc(db, "users", uid),
      { displayName: s.displayName, title: s.title, role: s.role, avatarColor: s.avatarColor, photoURL: "", email: s.email },
      { merge: true }
    );
    console.log(`  ✓ ${s.email} → ${s.role}  (uid ${uid})`);
    await signOut(auth);
    ok++;
  } catch (e) {
    console.error(`  ✗ ${s.email}: ${e.code || e.message}`);
  }
}
console.log(`\nDone: ${ok}/${STAFF.length} staff provisioned.`);
console.log("Reminder: deploy the locked rules afterwards → firebase deploy --only firestore:rules");
process.exit(ok === STAFF.length ? 0 : 1);
