// ONE-TIME MIGRATION → identity / application split (WS1: one person, many
// applications).
//
// Before: /candidates held one FULL document per APPLICATION (identity, CV,
//         profile and pipeline state all bundled together, keyed by a
//         readable CAND-#### id). Applying to a second vacancy meant a whole
//         new document — CV re-uploaded, profile re-parsed.
// After:  • /candidates holds ONE document per PERSON, keyed by their
//           lowercased email (candidates/jane@example.com) — email, phone,
//           CV, parsed profile. The readable CAND-#### number moves here too,
//           as a display field (not the document id).
//         • /applications holds one document per (person, vacancy) — stage,
//           history, comments, offer, rejection — referencing the identity by
//           `personId`.
//         • /employees documents are left in place (same collection, same
//           employeeId doc ids) but gain a `personId` field pointing at the
//           new identity doc, so a hired person's original CV/profile stays
//           reachable.
//
// Two applications from the SAME email are correctly split into two
// /applications docs sharing ONE /candidates identity — identity fields are
// merged across the group (most-recently-applied non-empty value wins).
//
// Idempotent guard: if /applications already has any documents, this assumes
// the migration already ran and exits without touching anything. Uses the
// Firebase ADMIN SDK (bypasses the locked security rules).
//
// SETUP:  serviceAccountKey.json in the project root.
// RUN:    node scripts/migrate-candidates-to-applications.mjs
//
// NOT RUN AGAINST PRODUCTION YET — review the console summary from a test
// project (or read this script closely) before pointing it at the real one.
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const fmtCandidateId = (n) => `CAND-${String(n).padStart(4, "0")}`;
const CANDIDATE_SEQ_START = 61;
const parseNum = (id) => { const m = /(\d+)\s*$/.exec(String(id || "")); return m ? Number(m[1]) : 0; };
const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// Fields that belong to the PERSON, not to one specific application — mirrors
// IDENTITY_FIELDS in src/data/store.js.
const IDENTITY_FIELDS = [
  "phone", "location", "fieldOfStudy", "highestQualification", "experience",
  "currentRole", "currentCompany", "skills", "linkedIn",
  "totalYearsExperience", "education", "experienceEntries", "certifications", "languages",
  "cvExtractedText", "emailFromCv", "emailMismatch",
  "cvFileName", "cvDataUrl", "cvSize", "submittedByUid",
];
const APPLICATION_FIELDS = [
  "positionId", "stage", "appliedRole", "appliedAt", "coverNote", "source",
  "needsReview", "cvValidation", "emailSubject", "offer", "rejection", "comments", "history",
];

const appliedAtMs = (x) => (x.appliedAt?.toMillis ? x.appliedAt.toMillis() : Number(x.appliedAt) || 0);

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

function makeBatcher(limit = 400) {
  let batch = db.batch();
  let n = 0;
  const pending = [];
  const maybeFlush = async () => { if (n >= limit) { pending.push(batch.commit()); batch = db.batch(); n = 0; } };
  return {
    set: async (ref, data, opts) => { opts ? batch.set(ref, data, opts) : batch.set(ref, data); n++; await maybeFlush(); },
    update: async (ref, data) => { batch.update(ref, data); n++; await maybeFlush(); },
    del: async (ref) => { batch.delete(ref); n++; await maybeFlush(); },
    commit: async () => { pending.push(batch.commit()); await Promise.all(pending); },
  };
}

