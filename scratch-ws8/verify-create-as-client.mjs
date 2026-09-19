// TASK 2c — test position creation AS A CLIENT, against the DEPLOYED rules,
// not the Admin SDK. Imports allocatePosition() directly from
// src/lib/positionPersistence.js (the exact function addPosition() calls in
// store.js) so this is the real production code path, not a re-implementation.
// Signs in as a real HR account via the client auth SDK — no service account.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, deleteField } from "firebase/firestore";
import { allocatePosition, removePersistedPosition } from "../src/lib/positionPersistence.js";
import { positionCode } from "../src/lib/positionLifecycle.js";

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

console.log(`Project: ${env.VITE_FIREBASE_PROJECT_ID}`);
await signInWithEmailAndPassword(auth, "hr@hyre.app", "hyre1234");
console.log("Signed in as hr@hyre.app (client auth SDK, real HR account, not Admin SDK).\n");

const THROWAWAY_TITLE = "Zz Verification Probe";
const code = positionCode(THROWAWAY_TITLE);
console.log(`Throwaway title: "${THROWAWAY_TITLE}" -> code "${code}" (fresh prefix, no collision with BD/RM/HE/NE/SFD/SNE).\n`);

let created = null;
console.log("=== 2c: creating a position via allocatePosition(), the exact function addPosition() calls ===");
try {
  created = await allocatePosition(db, {
    title: THROWAWAY_TITLE, department: "Engineering", description: "throwaway - verification only",
    status: "Open", stages: ["applied", "screening", "interview", "final"],
    minQualification: "", requirements: { requiredSkills: ["Test"], minYearsExperience: 0, niceToHave: [], requiredQualification: null },
    shortlistThreshold: 0, salaryRange: "", closesAt: null, headcount: 1, hiredCount: 0,
    hiringManagerUid: "", hiringManagerName: "", createdByUid: "verify-script", createdByName: "Verification Script",
    createdAt: new Date(),
  });
  console.log(`SUCCESS. Created ${created.id} (identityCode=${created.identityCode}, identitySequence=${created.identitySequence})`);
} catch (e) {
  console.log(`FAILED: code=${e.code || "(none)"} message=${e.message}`);
  console.log("Full error:", e);
}

if (created) {
  const posSnap = await getDoc(doc(db, "positions", created.id));
  const archSnap = await getDoc(doc(db, "positionArchive", created.id));
  console.log(`\n  positions/${created.id} exists=${posSnap.exists()} data=`, posSnap.exists() ? posSnap.data() : null);
  console.log(`  positionArchive/${created.id} exists=${archSnap.exists()} recordState=${archSnap.exists() ? archSnap.data().recordState : "-"}`);

  console.log(`\n=== 2e: deleting ${created.id} via removePersistedPosition(), the exact function deletePosition() calls ===`);
  try {
    await removePersistedPosition(db, created.id);
    console.log("Delete SUCCEEDED.");
  } catch (e) {
    console.log(`Delete FAILED: code=${e.code || "(none)"} message=${e.message}`);
  }
  const posAfter = await getDoc(doc(db, "positions", created.id));
  const archAfter = await getDoc(doc(db, "positionArchive", created.id));
  console.log(`  positions/${created.id} exists=${posAfter.exists()} (expect false)`);
  console.log(`  positionArchive/${created.id} recordState=${archAfter.exists() ? archAfter.data().recordState : "MISSING"} (expect Deleted)`);

  console.log(`\n=== recreating the SAME title again — must get the NEXT sequence, not the same ID ===`);
  let recreated = null;
  try {
    recreated = await allocatePosition(db, {
      title: THROWAWAY_TITLE, department: "Engineering", description: "throwaway - verification only, second creation",
      status: "Open", stages: ["applied", "screening", "interview", "final"],
      minQualification: "", requirements: { requiredSkills: ["Test"], minYearsExperience: 0, niceToHave: [], requiredQualification: null },
      shortlistThreshold: 0, salaryRange: "", closesAt: null, headcount: 1, hiredCount: 0,
      hiringManagerUid: "", hiringManagerName: "", createdByUid: "verify-script", createdByName: "Verification Script",
      createdAt: new Date(),
    });
    console.log(`SUCCESS. Recreated as ${recreated.id} (identitySequence=${recreated.identitySequence}) -- ${recreated.id === created.id ? "*** SAME ID -- REUSE BUG ***" : "different ID, as required"}`);
  } catch (e) {
    console.log(`Recreate FAILED: code=${e.code || "(none)"} message=${e.message}`);
  }

  if (recreated) {
    console.log(`\n=== cleaning up the second throwaway (${recreated.id}) too ===`);
    try {
      await removePersistedPosition(db, recreated.id);
      console.log("Delete SUCCEEDED.");
    } catch (e) {
      console.log(`Delete FAILED: code=${e.code || "(none)"} message=${e.message}`);
    }
  }
}

await signOut(auth);
process.exit(0);
