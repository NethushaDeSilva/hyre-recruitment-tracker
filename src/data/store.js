// THE single data seam for Hyre — the one module the whole UI talks to for data.
// When Firebase is configured, positions & candidates live in Firestore and are
// kept in sync with real-time onSnapshot listeners; mutations write to Firestore.
// When keys are absent, it falls back to in-memory seed data so the app still runs.
// Either way the UI only ever calls useHyreData() + the helper functions below.
import { useSyncExternalStore } from "react";
import { collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, arrayUnion, arrayRemove, runTransaction } from "firebase/firestore";
import { db, firebaseReady } from "@/firebase/config";
import { DEFAULT_PIPELINE, JUNIOR_PIPELINE, nextStage, registerStageMeta } from "@/lib/stages";
import { departmentCode } from "@/lib/departments";
import { isOpenNow } from "@/lib/positions";

const AVATAR_COLORS = ["#2563EB", "#4F46E5", "#E0A422", "#16A34A", "#DC2626", "#0EA5E9", "#DB2777", "#1F3A5F", "#64748B"];
function pickColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
let idCounter = 100;
const uid = (prefix) => `${prefix}_${++idCounter}`;

// --- unique, sequential CANDIDATE IDs (CAND-0001, CAND-0002, …) ---------------
// A candidate can only read their OWN rows (security rules), so they can't count
// how many candidates exist to know they're "the 61st". We hand out unique numbers
// from a single counter document (counters/candidates.next) inside a transaction,
// so two people applying at the same moment can never get the same number.
// 60 candidates are seeded (CAND-0001…0060), so the sequence starts at 61; if the
// counter doc doesn't exist yet, the first application creates it.
const CANDIDATE_SEQ_START = 61;
const fmtCandidateId = (n) => `CAND-${String(n).padStart(4, "0")}`;
const parseCandNum = (id) => { const m = /(\d+)\s*$/.exec(String(id || "")); return m ? Number(m[1]) : 0; };

// --- readable USER ids (system accounts) --------------------------------------
// Every person WITH a users/{uid} doc — i.e. STAFF (HR / Interviewer / Management)
// — carries a readable USER ID, e.g. USR-0001. This is DISTINCT from an employee
// ID: a User ID identifies someone as a system user; an employee ID is only for
// people HIRED into the company through the pipeline. The users doc stays keyed by
// the Firebase Auth uid (login + every security rule reads get(users/{auth.uid})),
// so the User ID is a FIELD on the doc, never its key. Numbers come from
// counters/users.next with the same transaction guarantee as candidate/employee ids.
const USER_SEQ_START = 1;
export const makeUserId = (n) => `USR-${String(n).padStart(4, "0")}`;

