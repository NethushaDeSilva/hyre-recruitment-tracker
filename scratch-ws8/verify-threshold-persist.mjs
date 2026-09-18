// One-off verification: does updatePositionThreshold() (store.js) actually
// persist to Firestore and survive a fresh read (= what a page reload does)?
// Writes a test value, reads it back via a SEPARATE getDoc call (not the
// same object), then restores the original value.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, updateDoc, getDoc, collection, getDocs, limit, query } from "firebase/firestore";

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

await signInWithEmailAndPassword(auth, "hr@hyre.app", "hyre1234");

const snap = await getDocs(query(collection(db, "positions"), limit(1)));
if (snap.empty) {
  console.log("No positions exist to test against.");
  await signOut(auth);
  process.exit(1);
}
const posDoc = snap.docs[0];
const posId = posDoc.id;
const original = posDoc.data().shortlistThreshold ?? 0;
const testValue = original === 42 ? 43 : 42; // guaranteed different from original

console.log(`Testing position ${posId}. Original shortlistThreshold: ${original}`);

// Exactly what updatePositionThreshold() does.
await updateDoc(doc(db, "positions", posId), { shortlistThreshold: testValue });

// A FRESH read — same as what a page reload does (re-fetch from Firestore,
// not trust in-memory state).
const readBack = await getDoc(doc(db, "positions", posId));
const persistedValue = readBack.data().shortlistThreshold;

console.log(`Wrote ${testValue}, read back ${persistedValue} on a fresh getDoc.`);
console.log(persistedValue === testValue ? "PASS: value persisted and survives a fresh read." : "FAIL: value did not persist correctly.");

// Restore original — this script must not leave real data changed.
await updateDoc(doc(db, "positions", posId), { shortlistThreshold: original });
const restored = await getDoc(doc(db, "positions", posId));
console.log(`Restored to ${restored.data().shortlistThreshold} (original was ${original}).`);

await signOut(auth);
process.exit(0);
