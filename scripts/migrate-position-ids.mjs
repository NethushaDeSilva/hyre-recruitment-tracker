// ONE-TIME MIGRATION → readable POSITION document ids.
//
// Before: /positions docs had ids like `pos_1` or a random `aB3xYz9…`.
// After:  the document id is a short code from the title + a per-code number, e.g.
//         "Network Engineer" → positions/NE-01 · "Regional manager" → positions/RM-01
//         (a second position of the same code becomes NE-02, and so on).
//
// Every candidate / employee that points at a position via `positionId` (and the
// `fromPositionId` a role-change carries) is updated to the new id, so nothing is
// orphaned. Idempotent: positions already at their computed id are skipped, and a
// re-run recomputes the same ids (numbering follows createdAt order). Uses the
// Firebase ADMIN SDK (bypasses the locked security rules).
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/migrate-position-ids.mjs
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// short code from a title (mirror of roleCode in src/data/store.js):
// initials of a multi-word title ("Senior Network Engineer" → "SNE"), or the first
// 4 letters of a single word ("Recruiter" → "RECR").
const positionCode = (title) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "POS";
  const alnum = (w) => w.replace(/[^A-Za-z0-9]/g, "");
  if (words.length === 1) return (alnum(words[0]).slice(0, 4) || "POS").toUpperCase();
  return (words.map((w) => alnum(w)[0] || "").join("").slice(0, 5) || "POS").toUpperCase();
};
const makePositionId = (title, seq) => `${positionCode(title)}-${String(seq).padStart(2, "0")}`;

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

// A tiny auto-flushing batch (Firestore caps a batch at 500 writes).
function makeBatcher(limit = 400) {
  let batch = db.batch();
  let n = 0;
  const pending = [];
  const maybeFlush = async () => { if (n >= limit) { pending.push(batch.commit()); batch = db.batch(); n = 0; } };
  return {
    set: async (ref, data, opts) => { opts ? batch.set(ref, data, opts) : batch.set(ref, data); n++; await maybeFlush(); },
    del: async (ref) => { batch.delete(ref); n++; await maybeFlush(); },
    commit: async () => { pending.push(batch.commit()); await Promise.all(pending); },
  };
}

async function run() {
  const posSnap = await db.collection("positions").get();
  // Number per code in createdAt order, so the mapping is stable across re-runs.
  const positions = posSnap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .sort((a, b) => (a.data.createdAt?.toMillis?.() || 0) - (b.data.createdAt?.toMillis?.() || 0));

  const seqByCode = new Map();
  const idMap = new Map(); // old id -> new id
  for (const p of positions) {
    const code = positionCode(p.data.title);
    const seq = (seqByCode.get(code) || 0) + 1;
    seqByCode.set(code, seq);
    idMap.set(p.id, makePositionId(p.data.title, seq));
  }

  const batcher = makeBatcher();
  const rekeyed = [];
  for (const p of positions) {
    const newId = idMap.get(p.id);
    if (newId === p.id) continue; // already final
    await batcher.set(db.collection("positions").doc(newId), p.data);
    await batcher.del(db.collection("positions").doc(p.id));
    rekeyed.push({ from: p.id, to: newId, title: p.data.title });
  }

  // Repoint every reference to a re-keyed position.
  let refUpdates = 0;
  for (const col of ["candidates", "employees"]) {
    const snap = await db.collection(col).get();
    for (const d of snap.docs) {
      const x = d.data();
      const patch = {};
      const np = idMap.get(x.positionId);
      if (np && np !== x.positionId) patch.positionId = np;
      const nf = idMap.get(x.fromPositionId);
      if (nf && nf !== x.fromPositionId) patch.fromPositionId = nf;
      if (Object.keys(patch).length) { await batcher.set(d.ref, patch, { merge: true }); refUpdates++; }
    }
  }

  await batcher.commit();

  console.log(`\n✓ Position id migration complete.`);
  console.log(`  • Re-keyed positions: ${rekeyed.length}`);
  for (const r of rekeyed) console.log(`      ${r.from}  →  positions/${r.to}   (${r.title})`);
  console.log(`  • Candidate/employee references repointed: ${refUpdates}`);
  if (!rekeyed.length) console.log(`  (every position was already at its readable id)`);
  console.log("");
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