// --- unique EMPLOYEE IDs issued ON HIRE ---------------------------------------
// The moment a candidate is moved to the "hired" stage they stop being a
// candidate and become an EMPLOYEE — issued an employee ID built from THREE parts:
//     {DEPT}-{ROLE}-{NUMBER}      e.g.  SE-SNE-0001
//   • DEPT   = the position's department short code   (departmentCode → "SE")
//   • ROLE   = an abbreviation of the job title       (initials → "SNE")
//   • NUMBER = a global, monotonic employee number    (counters/employees.next)
// The number is claimed in a transaction (same guarantee as candidate IDs) so two
// hires at the same instant can never collide. The whole thing is DERIVED from the
// position + counter, so the format can change without touching stored data.
const EMPLOYEE_SEQ_START = 1;
const fmtEmployeeNum = (n) => String(n).padStart(4, "0");
// Abbreviate a job title to a compact code: initials of a multi-word title
// ("Senior Network Engineer" → "SNE"), or the first 4 letters of a single word
// ("Recruiter" → "RECR").
const roleCode = (title) => {
  const words = String(title || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "EMP";
  const alnum = (w) => w.replace(/[^A-Za-z0-9]/g, "");
  if (words.length === 1) return (alnum(words[0]).slice(0, 4) || "EMP").toUpperCase();
  return (words.map((w) => alnum(w)[0] || "").join("").slice(0, 5) || "EMP").toUpperCase();
};
const makeEmployeeId = (deptName, title, n) =>
  `${departmentCode(deptName)}-${roleCode(title)}-${fmtEmployeeNum(n)}`;

// --- readable POSITION ids -----------------------------------------------------
// A vacancy's document id is a short code from its title + a per-code sequence,
// e.g. "Network Engineer" → NE-01, a second one → NE-02, "Regional manager" → RM-01.
// Only staff create positions and they can read every position, so the next number
// is derived from what's already there — no counter needed.
const positionCode = (title) => roleCode(title);
const makePositionId = (title, seq) => `${positionCode(title)}-${String(seq).padStart(2, "0")}`;

const at = (iso) => new Date(iso).getTime();
// Firestore Timestamp | number -> milliseconds
const ms = (v) => (v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : Date.now());

// --- seed data ---
const SEED_POSITIONS = [
  { id: "pos_1", title: "Senior Frontend Developer", department: "Engineering", description: "Build and own our customer-facing React app.", status: "Open", stages: DEFAULT_PIPELINE, minQualification: "Bachelor's Degree", createdAt: at("2026-07-12") },
  { id: "pos_2", title: "HR Executive", department: "People", description: "Support recruitment and employee operations.", status: "Open", stages: JUNIOR_PIPELINE, minQualification: "Diploma", createdAt: at("2026-07-05") },
  { id: "pos_3", title: "Sales Manager", department: "Commercial", description: "Lead the regional sales team and targets.", status: "Open", stages: DEFAULT_PIPELINE, minQualification: "GCE A/L", createdAt: at("2026-07-01") },
  { id: "pos_4", title: "QA Engineer", department: "Engineering", description: "Own manual and automated testing for releases.", status: "Open", stages: DEFAULT_PIPELINE, minQualification: "", createdAt: at("2026-06-28") },
  { id: "pos_5", title: "UI/UX Designer", department: "Design", description: "Design flows and interfaces across the product.", status: "Closed", stages: JUNIOR_PIPELINE, minQualification: "", createdAt: at("2026-06-20") },
];
// Some seed candidates carry a highestQualification + experience so the
// eligibility flags and filters have realistic data to show in the demo.
const SEED_CANDIDATES = [
  { id: "cand_1", name: "Aisha Khan", email: "aisha.khan@email.com", positionId: "pos_1", stage: "applied", appliedRole: "UI Engineer", avatarColor: "#2563EB", highestQualification: "Bachelor's Degree", experience: "3–5 years", appliedAt: at("2026-07-16") },
  { id: "cand_2", name: "Marcus Bell", email: "marcus.bell@email.com", positionId: "pos_1", stage: "applied", appliedRole: "Frontend Developer", avatarColor: "#E0A422", highestQualification: "GCE A/L", experience: "1–3 years", appliedAt: at("2026-07-16") },
  { id: "cand_3", name: "Priya Nair", email: "priya.nair@email.com", positionId: "pos_1", stage: "applied", appliedRole: "React Developer", avatarColor: "#16A34A", highestQualification: "Master's Degree", experience: "5–10 years", appliedAt: at("2026-07-15") },
  { id: "cand_4", name: "Daniel Osei", email: "daniel.osei@email.com", positionId: "pos_1", stage: "screening", appliedRole: "Frontend Developer", avatarColor: "#4F46E5", highestQualification: "Bachelor's Degree", experience: "3–5 years", appliedAt: at("2026-07-13") },
  { id: "cand_5", name: "Lucia Romano", email: "lucia.romano@email.com", positionId: "pos_1", stage: "screening", appliedRole: "UI Engineer", avatarColor: "#DC2626", highestQualification: "Diploma", experience: "1–3 years", appliedAt: at("2026-07-12") },
  { id: "cand_6", name: "Kenji Tanaka", email: "kenji.tanaka@email.com", positionId: "pos_1", stage: "interview", appliedRole: "Senior Frontend", avatarColor: "#0EA5E9", highestQualification: "Bachelor's Degree", experience: "5–10 years", appliedAt: at("2026-07-08") },
  { id: "cand_7", name: "Sofia Almeida", email: "sofia.almeida@email.com", positionId: "pos_1", stage: "interview", appliedRole: "React Developer", avatarColor: "#DB2777", highestQualification: "Bachelor's Degree", experience: "3–5 years", appliedAt: at("2026-07-08") },
  { id: "cand_8", name: "Grace Miller", email: "grace.miller@email.com", positionId: "pos_1", stage: "final", appliedRole: "Senior Frontend", avatarColor: "#1F3A5F", highestQualification: "Master's Degree", experience: "10+ years", appliedAt: at("2026-07-04") },
  { id: "cand_9", name: "Nadia Hassan", email: "nadia.hassan@email.com", positionId: "pos_1", stage: "hired", appliedRole: "Frontend Developer", avatarColor: "#16A34A", highestQualification: "Bachelor's Degree", experience: "5–10 years", appliedAt: at("2026-06-30") },
  { id: "cand_10", name: "Omar Faruk", email: "omar.faruk@email.com", positionId: "pos_2", stage: "applied", appliedRole: "HR Associate", avatarColor: "#0EA5E9", highestQualification: "GCE A/L", experience: "Less than 1 year", appliedAt: at("2026-07-14") },
  { id: "cand_11", name: "Chloe Adams", email: "chloe.adams@email.com", positionId: "pos_2", stage: "screening", appliedRole: "HR Executive", avatarColor: "#DB2777", highestQualification: "Higher Diploma", experience: "1–3 years", appliedAt: at("2026-07-11") },
  { id: "cand_12", name: "Ibrahim Sy", email: "ibrahim.sy@email.com", positionId: "pos_2", stage: "interview", appliedRole: "People Ops", avatarColor: "#2563EB", highestQualification: "Bachelor's Degree", experience: "3–5 years", appliedAt: at("2026-07-09") },
  { id: "cand_13", name: "Ravi Menon", email: "ravi.menon@email.com", positionId: "pos_3", stage: "applied", appliedRole: "Account Manager", avatarColor: "#DC2626", highestQualification: "GCE O/L", experience: "1–3 years", appliedAt: at("2026-07-15") },
  { id: "cand_14", name: "Elena Petrova", email: "elena.petrova@email.com", positionId: "pos_3", stage: "hired", appliedRole: "Sales Lead", avatarColor: "#16A34A", highestQualification: "Bachelor's Degree", experience: "10+ years", appliedAt: at("2026-06-29") },
  { id: "cand_15", name: "Hannah Cole", email: "hannah.cole@email.com", positionId: "pos_5", stage: "hired", appliedRole: "Product Designer", avatarColor: "#4F46E5", highestQualification: "Bachelor's Degree", experience: "5–10 years", appliedAt: at("2026-06-18") },
];

// --- reactive snapshot store ---
let positions = firebaseReady ? [] : SEED_POSITIONS;
let candidates = firebaseReady ? [] : SEED_CANDIDATES;
let employees = []; // hired people — Firebase: the /employees collection; mock: derived below
let loading = firebaseReady; // true until the first Firestore data arrives
let snapshot = { positions, candidates, employees, loading };
const listeners = new Set();
function commit() {
  snapshot = {
    positions,
    candidates,
    // In mock mode there is no /employees collection — derive the hired subset so
    // the Employees page has data either way.
    employees: firebaseReady ? employees : candidates.filter((c) => c.stage === "hired"),
    loading,
  };
  listeners.forEach((l) => l());
}
function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return snapshot;
}
/** Subscribe a component to the store. Returns { positions, candidates, loading }. */
export function useHyreData() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

