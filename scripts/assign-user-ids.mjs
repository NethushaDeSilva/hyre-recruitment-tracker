// ONE-TIME BACKFILL → give every users/{uid} document a readable User ID.
//
// The users collection is keyed by the Firebase Auth UID (login + every security
// rule reads get(users/{auth.uid})), so we CANNOT re-key the documents. Instead we
// stamp a readable `userId` FIELD on each one — e.g. USR-0001 — so Firestore looks
// clean and the same id shows in the app. This is DISTINCT from an employee id.
//
// Idempotent: docs that already have a userId are left untouched, numbers are never
// reissued, and counters/users.next is advanced past everything. Safe to re-run
// (e.g. after new accounts appear). Uses the Firebase ADMIN SDK (bypasses rules).
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/assign-user-ids.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// id helpers (mirror src/data/store.js)
const USER_SEQ_START = 1;
const makeUserId = (n) => `USR-${String(n).padStart(4, "0")}`;
const parseNum = (id) => { const m = /(\d+)\s*$/.exec(String(id || "")); return m ? Number(m[1]) : 0; };

// --- init admin ---
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(new URL("../serviceAccountKey.json", import.meta.url), "utf8"));
} catch {
  console.error("✗ Could not read serviceAccountKey.json (Console → Project settings → Service accounts → Generate new private key).");
  process.exit(1);
}
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function run() {
  const snap = await db.collection("users").get();
  const docs = snap.docs.map((d) => ({ ref: d.ref, id: d.id, data: d.data() }));

  // Never reuse a number: start past the counter AND past every userId already set.
  const cur = await db.doc("counters/users").get();
  let next = cur.exists ? Number(cur.data().next) || USER_SEQ_START : USER_SEQ_START;
  for (const { data } of docs) if (data.userId) next = Math.max(next, parseNum(data.userId) + 1);

  // Deterministic order: by email (case-insensitive), then document id.
  docs.sort((a, b) => {
    const ea = String(a.data.email || "").toLowerCase();
    const eb = String(b.data.email || "").toLowerCase();
    return ea === eb ? a.id.localeCompare(b.id) : ea.localeCompare(eb);
  });

  const batch = db.batch();
  const assigned = [];
  let already = 0;
  for (const { ref, id, data } of docs) {
    if (data.userId) { already++; continue; }
    const userId = makeUserId(next++);
    batch.set(ref, { userId }, { merge: true });
    assigned.push({ userId, role: data.role || "—", email: data.email || "(no email)", uid: id });
  }
  batch.set(db.doc("counters/users"), { next }, { merge: true });
  await batch.commit();

  console.log(`\n✓ User ID backfill complete.`);
  console.log(`  • Total users docs: ${docs.length}`);
  console.log(`  • Newly assigned:   ${assigned.length}`);
  for (const a of assigned) console.log(`      ${a.userId}  →  ${a.role.padEnd(11)}  ${a.email}   (uid ${a.uid})`);
  console.log(`  • Already had one:  ${already}`);
  console.log(`  • counters/users.next = ${next}\n`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
