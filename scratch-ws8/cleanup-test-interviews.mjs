import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, collection, query, where, getDocs, updateDoc } from "firebase/firestore";

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

// interviews/{id} has allow delete: if false BY DESIGN (mirrors applications/
// employees — a record is history, never silently erased). Verification runs
// created several dummy TEST-APP interview docs, some left in
// pending_confirmation/confirmed status — which WOULD count toward a real
// person's live booking load in getBookingCounts() once the real UI is
// exercised. Can't delete them; marking them 'completed' removes them from
// that count (only pending_confirmation/confirmed are counted) without
// violating the immutability the rule enforces.
await signInWithEmailAndPassword(auth, "hr@hyre.app", "hyre1234");
const snap = await getDocs(query(collection(db, "interviews"), where("applicationId", "==", "TEST-APP")));
let n = 0;
for (const d of snap.docs) {
  if (["pending_confirmation", "confirmed"].includes(d.data().status)) {
    await updateDoc(d.ref, { status: "completed" });
    n++;
  }
}
console.log(`neutralized ${n} of ${snap.docs.length} TEST-APP interview docs (marked completed).`);
await signOut(auth);
process.exit(0);