const mapPosition = (d) => {
  const x = d.data();
  return {
    id: d.id, title: x.title, department: x.department, description: x.description || "",
    status: x.status || "Open", stages: x.stages || DEFAULT_PIPELINE, minQualification: x.minQualification || "",
    // mandatory auto-close date (ms) — the vacancy closes itself once this passes
    closesAt: x.closesAt ? ms(x.closesAt) : 0,
    // custom-stage metadata + per-stage staff assignments (both optional)
    stageMeta: x.stageMeta || {},
    stageAssignees: x.stageAssignees || {},
    // who opened the vacancy (for "management sees positions they opened")
    createdByUid: x.createdByUid || "",
    createdByName: x.createdByName || "",
    createdAt: ms(x.createdAt),
  };
};

// Publish every position's custom-stage metadata into the stages registry, so
// global consumers (badges, tables, the candidate tracker) can render a custom
// stage's label without the position in scope.
const publishStageMeta = (list) => {
  for (const p of list) if (p.stageMeta) registerStageMeta(p.stageMeta);
};
const mapCandidate = (d) => {
  const x = d.data();
  return {
    id: d.id,
    candidateId: x.candidateId || "", // human-readable candidate ID (e.g. CAND-0007)
    // --- issued ON HIRE: a candidate who reached "hired" becomes an employee ---
    employeeId: x.employeeId || "",     // e.g. SE-SNE-0001 (dept · role · number)
    employeeDept: x.employeeDept || "", // department name, snapshotted at hire
    employeeRole: x.employeeRole || "", // job title, snapshotted at hire
    hiredAt: x.hiredAt ? ms(x.hiredAt) : 0,
    name: x.name,
    email: x.email || "",
    positionId: x.positionId,
    stage: x.stage || "applied",
    appliedRole: x.appliedRole || "",
    avatarColor: x.avatarColor || "#1F3A5F",
    appliedAt: ms(x.appliedAt),
    // --- application / CV profile (optional; present for self-applied candidates) ---
    phone: x.phone || "",
    location: x.location || "",
    highestQualification: x.highestQualification || "",
    fieldOfStudy: x.fieldOfStudy || "",
    experience: x.experience || "",
    currentRole: x.currentRole || "",
    currentCompany: x.currentCompany || "",
    skills: x.skills || "",
    linkedIn: x.linkedIn || "",
    coverNote: x.coverNote || "",
    cvFileName: x.cvFileName || "",
    cvDataUrl: x.cvDataUrl || "",
    cvSize: x.cvSize || 0,
    source: x.source || "Added by HR",
    submittedByUid: x.submittedByUid || "",
    // internal ROLE-CHANGE context (set when a hired employee requests another role)
    fromRole: x.fromRole || "",           // their current job role, e.g. "Network Engineer"
    fromEmployeeId: x.fromEmployeeId || "", // their current employee ID, e.g. SE-SNE-0001
    fromPositionId: x.fromPositionId || "", // the position they currently hold
    // --- pipeline history + rejection record (talent pool) ---
    history: Array.isArray(x.history) ? x.history : [],
    rejection: x.rejection || null, // { reason, comment, stage, at, by, byRole }
    // reviewer comments passed down the pipeline (HR → interviewer → management)
    comments: Array.isArray(x.comments) ? x.comments : [], // { text, by, byRole, stage, at }
  };
};

