// TASK 3b — deletes ONLY interviews with positionId "TEST-POS" or "X". Nothing
// else. Requires Admin SDK: firestore.rules' interviews delete rule is
// `deletingPosition(resource.data.positionId)`, which requires
// positions/{positionId} to EXIST and be mid-deletion — TEST-POS and X were
// never real positions, so no client (not even HR) can satisfy that rule for
// these documents. Re-queries immediately before deleting so the scope is
// exactly what's live at delete time, not a stale list from an earlier read.
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ credential: cert(JSON.parse(readFileSync("serviceAccountKey.json", "utf8"))) });
const db = getFirestore();

const snap = await db.collection("interviews").get();
const targets = snap.docs.filter(d => d.data().positionId === "TEST-POS" || d.data().positionId === "X");
console.log(`Found ${targets.length} interviews with positionId TEST-POS or X (of ${snap.size} total).`);
if (targets.length !== 100) {
  console.log("*** Expected exactly 100 — count changed since 3a. Aborting, deleting nothing. ***");
  process.exit(1);
}

for (let i = 0; i < targets.length; i += 400) {
  const batch = db.batch();
  for (const d of targets.slice(i, i + 400)) batch.delete(d.ref);
  await batch.commit();
}
console.log(`Deleted ${targets.length} interview documents.`);

const after = await db.collection("interviews").get();
console.log(`interviews collection now has ${after.size} documents.`);
for (const d of after.docs) console.log(`  ${d.id}  positionId=${d.data().positionId}`);