async function run() {
  const alreadyMigrated = await db.collection("applications").limit(1).get();
  if (!alreadyMigrated.empty) {
    console.log("✗ /applications already has documents — assuming this migration already ran. Nothing done.");
    return;
  }

  const candSnap = await db.collection("candidates").get(); // OLD meaning: one per application
  const empSnap = await db.collection("employees").get();

  // Group old /candidates docs by email — each group becomes ONE new identity
  // + N application docs.
  const groups = new Map(); // emailKey -> [{ id, data }]
  let noEmailSeq = 0;
  for (const d of candSnap.docs) {
    const data = d.data();
    const key = normalizeEmail(data.email) || `__noemail_${noEmailSeq++}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: d.id, data });
  }

  const curCandCounter = await db.doc("counters/candidates").get();
  let nextCandNum = curCandCounter.exists ? Number(curCandCounter.data().next) || CANDIDATE_SEQ_START : CANDIDATE_SEQ_START;

  const batcher = makeBatcher();
  const identitiesWritten = [];
  const applicationsWritten = [];

  for (const [emailKey, docs] of groups) {
    // Oldest first, so identity fields are merged in application order — the
    // MOST RECENT non-empty value for a given field wins (mirrors upsertIdentityInTx).
    docs.sort((a, b) => appliedAtMs(a.data) - appliedAtMs(b.data));

    const candidateId = docs.map((d) => d.data.candidateId).find(Boolean) || fmtCandidateId(nextCandNum++);
    const identity = { email: emailKey, candidateId, name: "", avatarColor: "#1F3A5F" };
    for (const { data } of docs) {
      if (data.name) identity.name = data.name;
      if (data.avatarColor) identity.avatarColor = data.avatarColor;
      for (const f of IDENTITY_FIELDS) {
        const v = data[f];
        if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
        identity[f] = v;
      }
      identity.createdAt = identity.createdAt || data.appliedAt || Timestamp.now();
    }
    const identityRef = emailKey.startsWith("__noemail_") ? db.collection("candidates").doc() : db.collection("candidates").doc(emailKey);
    await batcher.set(identityRef, { ...identity, email: emailKey.startsWith("__noemail_") ? "" : emailKey });
    identitiesWritten.push({ personId: identityRef.id, candidateId, name: identity.name, applications: docs.length });

    for (const { id: oldId, data } of docs) {
      const appRef = db.collection("applications").doc();
      const appData = { personId: identityRef.id, email: emailKey.startsWith("__noemail_") ? "" : emailKey, submittedByUid: data.submittedByUid || "" };
      for (const f of APPLICATION_FIELDS) if (data[f] !== undefined) appData[f] = data[f];
      appData.stage = appData.stage || "applied";
      appData.history = Array.isArray(appData.history) ? appData.history : [];
      appData.comments = Array.isArray(appData.comments) ? appData.comments : [];
      appData.rejection = appData.rejection || null;
      appData.offer = appData.offer || null;
      await batcher.set(appRef, appData);
      await batcher.del(db.collection("candidates").doc(oldId));
      applicationsWritten.push({ from: oldId, to: appRef.id, personId: identityRef.id, positionId: data.positionId, stage: appData.stage });
    }
  }

  // Employees: leave the doc in place, just attach personId (create a fresh
  // identity if this hired person's email never appeared in old /candidates).
  const employeesPatched = [];
  for (const d of empSnap.docs) {
    const data = d.data();
    if (data.personId) continue; // already patched (safe to re-run this part)
    const emailKey = normalizeEmail(data.email);
    let identityRef;
    if (emailKey && groups.has(emailKey)) {
      identityRef = db.collection("candidates").doc(emailKey);
    } else if (emailKey) {
      identityRef = db.collection("candidates").doc(emailKey);
      const identity = { email: emailKey, candidateId: data.candidateId || fmtCandidateId(nextCandNum++), name: data.name || "", avatarColor: data.avatarColor || "#1F3A5F" };
      for (const f of IDENTITY_FIELDS) if (data[f] !== undefined && data[f] !== "" && !(Array.isArray(data[f]) && data[f].length === 0)) identity[f] = data[f];
      await batcher.set(identityRef, identity, { merge: true });
      identitiesWritten.push({ personId: identityRef.id, candidateId: identity.candidateId, name: identity.name, applications: 0 });
    } else {
      identityRef = db.collection("candidates").doc();
      await batcher.set(identityRef, { email: "", candidateId: data.candidateId || fmtCandidateId(nextCandNum++), name: data.name || "" });
    }
    await batcher.update(d.ref, { personId: identityRef.id });
    employeesPatched.push({ employeeId: d.id, personId: identityRef.id });
  }

  await batcher.set(db.doc("counters/candidates"), { next: nextCandNum }, { merge: true });
  await batcher.commit();

  console.log(`\n✓ Migration complete.`);
  console.log(`  • Identities written: ${identitiesWritten.length}`);
  for (const i of identitiesWritten) console.log(`      ${i.personId}  (${i.candidateId})  ${i.name || "(no name)"}  — ${i.applications} application(s)`);
  console.log(`  • Applications written: ${applicationsWritten.length}`);
  for (const a of applicationsWritten) console.log(`      candidates/${a.from}  →  applications/${a.to}  (${a.stage}, ${a.positionId})`);
  console.log(`  • Employees patched with personId: ${employeesPatched.length}`);
  for (const e of employeesPatched) console.log(`      employees/${e.employeeId}  →  personId ${e.personId}`);
  console.log(`  • counters/candidates.next = ${nextCandNum}\n`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