// --- Firestore wiring (only when configured), scoped to the signed-in user ---
// Security: staff subscribe to the whole candidates collection; an applicant may
// only read their OWN rows, so we subscribe with where() filters that match the
// Firestore rules (by uid and by verified email). Positions are readable by any
// signed-in user. syncAuth() is called by AuthProvider whenever the user changes.
let unsubPositions = null;
let unsubCandidateFns = []; // candidate + employee listeners to tear down
let authKey = null; // uid|role|email — avoid needless resubscribes on profile edits
// People arrive from TWO collections: /candidates (pipeline) and /employees (hired).
// A candidate user reads each on two streams (by uid + by verified email); staff read
// each whole collection. Every stream lands in this bag, tagged with its _kind, and we
// recompute the merged views whenever any stream updates.
const streams = new Map(); // streamName -> mapped docs (each tagged _kind)
function setStream(name, docs) {
  streams.set(name, docs);
  recompute();
}
function recompute() {
  const candById = new Map();
  const empById = new Map();
  for (const docs of streams.values()) {
    for (const d of docs) (d._kind === "employee" ? empById : candById).set(d.id, d);
  }
  employees = [...empById.values()].sort((a, b) => (b.hiredAt || 0) - (a.hiredAt || 0));
  // Exposed `candidates` = pipeline people PLUS hired employees (which carry
  // stage:"hired"), so every existing consumer that filters by stage keeps working
  // even though the DATABASE keeps the two collections cleanly separate.
  candidates = [...candById.values(), ...employees].sort((a, b) => a.appliedAt - b.appliedAt);
  loading = false;
  commit();
}
function teardownData() {
  if (unsubPositions) unsubPositions();
  unsubPositions = null;
  unsubCandidateFns.forEach((fn) => fn());
  unsubCandidateFns = [];
  streams.clear();
}

/**
 * Point the store at the currently signed-in user (or null on sign-out).
 * Sets up role-appropriate, security-rule-compatible listeners. No-op in mock
 * mode and when the identity hasn't actually changed.
 */
export function syncAuth(user) {
  if (!firebaseReady) return;
  const key = user ? `${user.uid}|${user.role}|${user.email}` : null;
  if (key === authKey) return;
  authKey = key;

  teardownData();
  if (!user) {
    positions = [];
    candidates = [];
    loading = false;
    commit();
    return;
  }

  loading = true;
  commit();

  unsubPositions = onSnapshot(
    collection(db, "positions"),
    (snap) => {
      positions = snap.docs.map(mapPosition).sort((a, b) => b.createdAt - a.createdAt);
      publishStageMeta(positions);
      loading = false;
      commit();
      // Recruiters (who may write positions) persist any auto-closes that are due,
      // so the board + console reflect them. Everyone else still SEES them as closed
      // via effectiveStatus(); this just makes the stored status catch up.
      if (user.role === "HR" || user.role === "Management") autoCloseExpired();
    },
    (err) => {
      console.error("positions listener:", err);
      loading = false;
      commit();
    }
  );

  // Subscribe one collection stream (optionally filtered) into the merge bag.
  const subscribeStream = (name, col, kind, filter) => {
    const base = collection(db, col);
    const ref = filter ? query(base, where(filter.field, "==", filter.value)) : base;
    unsubCandidateFns.push(
      onSnapshot(
        ref,
        (snap) => setStream(name, snap.docs.map((d) => ({ ...mapCandidate(d), _kind: kind }))),
        (err) => console.error(`${name} listener:`, err)
      )
    );
  };

  if (user.role === "Candidate") {
    // Scoped: only this person's OWN records — by uid and by verified email — across
    // both /candidates (their applications) and /employees (their job, once hired).
    subscribeStream("cand:uid", "candidates", "candidate", { field: "submittedByUid", value: user.uid });
    subscribeStream("emp:uid", "employees", "employee", { field: "submittedByUid", value: user.uid });
    if (user.email) {
      subscribeStream("cand:email", "candidates", "candidate", { field: "email", value: user.email });
      subscribeStream("emp:email", "employees", "employee", { field: "email", value: user.email });
    }
  } else {
    // Staff: the whole of both collections.
    subscribeStream("cand:all", "candidates", "candidate", null);
    subscribeStream("emp:all", "employees", "employee", null);
    // Only recruiters may write positions — seed from a recruiter session.
    if (user.role === "HR" || user.role === "Management") seedIfEmpty();
  }
}

// One-time seed: if the positions collection is empty, write the demo data with
// READABLE document ids (candidates/CAND-0001, employees/…), splitting already-hired
// seed people into /employees, and seeding the counters so live writes continue the
// sequence. Only ever runs against a brand-new, empty database.
async function seedIfEmpty() {
  try {
    const existing = await getDocs(collection(db, "positions"));
    if (!existing.empty) return;
    // Positions get readable ids (short code + per-code sequence, e.g. NE-01); keep a
    // seed-id → readable-id map so candidate/employee positionId refs stay correct.
    const posIdMap = new Map();
    const seqByCode = new Map();
    for (const p of SEED_POSITIONS) {
      const code = positionCode(p.title);
      const seq = (seqByCode.get(code) || 0) + 1;
      seqByCode.set(code, seq);
      posIdMap.set(p.id, makePositionId(p.title, seq));
    }
    await Promise.all(
      SEED_POSITIONS.map((p) =>
        setDoc(doc(db, "positions", posIdMap.get(p.id)), {
          title: p.title, department: p.department, description: p.description,
          status: p.status, stages: p.stages, minQualification: p.minQualification || "", createdAt: new Date(p.createdAt),
        })
      )
    );
    const posByIdSeed = new Map(SEED_POSITIONS.map((p) => [p.id, p]));
    let candNum = 1;
    let empNum = EMPLOYEE_SEQ_START;
    const writes = [];
    for (const c of SEED_CANDIDATES) {
      const candidateId = fmtCandidateId(candNum++);
      const base = {
        name: c.name, email: c.email, positionId: posIdMap.get(c.positionId) || c.positionId, stage: c.stage,
        appliedRole: c.appliedRole, avatarColor: c.avatarColor,
        highestQualification: c.highestQualification || "", experience: c.experience || "",
        candidateId, appliedAt: new Date(c.appliedAt),
      };
      if (c.stage === "hired") {
        const pos = posByIdSeed.get(c.positionId) || {};
        const deptName = pos.department || "";
        const title = pos.title || c.appliedRole || "";
        const employeeId = makeEmployeeId(deptName, title, empNum++);
        writes.push(setDoc(doc(db, "employees", employeeId), {
          ...base, employeeId, employeeDept: deptName, employeeRole: title, hiredAt: new Date(c.appliedAt),
        }));
      } else {
        writes.push(setDoc(doc(db, "candidates", candidateId), base));
      }
    }
    await Promise.all(writes);
    // Seed the counters so live applications/hires continue the sequences.
    await setDoc(doc(db, "counters", "candidates"), { next: candNum });
    await setDoc(doc(db, "counters", "employees"), { next: empNum });
  } catch (err) {
    console.error("Seed failed:", err);
    loading = false;
    commit();
  }
}

