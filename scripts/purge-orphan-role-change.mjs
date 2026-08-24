// ONE-TIME CLEANUP → remove orphaned "role change" applications.
//
// The internal role-change feature was removed (being hired is now TERMINAL — a
// hired person can't hold another application). Any doc still sitting in
// /candidates that was a role-change REQUEST is now an invalid leftover: it makes a
// hired person show as "Applied" on a job, lists them in My Applications, and drops
// them into HR's pipeline board for a role they never really applied to. This
// deletes every such doc. Hired people live in /employees and are NEVER touched.
//
// Idempotent — re-running finds nothing once clean. Reports each doc before it goes.
// Uses the Firebase ADMIN SDK (bypasses the locked security rules).
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/purge-orphan-role-change.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url), "utf8"));
} catch {
  console.error("✗ Could not read serviceAccountKey.json (Console → Project settings → Service accounts → Generate new private key).");
  process.exit(1);
}
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// A doc is a role-change artifact if it was tagged as one OR carries the "from
// employee" context that only a role-change request ever set.
const isRoleChange = (x) =>
  x.source === "Role change" ||
  (typeof x.fromEmployeeId === "string" && x.fromEmployeeId.length > 0) ||
  (typeof x.fromRole === "string" && x.fromRole.length > 0);

async function run() {
  const snap = await db.collection("candidates").get();
  const doomed = snap.docs.filter((d) => isRoleChange(d.data()));

  console.log(`\nScanned ${snap.size} docs in /candidates. Found ${doomed.length} role-change artifact(s):`);
  for (const d of doomed) {
    const x = d.data();
    console.log(
      `   ✗ candidates/${d.id}  ·  ${x.name || "(no name)"}  →  ${x.appliedRole || x.positionId || "?"}` +
      `   [stage: ${x.stage || "-"}, source: ${x.source || "-"}, from: ${x.fromEmployeeId || x.fromRole || "-"}]`
    );
  }
  if (!doomed.length) {
    console.log("Nothing to remove — already clean.\n");
    return;
  }

  const batch = db.batch();
  for (const d of doomed) batch.delete(d.ref);
  await batch.commit();
  console.log(`\n✓ Deleted ${doomed.length} orphaned role-change application(s). Hired records in /employees were left untouched.\n`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