// --- selectors ---
export const getPositions = () => positions;
export const getPosition = (id) => positions.find((p) => p.id === id) || null;
export const getCandidatesFor = (positionId) => candidates.filter((c) => c.positionId === positionId);

// --- mutators (write to Firestore when configured, else the mock arrays) ---
export async function addPosition({ title, department, description, stages, minQualification = "", closesAt = 0, createdByRole = "", createdByUid = "", createdByName = "" }) {
  // HR is the recruitment authority now, so a newly opened vacancy goes live
  // immediately — there's no separate Management approval step anymore.
  const status = "Open";
  const data = {
    title: title.trim(),
    department: department.trim(),
    description: (description || "").trim(),
    status,
    stages: stages && stages.length ? stages : DEFAULT_PIPELINE,
    minQualification,
    // mandatory auto-close date: the position closes itself once this passes
    closesAt: closesAt ? new Date(closesAt) : null,
    createdByUid,
    createdByName,
    createdAt: new Date(),
  };
  if (firebaseReady) {
    // Readable document id derived from the title (e.g. NE-01) — the next per-code
    // number comes from the positions already loaded, so no counter is involved.
    const prefix = positionCode(data.title) + "-";
    let maxSeq = 0;
    for (const p of positions) {
      if ((p.id || "").startsWith(prefix)) {
        const n = Number(p.id.slice(prefix.length));
        if (Number.isFinite(n)) maxSeq = Math.max(maxSeq, n);
      }
    }
    const posId = makePositionId(data.title, maxSeq + 1);
    await setDoc(doc(db, "positions", posId), data);
    return { id: posId, ...data, createdAt: Date.now() };
  }
  const pos = { id: uid("pos"), ...data, createdAt: Date.now() };
  positions = [pos, ...positions];
  commit();
  return pos;
}

export async function addCandidate({ name, email, positionId, appliedRole, ...extra }) {
  // `extra` carries the optional CV / application profile fields (phone, location,
  // highestQualification, fieldOfStudy, experience, currentRole, currentCompany,
  // skills, linkedIn, coverNote, cvFileName, cvDataUrl, cvSize, source, submittedByUid).
  const clean = {};
  // Ignore any candidateId carried over from a previous application: every
  // application is its OWN document keyed by its OWN fresh number (see below).
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && k !== "candidateId") clean[k] = v;
  const source = clean.source || "Added by HR";
  const data = {
    name: name.trim(),
    email: (email || "").trim(),
    positionId,
    stage: "applied",
    appliedRole: (appliedRole || "").trim(),
    avatarColor: pickColor(name),
    source,
    appliedAt: new Date(),
    rejection: null,
    comments: [],
    history: [{ type: "apply", from: null, to: "applied", at: Date.now(), by: source === "Self-applied" ? name.trim() : "HR", byRole: "" }],
    ...clean,
  };
  if (firebaseReady) {
    // Always claim a FRESH candidate number and write the candidate under a READABLE
    // document id (the number itself → candidates/CAND-0063) in ONE transaction, so
    // the number and the row commit together (or not at all). Each application is its
    // own document; reusing a number across a person's applications would collide on
    // the (readable) document id and turn a create into a denied update.
    let candidateId = "";
    await runTransaction(db, async (tx) => {
      const counterRef = doc(db, "counters", "candidates");
      const snap = await tx.get(counterRef);
      const next = snap.exists() ? Number(snap.data().next) || CANDIDATE_SEQ_START : CANDIDATE_SEQ_START;
      candidateId = fmtCandidateId(next);
      tx.set(counterRef, { next: next + 1 });
      tx.set(doc(db, "candidates", candidateId), { ...data, candidateId });
    });
    return { id: candidateId, ...data, candidateId, appliedAt: Date.now() };
  }
  // mock mode — a fresh number from the highest existing candidate id in memory
  const candidateId = fmtCandidateId(Math.max(CANDIDATE_SEQ_START - 1, ...candidates.map((c) => parseCandNum(c.candidateId)), 0) + 1);
  const cand = { id: uid("cand"), ...data, candidateId, appliedAt: Date.now() };
  candidates = [...candidates, cand];
  commit();
  return cand;
}

/**
 * A candidate applying to an open position. There is ONE flow for everyone — the
 * "request a role change" concept has been removed entirely:
 *  • You may hold only ONE application at a time. While it's live (not yet
 *    decided) you can't apply to any other role.
 *  • Once it's REJECTED you may apply to a DIFFERENT role — but never re-apply to
 *    the same posting you were rejected from (only HR can reconsider you for it).
 *  • Once you're HIRED you're done: being hired is terminal and you can't apply
 *    to anything else, ever.
 * Every application is tagged "Self-applied".
 */
export async function applyToPosition(payload) {
  const uid = payload.submittedByUid;
  const email = (payload.email || "").toLowerCase();
  const mine = candidates.filter(
    (c) => (uid && c.submittedByUid === uid) || (email && (c.email || "").toLowerCase() === email)
  );
  const pos = positions.find((p) => p.id === payload.positionId);
  const appliedRole = pos ? pos.title : payload.appliedRole || "";

  // The vacancy must actually be open (not closed, not past its auto-close date).
  if (pos && !isOpenNow(pos)) {
    const err = new Error("This position is closed and no longer accepting applications.");
    err.code = "position-closed";
    throw err;
  }

  // HIRED is terminal — a hired person can never apply to another role. (There is
  // no internal role-change flow anymore.)
  if (mine.some((c) => c.stage === "hired")) {
    const err = new Error("You've been hired, so you can't apply to other roles.");
    err.code = "already-hired";
    throw err;
  }

  // REJECTED from this exact position → can never reapply to the SAME posting. A
  // recreated position has a new id, so applying to that one is allowed.
  if (mine.some((c) => c.positionId === payload.positionId && c.stage === "rejected")) {
    const err = new Error("You weren't selected for this role, so you can't apply to this same posting again.");
    err.code = "rejected-here";
    throw err;
  }

  // ONE active application at a time: you can't apply to another job while you
  // still have a LIVE (non-rejected) application anywhere. Once that one is
  // decided — i.e. rejected — you may apply elsewhere.
  if (mine.some((c) => c.stage !== "rejected" && c.stage !== "hired")) {
    const err = new Error("You already have an active application. You can apply to another role once a decision has been made on it.");
    err.code = "has-active-application";
    throw err;
  }
  return addCandidate({ ...payload, appliedRole, source: "Self-applied" });
}

/**
 * Make sure a STAFF account has a readable User ID (USR-####), minting one the
 * first time if it's missing. Self-healing: called on login, so the existing
 * staff accounts pick up an ID on their next sign-in with no migration needed.
 * The number is claimed from counters/users inside a transaction (same uniqueness
 * guarantee as candidate/employee ids) and written as a FIELD on users/{uid} — the
 * doc stays keyed by the Firebase Auth uid, so login and the security rules are
 * untouched. Returns the (existing or freshly minted) User ID, or "" if there's no
 * users doc (candidates have none by design) or Firebase isn't configured.
 */
export async function ensureUserId(uid) {
  if (!firebaseReady || !uid) return "";
  const userRef = doc(db, "users", uid);
  const counterRef = doc(db, "counters", "users");
  let userId = "";
  try {
    await runTransaction(db, async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) return; // no users doc (e.g. a candidate) — nothing to do
      const existing = userSnap.data().userId;
      if (existing) { userId = existing; return; } // already has one — no-op
      const counterSnap = await tx.get(counterRef);
      const next = counterSnap.exists() ? Number(counterSnap.data().next) || USER_SEQ_START : USER_SEQ_START;
      userId = makeUserId(next);
      tx.update(userRef, { userId });         // role unchanged → allowed by the rules
      tx.set(counterRef, { next: next + 1 }); // claim the number
    });
  } catch (e) {
    console.error("ensureUserId:", e);
    return "";
  }
  return userId;
}

// Which collection holds this id? A HIRED person lives in /employees, everyone
// else in /candidates — so updates (comments, edits) hit the right document.
const collectionForId = (id) => (employees.some((e) => e.id === id) ? "employees" : "candidates");

// Persist a change to one candidate (Firestore or in-memory).
// Array fields (history/comments) are mutated with arrayUnion/arrayRemove so
// two people acting on the same candidate at once can't clobber each other's
// entries (the old read-modify-write on `[...arr, x]` silently lost writes).
async function writeCandidate(candidateId, { set = {}, appendHistory = null, appendComment = null, removeComment = null } = {}) {
  if (firebaseReady) {
    const patch = { ...set };
    if (appendHistory) patch.history = arrayUnion(appendHistory);
    if (appendComment) patch.comments = arrayUnion(appendComment);
    if (removeComment) patch.comments = arrayRemove(removeComment);
    // A hired person now lives in /employees, everyone else in /candidates — write
    // to whichever collection actually holds them.
    await updateDoc(doc(db, collectionForId(candidateId), candidateId), patch);
    return;
  }
  candidates = candidates.map((c) => {
    if (c.id !== candidateId) return c;
    const next = { ...c, ...set };
    if (appendHistory) next.history = [...(c.history || []), appendHistory];
    if (appendComment) next.comments = [...(c.comments || []), appendComment];
    if (removeComment) next.comments = (c.comments || []).filter((cm) => cm !== removeComment);
    return next;
  });
  commit();
}
const actorFields = (actor) => ({ by: actor?.name || "", byRole: actor?.role || "", byUid: actor?.uid || actor?.name || "" });
// Stable id for "who left this comment" (Firebase uid, else falls back to name).
const idOf = (actor) => actor?.uid || actor?.name || "";
const commentId = (cm) => cm.byUid || cm.by || "";

/**
 * Move a candidate to the next stage of its position's pipeline (no skipping).
 * `actor` = { name, role, uid } of the user making the move.
 *
 * For every stage AFTER Applied, the acting user must first have left a review
 * (a comment WITH a score) on this candidate at the current stage — otherwise the
 * move is refused and we return { ok:false, reason:"review-required" }. Applied
 * is exempt (it's just an application). The review is copied onto the history
 * entry so it shows in the candidate's timeline.
 */
export async function advanceStage(candidateId, actor) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand) return { ok: false, reason: "not-found" };
  const pos = positions.find((p) => p.id === cand.positionId);
  const nx = nextStage(pos ? pos.stages : DEFAULT_PIPELINE, cand.stage);
  if (!nx) return { ok: false, reason: "terminal" };

  const uid = idOf(actor);
  const review = (cand.comments || []).find(
    (cm) => commentId(cm) === uid && cm.stage === cand.stage && cm.score != null
  );
  if (cand.stage !== "applied" && !review) {
    return { ok: false, reason: "review-required" };
  }

  const entry = { type: nx === "hired" ? "hire" : "stage", from: cand.stage, to: nx, at: Date.now(), ...actorFields(actor) };
  if (review) {
    entry.comment = review.text;
    entry.score = review.score;
  }

  // Hiring is special: the candidate becomes an EMPLOYEE and is issued an
  // employee ID (dept · role · number) atomically with the stage move.
  if (nx === "hired") {
    const deptName = (pos && pos.department) || "";
    const title = (pos && pos.title) || cand.appliedRole || "";
    const employeeId = await hireCandidate(candidateId, { deptName, title, entry });
    return { ok: true, hired: true, employeeId };
  }

  await writeCandidate(candidateId, { set: { stage: nx }, appendHistory: entry });
  return { ok: true };
}

/**
 * Move a candidate into "hired" AND mint their employee ID in ONE atomic step.
 * The employee number is claimed from counters/employees inside the same
 * transaction as the candidate write, so the number and the hire commit together
 * (or not at all) — no gaps from a half-finished hire, no two hires sharing a
 * number. Returns the issued employee ID string.
 */
async function hireCandidate(candidateId, { deptName, title, entry }) {
  if (firebaseReady) {
    const candRef = doc(db, "candidates", candidateId);
    const counterRef = doc(db, "counters", "employees");
    let employeeId = "";
    await runTransaction(db, async (tx) => {
      // All reads first (Firestore requires reads before writes in a transaction).
      const candSnap = await tx.get(candRef);
      if (!candSnap.exists()) throw new Error("candidate-not-found");
      const cand = candSnap.data();
      const counterSnap = await tx.get(counterRef);
      const next = counterSnap.exists() ? Number(counterSnap.data().next) || EMPLOYEE_SEQ_START : EMPLOYEE_SEQ_START;
      employeeId = makeEmployeeId(deptName, title, next);
      const history = Array.isArray(cand.history) ? [...cand.history, entry] : [entry];
      // MOVE the person: write the employee record under a readable id (the employee
      // id itself), then delete the candidate — so they're never in both at once.
      tx.set(doc(db, "employees", employeeId), {
        ...cand,
        candidateId: cand.candidateId || candidateId,
        stage: "hired",
        employeeId,
        employeeDept: deptName,
        employeeRole: title,
        hiredAt: new Date(),
        history,
      });
      tx.delete(candRef);
      // Promotion (internal role change): vacate their PREVIOUS employee record so
      // there's exactly one live employee row per person.
      if (cand.fromEmployeeId) tx.delete(doc(db, "employees", cand.fromEmployeeId));
      tx.set(counterRef, { next: next + 1 });
    });
    return employeeId;
  }
  // mock mode — next number from the highest existing employee id in memory
  const nextNum = Math.max(EMPLOYEE_SEQ_START - 1, ...candidates.map((c) => parseCandNum(c.employeeId)), 0) + 1;
  const employeeId = makeEmployeeId(deptName, title, nextNum);
  candidates = candidates.map((c) =>
    c.id === candidateId
      ? { ...c, stage: "hired", employeeId, employeeDept: deptName, employeeRole: title, hiredAt: Date.now(), history: [...(c.history || []), entry] }
      : c
  );
  commit();
  return employeeId;
}

/**
 * Reject a candidate WITHOUT deleting them — they stay in the talent pool with a
 * recorded reason, comment, the stage they were rejected at, and who did it.
 */
export async function rejectCandidate(candidateId, { reason = "", comment = "", actor } = {}) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand) return;
  const rejection = { reason, comment, stage: cand.stage, at: Date.now(), ...actorFields(actor) };
  const entry = { type: "reject", from: cand.stage, to: "rejected", reason, comment, at: Date.now(), ...actorFields(actor) };
  await writeCandidate(candidateId, { set: { stage: "rejected", rejection }, appendHistory: entry });
}

/**
 * Reject several candidates in one go (e.g. everyone below the qualification bar).
 * Same rules as a single reject — nobody is deleted, each keeps a rejection
 * record — just applied across a list. Already-rejected ones are skipped.
 * Returns the number actually rejected.
 */
export async function bulkReject(candidateIds = [], { reason = "", comment = "", actor } = {}) {
  const targets = candidates.filter((c) => candidateIds.includes(c.id) && c.stage !== "rejected");
  await Promise.all(targets.map((c) => rejectCandidate(c.id, { reason, comment, actor })));
  return targets.length;
}

/**
 * Bring a previously rejected candidate back into the active pipeline (talent
 * pool reuse). Drops them back to Applied and clears the rejection record.
 */
export async function reconsiderCandidate(candidateId, actor) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand) return;
  const entry = { type: "reconsider", from: cand.stage, to: "applied", at: Date.now(), ...actorFields(actor) };
  await writeCandidate(candidateId, { set: { stage: "applied", rejection: null }, appendHistory: entry });
}

/**
 * Add a reviewer comment to a candidate. Any staff member can leave their
 * thoughts; the note is tagged with who wrote it, their role and the stage the
 * candidate was at — so the next reviewer down the pipeline can read it.
 */
export async function addComment(candidateId, { text, score = null, actor }) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand || !text || !text.trim()) return;
  // One comment per user per stage — enforced HERE, not only in the UI, so a
  // second tab or a stray caller can't post a duplicate review.
  const mine = idOf(actor);
  if ((cand.comments || []).some((cm) => commentId(cm) === mine && cm.stage === cand.stage)) return;
  const entry = { text: text.trim(), stage: cand.stage, at: Date.now(), ...actorFields(actor) };
  // Validate the score: must be a real, finite number; clamp to 0–100. A blank
  // or garbage score (which would become NaN) is dropped, so it can never
  // masquerade as a valid review and slip past the mandatory-review gate.
  if (score !== null && score !== undefined && score !== "") {
    const n = Number(score);
    if (Number.isFinite(n)) entry.score = Math.min(100, Math.max(0, Math.round(n)));
  }
  await writeCandidate(candidateId, { appendComment: entry });
}

/**
 * Remove a comment — only the person who wrote it can, and only before the move
 * is confirmed. Matched by timestamp + author so nobody deletes someone else's.
 */
export async function deleteComment(candidateId, { at, byUid }) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand) return;
  // Remove the exact stored object (so arrayRemove matches in Firestore and we
  // never touch anyone else's comment).
  const target = (cand.comments || []).find((cm) => cm.at === at && commentId(cm) === byUid);
  if (!target) return;
  await writeCandidate(candidateId, { removeComment: target });
}

/** Update the configured stage pipeline for a vacancy. */
export async function updatePositionStages(positionId, stages) {
  if (firebaseReady) {
    await updateDoc(doc(db, "positions", positionId), { stages });
    return;
  }
  positions = positions.map((p) => (p.id === positionId ? { ...p, stages } : p));
  commit();
}

/**
 * Save a vacancy's full pipeline configuration in one write: the ordered stage
 * list, custom-stage metadata (labels/colours/owner for any non-built-in stage
 * plus label overrides), and the per-stage staff assignments. Used by the
 * Configure-stages editor.
 */
export async function savePipeline(positionId, { stages, stageMeta = {}, stageAssignees = {} }) {
  const patch = { stages, stageMeta, stageAssignees };
  if (firebaseReady) {
    await updateDoc(doc(db, "positions", positionId), patch);
    return;
  }
  positions = positions.map((p) => (p.id === positionId ? { ...p, ...patch } : p));
  publishStageMeta(positions);
  commit();
}

/**
 * Change a vacancy's lifecycle status (Management-only in the UI + rules):
 * "Pending" → "Open" (approve), "Open" → "Closed" (close), "Closed" → "Open" (reopen).
 */
export async function updatePositionStatus(positionId, status) {
  // No reopening: once a position is Closed it stays Closed. (Pending → Open, the
  // approval path, is still allowed; only Closed → Open is refused.)
  const cur = positions.find((p) => p.id === positionId);
  if (status === "Open" && cur && cur.status === "Closed") return;
  if (firebaseReady) {
    await updateDoc(doc(db, "positions", positionId), { status });
    return;
  }
  positions = positions.map((p) => (p.id === positionId ? { ...p, status } : p));
  commit();
}

// Persist any auto-closes that are now due (a position past its closesAt). Called
// from a recruiter's positions listener; idempotent (only touches Open→due rows,
// and once written they're Closed so they won't re-fire).
function autoCloseExpired() {
  const now = Date.now();
  for (const p of positions) {
    if (p.status === "Open" && p.closesAt && p.closesAt <= now) {
      updatePositionStatus(p.id, "Closed").catch(() => {});
    }
  }
}

/** Delete a vacancy entirely (Management-only). Candidates are never deleted. */
export async function deletePosition(positionId) {
  if (firebaseReady) {
    await deleteDoc(doc(db, "positions", positionId));
    return;
  }
  positions = positions.filter((p) => p.id !== positionId);
  commit();
}
