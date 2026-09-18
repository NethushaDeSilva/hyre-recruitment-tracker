import { canBulkSelect, meetsShortlistThreshold } from "@/lib/scoreStaleness";
// THE single data seam for Hyre — the one module the whole UI talks to for data.
// When Firebase is configured, positions & candidates live in Firestore and are
// kept in sync with real-time onSnapshot listeners; mutations write to Firestore.
// When keys are absent, it falls back to in-memory seed data so the app still runs.
// Either way the UI only ever calls useHyreData() + the helper functions below.
//
// IDENTITY / APPLICATION SPLIT (WS1 — one person, many applications):
// A person's identity — email, phone, CV, parsed profile — lives ONCE in
// /candidates, keyed by their lowercased email. Every vacancy they apply to is
// its own /applications document (stage, history, comments, offer, …) that
// references that identity by `personId`. useHyreData() still hands back a
// `candidates` array shaped exactly like before (one flattened row per
// application) by JOINING the two collections client-side — so a person's CV
// is never re-uploaded or re-typed on a second application, while every other
// screen that already reads `candidates` keeps working unmodified.
import { useSyncExternalStore } from "react";
import { collection, doc, getDoc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDocs, query, where, arrayUnion, arrayRemove, runTransaction } from "firebase/firestore";
import { db, firebaseReady } from "@/firebase/config";
import { DEFAULT_PIPELINE, JUNIOR_PIPELINE, nextStage, registerStageMeta, stageOwnerRole } from "@/lib/stages";
import { departmentCode } from "@/lib/departments";
import { isOpenNow } from "@/lib/positions";
import { createRescoreRun, executeRescoreRun, snapshotKey } from "@/lib/rescoreBatch";
import { scoringHeaders } from "@/lib/scoringAuth";
import { createDeclaredAvailabilityProvider, availabilityState, AVAILABILITY_VALIDITY_MS } from "@/lib/availability";
import { browserTimeZone } from "@/lib/wallClock";
import { rankEligibleInterviewers } from "@/lib/interviewAssignment";
import { ROLES } from "@/lib/permissions";

const AVATAR_COLORS = ["#2563EB", "#4F46E5", "#E0A422", "#16A34A", "#DC2626", "#0EA5E9", "#DB2777", "#1F3A5F", "#64748B"];
function pickColor(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
let idCounter = 100;
const uid = (prefix) => `${prefix}_${++idCounter}`;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

// --- unique, sequential CANDIDATE IDs (CAND-0001, CAND-0002, …) ---------------
// This is now a PERSON number, not an application number — minted once, the
// first time someone's email is ever seen, and carried by their identity doc
// from then on. A candidate can only read their OWN rows (security rules), so
// they can't count how many people exist to know they're "the 61st" — numbers
// come from a single counter document (counters/candidates.next) inside a
// transaction, so two people applying at the same moment can never collide.
// 60 people are seeded (CAND-0001…0060), so the sequence starts at 61.
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
// The moment an application reaches "hired" that person is issued an employee ID
// built from THREE parts:      {DEPT}-{ROLE}-{NUMBER}      e.g.  SE-SNE-0001
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

// --- mock-mode in-memory state (used only when Firebase isn't configured) ----
// Mirrors the real Firestore shape: identities keyed by email, applications and
// employees as flat lists referencing a personId. A fallback path only — the
// deployed app always runs against real Firestore.
const mockIdentities = new Map(); // personId -> identity fields
const mockApplications = []; // { id, personId, positionId, stage, ... } — pipeline-only
let mockEmployeesList = []; // flattened, joined snapshots (same shape as before)
const mockScores = new Map(); // applicationId -> applicationScores doc (WS5)

function seedMock() {
  let candNum = CANDIDATE_SEQ_START - 60; // 1
  let empNum = EMPLOYEE_SEQ_START;
  for (const c of SEED_CANDIDATES) {
    const personId = normalizeEmail(c.email) || `noemail_${c.id}`;
    const identity = {
      personId, email: personId, candidateId: fmtCandidateId(candNum++), name: c.name,
      avatarColor: c.avatarColor, highestQualification: c.highestQualification || "", experience: c.experience || "",
      phone: "", location: "", fieldOfStudy: "", currentRole: "", currentCompany: "", skills: "", linkedIn: "",
      totalYearsExperience: 0, education: [], experienceEntries: [], certifications: [], languages: [],
      cvExtractedText: "", emailFromCv: "", emailMismatch: false, cvFileName: "", cvDataUrl: "", cvSize: 0,
      submittedByUid: "",
    };
    mockIdentities.set(personId, identity);
    const base = {
      id: c.id, personId, positionId: c.positionId, stage: c.stage, appliedRole: c.appliedRole,
      appliedAt: at(c.appliedAt), source: "Added by HR", coverNote: "",
      needsReview: false, cvValidation: null, offer: null, rejection: null, comments: [],
      history: [{ type: "apply", from: null, to: c.stage === "applied" ? "applied" : c.stage, at: at(c.appliedAt), by: "HR", byRole: "" }],
      employeeId: "", employeeDept: "", employeeRole: "", hiredAt: 0,
    };
    if (c.stage === "hired") {
      const employeeId = makeEmployeeId("", c.appliedRole, empNum++);
      mockEmployeesList.push(joinFlat(identity, { ...base, employeeId, employeeRole: c.appliedRole, hiredAt: at(c.appliedAt) }));
    } else {
      mockApplications.push(base);
    }
  }
}
function recomputeMock() {
  employees = mockEmployeesList;
  candidates = [
    ...mockApplications.map((a) => joinFlat(mockIdentities.get(a.personId), a)),
    ...mockEmployeesList,
  ].sort((a, b) => a.appliedAt - b.appliedAt);
  scores = new Map(mockScores);
}

// --- reactive snapshot store ---
let positions = firebaseReady ? [] : SEED_POSITIONS;
let candidates = [];
let employees = []; // hired people — Firebase: the /employees collection; mock: derived below
let notifications = []; // in-app notifications addressed to the signed-in user
let scores = new Map(); // WS5 — applicationId -> applicationScores doc; staff-only, empty for a Candidate
let loading = firebaseReady; // true until the first Firestore data arrives
if (!firebaseReady) {
  seedMock();
  recomputeMock();
}
let snapshot = { positions, candidates, employees, notifications, scores, loading };
const listeners = new Set();
function commit() {
  snapshot = { positions, candidates, employees, notifications, scores, loading };
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
    // WS8 §8.1.4 — seniority, drives interview stage count + eligible
    // interviewer level. Optional: most positions have nothing to do with
    // DevOps scheduling (§8.0) and shouldn't be forced to pick one.
    level: x.level || "",
    // WS5 5.2 — structured scoring requirements, separate from minQualification
    // above (a legacy free-text hint across the full O/L-to-PhD ladder; this
    // one is the engine's strict input and only exists once a position has
    // been created/edited under the new form).
    // null on every position created before this shipped — never guessed at.
    requirements: x.requirements || null,
    // Board/Applied-column view filter default (client-side only — see
    // canBulkSelect() in scoreStaleness.js and the PositionDetail toolbar).
    // Deliberately a SIBLING of requirements, never inside it: editing this
    // must never trip updatePosition()'s requirements-changed staleness check.
    shortlistThreshold: x.shortlistThreshold || 0,
    // mandatory auto-close date (ms) — the vacancy closes itself once this passes
    closesAt: x.closesAt ? ms(x.closesAt) : 0,
    // headcount target vs. how many have been hired into this requisition so far —
    // hireCandidate() increments hiredCount and closes the position once it's filled
    headcount: x.headcount || 1,
    hiredCount: x.hiredCount || 0,
    hiringManagerUid: x.hiringManagerUid || "",
    hiringManagerName: x.hiringManagerName || "",
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

// --- identity (candidates/{personId}) — one per person, keyed on email -------
const mapIdentity = (d) => {
  const x = d.data();
  return {
    personId: d.id,
    candidateId: x.candidateId || "", // human-readable person ID (e.g. CAND-0007)
    email: x.email || "",
    phone: x.phone || "",
    name: x.name || "",
    location: x.location || "",
    highestQualification: x.highestQualification || "",
    fieldOfStudy: x.fieldOfStudy || "",
    experience: x.experience || "",
    currentRole: x.currentRole || "",
    currentCompany: x.currentCompany || "",
    skills: x.skills || "",
    linkedIn: x.linkedIn || "",
    totalYearsExperience: x.totalYearsExperience || 0,
    education: x.education || [],
    experienceEntries: x.experienceEntries || [],
    certifications: x.certifications || [],
    languages: x.languages || [],
    cvExtractedText: x.cvExtractedText || "",
    emailFromCv: x.emailFromCv || "",
    emailMismatch: !!x.emailMismatch,
    cvFileName: x.cvFileName || "",
    cvDataUrl: x.cvDataUrl || "",
    cvSize: x.cvSize || 0,
    avatarColor: x.avatarColor || "#1F3A5F",
    submittedByUid: x.submittedByUid || "",
  };
};

// --- applications/{id} — one per (person, vacancy) — the pipeline instance ---
const mapApplication = (d) => {
  const x = d.data();
  return {
    id: d.id,
    personId: x.personId || "",
    email: x.email || "", // denormalized from identity — needed by security rules
    submittedByUid: x.submittedByUid || "", // denormalized from identity — ditto
    positionId: x.positionId,
    stage: x.stage || "applied",
    appliedRole: x.appliedRole || "",
    appliedAt: ms(x.appliedAt),
    coverNote: x.coverNote || "",
    source: x.source || "Added by HR",
    needsReview: !!x.needsReview,
    cvValidation: x.cvValidation || null,
    offer: x.offer || null,
    employeeId: x.employeeId || "",
    employeeDept: x.employeeDept || "",
    employeeRole: x.employeeRole || "",
    hiredAt: x.hiredAt ? ms(x.hiredAt) : 0,
    history: Array.isArray(x.history) ? x.history : [],
    rejection: x.rejection || null,
    comments: Array.isArray(x.comments) ? x.comments : [],
  };
};

// employees/{employeeId} — a full point-in-time SNAPSHOT written at hire time
// (not a live join with identity — matches how it worked before this split).
const mapEmployee = (d) => {
  const x = d.data();
  return {
    id: d.id,
    personId: x.personId || "",
    candidateId: x.candidateId || "",
    employeeId: x.employeeId || "",
    employeeDept: x.employeeDept || "",
    employeeRole: x.employeeRole || "",
    hiredAt: x.hiredAt ? ms(x.hiredAt) : 0,
    name: x.name || "",
    email: x.email || "",
    positionId: x.positionId || "",
    stage: "hired",
    appliedRole: x.appliedRole || "",
    avatarColor: x.avatarColor || "#1F3A5F",
    appliedAt: ms(x.appliedAt),
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
    totalYearsExperience: x.totalYearsExperience || 0,
    education: x.education || [],
    experienceEntries: x.experienceEntries || [],
    certifications: x.certifications || [],
    languages: x.languages || [],
    cvExtractedText: x.cvExtractedText || "",
    emailFromCv: x.emailFromCv || "",
    emailMismatch: !!x.emailMismatch,
    cvFileName: x.cvFileName || "",
    cvDataUrl: x.cvDataUrl || "",
    cvSize: x.cvSize || 0,
    offer: x.offer || null,
    source: x.source || "Added by HR",
    submittedByUid: x.submittedByUid || "",
    needsReview: !!x.needsReview,
    cvValidation: x.cvValidation || null,
    history: Array.isArray(x.history) ? x.history : [],
    rejection: x.rejection || null,
    comments: Array.isArray(x.comments) ? x.comments : [],
  };
};

// Merge one application with its identity into the SAME flattened shape every
// existing screen already reads (CandidatesTable, PositionDetail, CandidateDetailModal,
// Jobs, MyApplications, …) — so nothing downstream needs to change just because
// the underlying data now lives in two collections instead of one.
function joinFlat(identity, app) {
  const idn = identity || {};
  return {
    id: app.id,
    personId: app.personId,
    candidateId: idn.candidateId || "",
    employeeId: app.employeeId,
    employeeDept: app.employeeDept,
    employeeRole: app.employeeRole,
    hiredAt: app.hiredAt,
    name: idn.name || "",
    email: idn.email || app.email || "",
    positionId: app.positionId,
    stage: app.stage,
    appliedRole: app.appliedRole,
    avatarColor: idn.avatarColor || "#1F3A5F",
    appliedAt: app.appliedAt,
    phone: idn.phone || "",
    location: idn.location || "",
    highestQualification: idn.highestQualification || "",
    fieldOfStudy: idn.fieldOfStudy || "",
    experience: idn.experience || "",
    currentRole: idn.currentRole || "",
    currentCompany: idn.currentCompany || "",
    skills: idn.skills || "",
    linkedIn: idn.linkedIn || "",
    coverNote: app.coverNote || "",
    totalYearsExperience: idn.totalYearsExperience || 0,
    extractionQuality: idn.extractionQuality || null,
    cvTruncation: app.cvTruncation || null,
    education: idn.education || [],
    experienceEntries: idn.experienceEntries || [],
    certifications: idn.certifications || [],
    languages: idn.languages || [],
    cvExtractedText: idn.cvExtractedText || "",
    emailFromCv: idn.emailFromCv || "",
    emailMismatch: !!idn.emailMismatch,
    cvFileName: idn.cvFileName || "",
    cvDataUrl: idn.cvDataUrl || "",
    cvSize: idn.cvSize || 0,
    offer: app.offer || null,
    source: app.source || "Added by HR",
    submittedByUid: idn.submittedByUid || app.submittedByUid || "",
    needsReview: app.needsReview,
    cvValidation: app.cvValidation,
    history: app.history || [],
    rejection: app.rejection || null,
    comments: app.comments || [],
  };
}

// --- Firestore wiring (only when configured), scoped to the signed-in user ---
// Security: staff subscribe to whole collections; an applicant may only read
// THEIR OWN identity + applications/employee rows, so we subscribe with where()
// filters that match the Firestore rules (by uid and by verified email).
// Positions are readable by any signed-in user. syncAuth() is called by
// AuthProvider whenever the user changes.
let unsubPositions = null;
let unsubCandidateFns = []; // identity + application + employee listeners to tear down
let unsubNotifications = null;
let unsubScores = null; // WS5 — staff only, mirrors the applicationScores read rule
let authKey = null; // uid|role|email — avoid needless resubscribes on profile edits
// Every stream lands in one of these two bags, tagged by name, and we recompute
// the merged/joined views whenever any stream updates.
const identityStreams = new Map(); // streamName -> mapped identity docs
const streams = new Map(); // streamName -> mapped application/employee docs (each tagged _kind)
function setIdentityStream(name, docs) {
  identityStreams.set(name, docs);
  recompute();
}
function setStream(name, docs) {
  streams.set(name, docs);
  recompute();
}
function recompute() {
  const identityById = new Map();
  for (const docs of identityStreams.values()) for (const d of docs) identityById.set(d.personId, d);

  const appById = new Map();
  const empById = new Map();
  for (const docs of streams.values()) {
    for (const d of docs) (d._kind === "employee" ? empById : appById).set(d.id, d);
  }
  employees = [...empById.values()].sort((a, b) => (b.hiredAt || 0) - (a.hiredAt || 0));
  const liveApplications = [...appById.values()].map((app) => joinFlat(identityById.get(app.personId), app));
  candidates = [...liveApplications, ...employees].sort((a, b) => a.appliedAt - b.appliedAt);
  loading = false;
  commit();
}
function teardownData() {
  if (unsubPositions) unsubPositions();
  unsubPositions = null;
  if (unsubNotifications) unsubNotifications();
  unsubNotifications = null;
  if (unsubScores) unsubScores();
  unsubScores = null;
  unsubCandidateFns.forEach((fn) => fn());
  unsubCandidateFns = [];
  streams.clear();
  identityStreams.clear();
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
    notifications = [];
    scores = new Map();
    loading = false;
    commit();
    return;
  }

  loading = true;
  commit();

  // Notifications are addressed to this exact uid, regardless of role — a
  // candidate reads their own rejection notice, staff read their own mentions/
  // stage-change/offer-response pings (see notifyUser()).
  unsubNotifications = onSnapshot(
    query(collection(db, "notifications"), where("toUid", "==", user.uid)),
    (snap) => {
      notifications = snap.docs
        .map((d) => ({ id: d.id, ...d.data(), createdAt: ms(d.data().createdAt) }))
        .sort((a, b) => b.createdAt - a.createdAt);
      commit();
    },
    (err) => console.error("notifications listener:", err)
  );

  // Staff need every status (draft/open/closed) to manage the board; a
  // candidate's read is rule-gated to status == 'Open' (R6 — draft/closed
  // never leak). Firestore's rule-for-queries check requires the QUERY ITSELF
  // to structurally prove that gate — an unfiltered collection() listener
  // can't, and the whole read is denied outright for a non-staff caller, not
  // just the closed/draft docs. So the query has to carry the same filter the
  // rule checks, not just rely on the rule to narrow an unfiltered read.
  const positionsSource =
    user.role === "Candidate"
      ? query(collection(db, "positions"), where("status", "==", "Open"))
      : collection(db, "positions");
  unsubPositions = onSnapshot(
    positionsSource,
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

  const subscribeIdentityStream = (name, filter) => {
    const base = collection(db, "candidates");
    const ref = filter ? query(base, where(filter.field, "==", filter.value)) : base;
    unsubCandidateFns.push(
      onSnapshot(ref, (snap) => setIdentityStream(name, snap.docs.map(mapIdentity)), (err) => console.error(`${name} listener:`, err))
    );
  };
  // Subscribe one collection stream (optionally filtered) into the merge bag.
  const subscribeStream = (name, col, kind, filter) => {
    const base = collection(db, col);
    const ref = filter ? query(base, where(filter.field, "==", filter.value)) : base;
    unsubCandidateFns.push(
      onSnapshot(
        ref,
        (snap) => setStream(name, snap.docs.map((d) => ({ ...(kind === "employee" ? mapEmployee(d) : mapApplication(d)), _kind: kind }))),
        (err) => console.error(`${name} listener:`, err)
      )
    );
  };

  if (user.role === "Candidate") {
    // WS5/R3 — a candidate gets no scores subscription at all (matches the
    // staff-only read rule exactly), and any scores held over from a
    // previous staff session in this tab must not linger in memory.
    scores = new Map();
    // Scoped: only this person's OWN identity + rows — by uid and by verified
    // email — across /candidates (identity), /applications (their applications)
    // and /employees (their job, once hired).
    subscribeIdentityStream("id:uid", { field: "submittedByUid", value: user.uid });
    subscribeStream("app:uid", "applications", "application", { field: "submittedByUid", value: user.uid });
    subscribeStream("emp:uid", "employees", "employee", { field: "submittedByUid", value: user.uid });
    if (user.email) {
      subscribeIdentityStream("id:email", { field: "email", value: user.email });
      subscribeStream("app:email", "applications", "application", { field: "email", value: user.email });
      subscribeStream("emp:email", "employees", "employee", { field: "email", value: user.email });
    }
  } else {
    // Staff: the whole of all three collections.
    subscribeIdentityStream("id:all", null);
    subscribeStream("app:all", "applications", "application", null);
    subscribeStream("emp:all", "employees", "employee", null);
    // No auto-seed here: a brand-new Firestore starts genuinely empty. HR posts
    // real positions and candidates apply with real CVs — see CLAUDE.md, "no
    // dummy data" — an empty positions collection is the correct clean state,
    // not a signal to write demo data into it.

    // WS5 — applicationScores is staff-only (see firestore.rules); a Candidate
    // never subscribes to it at all, matching the read rule exactly rather
    // than relying on the rule alone to hide an attempted read.
    unsubScores = onSnapshot(
      collection(db, "applicationScores"),
      (snap) => {
        scores = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
        commit();
      },
      (err) => console.error("applicationScores listener:", err)
    );
  }
}

// --- selectors ---
export const getPositions = () => positions;
export const getPosition = (id) => positions.find((p) => p.id === id) || null;
export const getCandidatesFor = (positionId) => candidates.filter((c) => c.positionId === positionId);

/**
 * Write an in-app notification addressed to one user's uid. Used for the
 * things that used to live in a chat thread — a rejection, a stage change, a
 * requested review, an offer response — so nobody has to go ask. Never throws:
 * a failed notification must never block the action that triggered it.
 */
export async function notifyUser({ uid, type, message, candidateId = "", positionId = "" }) {
  if (!uid || !firebaseReady) return;
  try {
    await addDoc(collection(db, "notifications"), {
      toUid: uid, type, message, candidateId, positionId, read: false, createdAt: new Date(),
    });
  } catch (err) {
    console.error("notifyUser:", err);
  }
}

export async function markNotificationRead(id) {
  if (!firebaseReady) return;
  try {
    await updateDoc(doc(db, "notifications", id), { read: true });
  } catch (err) {
    console.error("markNotificationRead:", err);
  }
}

/** Staff directory, optionally filtered to a set of role names (e.g. picking a hiring manager). */
export async function listStaff(roles) {
  if (!firebaseReady) return [];
  const snap = await getDocs(collection(db, "users"));
  const raw = snap.docs.map((d) => {
    const x = d.data();
    return { uid: d.id, name: x.displayName || x.email || "Team member", role: x.role, email: x.email || "" };
  });
  const allowed = roles && roles.length ? raw.filter((u) => roles.includes(u.role)) : raw;
  const seen = new Set();
  const list = [];
  for (const u of allowed) {
    const key = `${u.role}::${u.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(u);
  }
  return list;
}

// WS5 5.5 — a position can never publish as Open without enough structured
// data for the engine to actually compare against a CV. requiredQualification
// is deliberately NOT required here (5.2/5.3) — a position can genuinely have
// no degree-level minimum, and forcing one would fabricate a requirement that
// was never stated. requiredSkills is the one thing that can't be optional:
// with zero required skills there is nothing left to compare a CV against at
// all, which is the entire premise of "initial filtration" per 4.8/WS5.
function assertPublishableRequirements(requirements) {
  const skills = requirements?.requiredSkills;
  if (!Array.isArray(skills) || skills.length === 0) {
    throw new Error(
      "A position needs at least one required skill before it can be opened — " +
      "add the position's required skills, or WS5 has nothing to score CVs against."
    );
  }
}

// --- mutators (write to Firestore when configured, else the mock arrays) ---
export async function addPosition({
  title, department, description, stages, minQualification = "", closesAt = 0,
  headcount = 1, hiringManagerUid = "", hiringManagerName = "",
  createdByRole = "", createdByUid = "", createdByName = "",
  requirements = null, shortlistThreshold = 0, level = "",
}) {
  // HR is the recruitment authority now, so a newly opened vacancy goes live
  // immediately — there's no separate Management approval step anymore. That
  // also means the WS5 5.5 publish-gate has to run HERE, not at some later
  // "publish" step — this IS the publish step.
  assertPublishableRequirements(requirements);
  const status = "Open";
  const data = {
    title: title.trim(),
    department: department.trim(),
    description: (description || "").trim(),
    status,
    stages: stages && stages.length ? stages : DEFAULT_PIPELINE,
    minQualification,
    level,
    requirements,
    shortlistThreshold: Math.max(0, Math.min(100, Number(shortlistThreshold) || 0)),
    // mandatory auto-close date: the position closes itself once this passes
    closesAt: closesAt ? new Date(closesAt) : null,
    headcount: Math.max(1, Number(headcount) || 1),
    hiredCount: 0, // incremented transactionally as candidates are hired — see hireCandidate()
    hiringManagerUid,
    hiringManagerName,
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

// WS1 — edit an existing vacancy (title/department/description/minQualification/
// requirements/close date/headcount/hiring manager). Deliberately does NOT touch
// stages/stageMeta/stageAssignees — that's savePipeline()'s job via
// StageConfigModal, a separate, already-working flow this doesn't duplicate.
export async function updatePosition(id, {
  title, department, description, minQualification = "", closesAt = 0,
  headcount = 1, hiringManagerUid = "", hiringManagerName = "",
  requirements = null, shortlistThreshold = 0, level = "",
}) {
  const current = positions.find((p) => p.id === id);
  if (!current) throw new Error(`updatePosition: no position ${id}`);

  // 5.5 — same gate as create: an Open position can never end up with empty
  // requiredSkills. A Closed position is terminal (can't be reopened) so
  // there's no live scoring surface left to protect there.
  if (current.status === "Open") assertPublishableRequirements(requirements);

  // Staleness is keyed on requirements ONLY — shortlistThreshold is a sibling
  // field computed and diffed separately, and never enters this comparison,
  // so editing it alone can never mark a score stale.
  const requirementsChanged = JSON.stringify(current.requirements || null) !== JSON.stringify(requirements || null);

  const data = {
    title: title.trim(),
    department: department.trim(),
    description: (description || "").trim(),
    minQualification,
    level,
    requirements,
    shortlistThreshold: Math.max(0, Math.min(100, Number(shortlistThreshold) || 0)),
    closesAt: closesAt ? new Date(closesAt) : null,
    headcount: Math.max(1, Number(headcount) || 1),
    hiringManagerUid,
    hiringManagerName,
  };

  if (firebaseReady) {
    await updateDoc(doc(db, "positions", id), data);
  } else {
    positions = positions.map((p) => (p.id === id ? { ...p, ...data } : p));
    commit();
  }

  // Requirements changed under applications that were scored against the OLD
  // ones — those scores were computed against a document comparison that no
  // longer exists (5.1: the vacancy IS one half of that comparison). Mark them
  // stale rather than silently leaving a number HR would otherwise trust. The
  // edit itself only flips the flag — it never clears it and never re-scores;
  // that's rescoreVacancy()'s job (5.2: "the re-score endpoint clears
  // staleness; the edit itself does not"). Scores live in applicationScores,
  // not on applications (see firestore.rules / CLAUDE.md 6.7 — R3).
  if (requirementsChanged && firebaseReady) {
    const scoresSnap = await getDocs(query(collection(db, "applicationScores"), where("positionId", "==", id)));
    await Promise.all(scoresSnap.docs.map((d) => updateDoc(d.ref, { stale: true })));
  }

  return { id, ...current, ...data };
}

// WS5 5.8 / WS8 §4 — the shortlist threshold lives on the position board now,
// not a create/edit modal field (OpenPositionModal no longer collects it). A
// narrow, dedicated mutator rather than routing through updatePosition():
// threshold changes are frequent (dragged, not typed) and, per 5.2, staleness
// is keyed on requirements ONLY — shortlistThreshold never enters that
// comparison — so this never needs assertPublishableRequirements or the
// requirements-changed diff updatePosition() carries.
export async function updatePositionThreshold(id, shortlistThreshold) {
  const value = Math.max(0, Math.min(100, Number(shortlistThreshold) || 0));
  if (firebaseReady) {
    await updateDoc(doc(db, "positions", id), { shortlistThreshold: value });
  } else {
    positions = positions.map((p) => (p.id === id ? { ...p, shortlistThreshold: value } : p));
    commit();
  }
  return value;
}

/**
 * WS5 5.2 — explicitly re-score every application for one vacancy: after
 * requirements were edited (existing scores already marked stale above),
 * after a threshold recalibration, or after an engineVersion bump. Never
 * automatic — HR triggers this from the shortlist screen. This function does
 * the Firestore reads/writes; the actual scoring runs in the stateless
 * /api/rescore-vacancy Function, sharing one embedding cache across every
 * candidate (5.5).
 */
const rescoreRuns = new Map();
const rescoreBusy = new Set();
export async function rescoreVacancy(positionId) {
  if (rescoreBusy.has(positionId)) return { ok: false, error: "A rescore is already running for this position." };
  rescoreBusy.add(positionId);
  try {
    return await rescoreApplied(positionId);
  } catch (e) {
    return { ok: false, error: e.message || "Rescoring failed. Retry to resume." };
  } finally {
    rescoreBusy.delete(positionId);
  }
}
async function rescoreApplied(positionId) {
  if (!firebaseReady) return { ok: false, error: "Not available in demo mode." };
  const position = positions.find((p) => p.id === positionId);
  if (!position) return { ok: false, error: "Position not found." };
  if (!position.requirements) return { ok: false, error: "This vacancy has no structured requirements set." };

  const appsSnap = await getDocs(query(collection(db, "applications"), where("positionId", "==", positionId)));
  const apps = appsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter(a => a.stage === "applied");
  if (!apps.length) return { ok: true, scored: 0, failed: 0 };

  // Each application's scorable profile lives on its IDENTITY doc, not the
  // application itself (WS1's split) — fetch every distinct person once.
  const personIds = [...new Set(apps.map((a) => a.personId).filter(Boolean))];
  const identityDocs = await Promise.all(personIds.map((pid) => getDoc(doc(db, "candidates", pid))));
  const identityById = new Map(identityDocs.filter((s) => s.exists()).map((s) => [s.id, s.data()]));

  const candidatesPayload = apps.map((a) => {
    const idn = identityById.get(a.personId) || {};
    return {
      candidateId: a.id, // tag results back to the APPLICATION id, not the person id
      skills: (idn.skills || "").split(",").map((s) => s.trim()).filter(Boolean),
      education: idn.education || [],
      totalYearsExperience: idn.totalYearsExperience || 0,
      extractionQuality: idn.extractionQuality || null,
      experienceEntries: idn.experienceEntries || [],
      needsReview: !!a.needsReview,
      cvTruncation: a.cvTruncation || null,
      extractedText: idn.cvExtractedText || "",
    };
  });

  let run = rescoreRuns.get(positionId);
  if (run && snapshotKey(run.requirements) !== snapshotKey(position.requirements)) {
    rescoreRuns.delete(positionId);
    return { ok: false, error: "Requirements changed. Previous retry snapshot discarded; start a new rescore." };
  }
  if (!run) {
    run = createRescoreRun(candidatesPayload, position.requirements);
    rescoreRuns.set(positionId, run);
  }
  const summary = await executeRescoreRun(run, {
    send: async body => {
      const res = await fetch("/api/rescore-vacancy", { method: "POST", headers: await scoringHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const error = new Error(data?.error || `HTTP ${res.status}`);
        error.fatal = [400, 401, 403, 413].includes(res.status);
        throw error;
      }
      return data;
    },
    persist: async (applicationId, result, requirements) => {
      await runTransaction(db, async tx => {
        const pos = await tx.get(doc(db, "positions", positionId));
        const app = await tx.get(doc(db, "applications", applicationId));
        if (!pos.exists() || snapshotKey(pos.data().requirements) !== snapshotKey(requirements) || !app.exists() || app.data().stage !== "applied" || app.data().positionId !== positionId) {
          const error = new Error("Application stage or requirements changed. Start a new rescore; historical assessments were not overwritten.");
          error.fatal = true;
          rescoreRuns.delete(positionId);
          throw error;
        }
        tx.set(doc(db, "applicationScores", applicationId), { ...result, positionId, status: "scored", stale: false, requirementsSnapshot: requirements });
      });
    },
  });
  if (summary.ok) rescoreRuns.delete(positionId);
  return summary;
}

// Fields that belong to the PERSON (shared across every application they ever
// make) rather than to one specific application. Keep in sync with what
// profileToCandidateFields() (WS4) and ApplyModal actually send.
const IDENTITY_FIELDS = new Set([
  "extractionQuality",
  "phone", "location", "fieldOfStudy", "highestQualification", "experience",
  "currentRole", "currentCompany", "skills", "linkedIn",
  "totalYearsExperience", "education", "experienceEntries", "certifications", "languages",
  "cvExtractedText", "emailFromCv", "emailMismatch",
  "cvFileName", "cvDataUrl", "cvSize", "submittedByUid",
]);

// Resolve (or create) the ONE identity record for a person, keyed on their
// email — the anchor that lets one person hold many applications while their
// CV/profile is written and corrected in exactly one place (WS1 + WS4). Reads
// happen before writes (Firestore transaction requirement); an existing
// identity is enriched with any new non-empty fields this application brought,
// never overwritten with blanks. A missing email (HR's quick "Add candidate"
// has no email field) gets a private, unshared identity — nothing to
// correlate without one.
async function upsertIdentityInTx(tx, email, seed) {
  const emailKey = normalizeEmail(email);
  const key = emailKey || `noemail_${uid("id")}`;
  const ref = doc(db, "candidates", key);
  const snap = emailKey ? await tx.get(ref) : null;
  if (snap && snap.exists()) {
    const cur = snap.data();
    const patch = {};
    for (const [k, v] of Object.entries(seed)) {
      if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) continue;
      patch[k] = v;
    }
    if (Object.keys(patch).length) tx.update(ref, patch);
    return { key, candidateId: cur.candidateId || "" };
  }
  const counterRef = doc(db, "counters", "candidates");
  const counterSnap = await tx.get(counterRef);
  const next = counterSnap.exists() ? Number(counterSnap.data().next) || CANDIDATE_SEQ_START : CANDIDATE_SEQ_START;
  const candidateId = fmtCandidateId(next);
  tx.set(counterRef, { next: next + 1 });
  tx.set(ref, { email: emailKey, candidateId, createdAt: new Date(), ...seed });
  return { key, candidateId };
}

/**
 * @param {object} [score] - a WS5 result already computed by the caller (via
 *   scoreOneApplication / /api/score-application) BEFORE this call — scoring
 *   never happens inside this function, it only writes what it's given.
 *   Written into applicationScores/{applicationId} in the SAME transaction as
 *   the application create, so a score is never visible without its
 *   application or vice versa. Omit entirely when there's nothing to score
 *   (e.g. HR's quick add, which collects no CV) or scoring failed/was
 *   skipped — never write a placeholder.
 */
export async function addCandidate({ name = "", email, positionId, appliedRole, score = null, ...extra }) {
  // Split the payload: identity-shaped fields persist once on the person;
  // everything else is specific to THIS application.
  const identitySeed = {};
  const appExtra = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || k === "candidateId") continue;
    (IDENTITY_FIELDS.has(k) ? identitySeed : appExtra)[k] = v;
  }
  const cleanName = name.trim();
  if (cleanName) identitySeed.name = cleanName;
  identitySeed.avatarColor = pickColor(cleanName || email || "");

  const source = appExtra.source || "Added by HR";
  const appData = {
    positionId,
    stage: "applied",
    appliedRole: (appliedRole || "").trim(),
    appliedAt: new Date(),
    rejection: null,
    comments: [],
    history: [{ type: "apply", from: null, to: "applied", at: Date.now(), by: source === "Self-applied" ? cleanName : "HR", byRole: "" }],
    ...appExtra,
    source,
  };

  if (firebaseReady) {
    let applicationId = "";
    let candidateId = "";
    let personId = "";
    const submittedByUid = identitySeed.submittedByUid || "";
    const emailKey = normalizeEmail(email);
    await runTransaction(db, async (tx) => {
      const identity = await upsertIdentityInTx(tx, email, identitySeed);
      personId = identity.key;
      candidateId = identity.candidateId;
      const appRef = doc(collection(db, "applications"));
      applicationId = appRef.id;
      tx.set(appRef, { ...appData, personId, email: emailKey, submittedByUid });
      if (score) {
        tx.set(doc(db, "applicationScores", applicationId), {
          positionId, status: "scored", stale: false, ...score,
        });
      }
    });
    return { id: applicationId, personId, candidateId, ...appData, email: emailKey, submittedByUid, appliedAt: Date.now() };
  }

  // mock mode
  const personId = normalizeEmail(email) || `noemail_${uid("id")}`;
  let identity = mockIdentities.get(personId);
  if (!identity) {
    const candidateId = fmtCandidateId(Math.max(CANDIDATE_SEQ_START - 1, ...[...mockIdentities.values()].map((i) => parseCandNum(i.candidateId)), 0) + 1);
    identity = { personId, email: personId, candidateId, ...identitySeed };
    mockIdentities.set(personId, identity);
  } else {
    for (const [k, v] of Object.entries(identitySeed)) {
      if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) identity[k] = v;
    }
  }
  const app = { id: uid("app"), personId, email: personId, submittedByUid: identitySeed.submittedByUid || "", ...appData, appliedAt: Date.now() };
  mockApplications.push(app);
  if (score) mockScores.set(app.id, { positionId, status: "scored", stale: false, ...score });
  recomputeMock();
  commit();
  return { ...app, candidateId: identity.candidateId };
}

/**
 * A candidate applying to an open position. One person may hold applications
 * to many different vacancies at once (WS1): the only things that block an
 * apply are being already hired (globally terminal), being rejected from THIS
 * exact posting, or already having a live application to THIS exact posting.
 * Every application is tagged "Self-applied".
 */
export async function applyToPosition(payload) {
  const authUid = payload.submittedByUid;
  const email = (payload.email || "").toLowerCase();
  const mine = candidates.filter(
    (c) => (authUid && c.submittedByUid === authUid) || (email && (c.email || "").toLowerCase() === email)
  );
  const pos = positions.find((p) => p.id === payload.positionId);
  const appliedRole = pos ? pos.title : payload.appliedRole || "";

  // The vacancy must actually be open (not closed, not past its auto-close date).
  if (pos && !isOpenNow(pos)) {
    const err = new Error("This position is closed and no longer accepting applications.");
    err.code = "position-closed";
    throw err;
  }

  // HIRED is terminal — a hired person can never apply to another role, anywhere.
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

  // No duplicate record for the SAME vacancy — but applying to a DIFFERENT
  // vacancy while this one is still active is exactly what WS1 asks for.
  if (mine.some((c) => c.positionId === payload.positionId && c.stage !== "rejected")) {
    const err = new Error("You've already applied to this role.");
    err.code = "already-applied-here";
    throw err;
  }
  return addCandidate({ ...payload, appliedRole, source: "Self-applied" });
}

/**
 * Make sure a STAFF account has a readable User ID (USR-####), minting one the
 * first time it's missing. Self-healing: called on login, so the existing
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

// --- WS8 interviewer specialisation (fields on users/{uid}, not a separate
// collection — see CLAUDE.md WS8 §8.3 deviation note) ------------------------
// Scoped to DevOps only (§8.0); `levels` is which seniorities they're eligible
// to interview at, reusing the intern/junior/senior vocabulary the pipeline
// already uses informally (JUNIOR_PIPELINE).
export async function updateStaffSpecialisation(uid, { domain = "devops", levels = [] } = {}) {
  if (!firebaseReady || !uid) return;
  await setDoc(doc(db, "users", uid), { domain, levels }, { merge: true });
}

/**
 * WS8 §8.2a — the DevOps interviewer directory the calendar view draws from.
 * Unlike listStaff() (name/role/email only, used for generic staff pickers),
 * this projects the fields the calendar actually needs: avatarColor (so a
 * person's calendar bars match the same color they have everywhere else in
 * the app — no separate calendar-only palette) and domain/levels (§8.0/§8.1
 * scoping + the level filter). Scoped to domain === "devops" — per §8.0,
 * scheduling only concerns this one domain for this release.
 */
export async function listInterviewers() {
  if (!firebaseReady) return [];
  const snap = await getDocs(collection(db, "users"));
  return snap.docs
    .map((d) => {
      const x = d.data();
      return {
        uid: d.id,
        name: x.displayName || x.email || "Team member",
        role: x.role || "",
        avatarColor: x.avatarColor || "#64748B",
        domain: x.domain || "",
        levels: x.levels || [],
      };
    })
    .filter((u) => u.domain === "devops");
}

// --- WS8 declared availability (self-declared, never inferred) -------------
function mapAvailabilityDoc(x) {
  return {
    timeZone: x.timeZone || "",
    slots: x.slots || [],
    exceptions: x.exceptions || [],
    declaredAt: ms(x.declaredAt),
    validUntil: ms(x.validUntil),
    onLeave: false, // reserved for a whole-record leave flag; today leave is per-date via exceptions
  };
}

/** The signed-in user's own declared availability, or null if never declared. */
export async function getAvailability(uid) {
  if (!firebaseReady || !uid) return null;
  const snap = await getDoc(doc(db, "availability", uid));
  return snap.exists() ? mapAvailabilityDoc(snap.data()) : null;
}

// Staff declare their OWN weekly recurring windows + one-off exceptions —
// never someone else's (enforced by firestore.rules, not just this client).
// Re-declaring always refreshes timeZone/declaredAt/validUntil: WS8 §8.3's
// 14-day validity window exists so a stale declaration can't outlive a change
// of project assignment, so every save is a FRESH, dated claim, never a quiet
// edit of an old one that leaves declaredAt looking older than it should.
export async function saveAvailability(uid, { slots = [], exceptions = [] } = {}) {
  if (!firebaseReady || !uid) return;
  const now = new Date();
  await setDoc(doc(db, "availability", uid), {
    timeZone: browserTimeZone(),
    slots,
    exceptions,
    declaredAt: now,
    validUntil: new Date(now.getTime() + AVAILABILITY_VALIDITY_MS),
  });
}

// Real Firestore-backed DeclaredAvailabilityProvider (src/lib/availability.js)
// — the interface exists so a real calendar source can replace this later
// (CLAUDE.md WS8 §8.8, deferred) without touching any consumer. `interviews`
// has no documents yet until WS8 Part C ships the assignment flow that
// creates them; querying it now is harmless (an empty snapshot), not an error,
// and saves Part B from re-wiring this plumbing.
const availabilityProvider = createDeclaredAvailabilityProvider({
  fetchAvailabilityDocs: async (staffIds) => {
    if (!firebaseReady || !staffIds.length) return {};
    const snaps = await Promise.all(staffIds.map((id) => getDoc(doc(db, "availability", id))));
    const out = {};
    staffIds.forEach((id, i) => { if (snaps[i].exists()) out[id] = mapAvailabilityDoc(snaps[i].data()); });
    return out;
  },
  fetchCommitments: async (staffIds, { fromMs, toMs }) => {
    if (!firebaseReady || !staffIds.length) return {};
    // Firestore 'in' caps at 30 values — comfortably above §8.0's DevOps-only
    // interviewer pool for this release.
    const snap = await getDocs(query(collection(db, "interviews"), where("interviewerId", "in", staffIds.slice(0, 30))));
    const out = {};
    snap.docs.forEach((d) => {
      const x = d.data();
      if (!["pending_confirmation", "confirmed"].includes(x.status)) return;
      const startMs = ms(x.scheduledAt);
      const endMs = startMs + (x.durationMs || 60 * 60 * 1000);
      if (endMs <= fromMs || startMs >= toMs) return;
      (out[x.interviewerId] ||= []).push({ startMs, endMs, source: "interview" });
    });
    return out;
  },
});
/** Calendar-ready availability for a set of staff over a date range — see DeclaredAvailabilityProvider. */
export const getStaffAvailability = (staffIds, range) => availabilityProvider.getAvailability(staffIds, range);

/**
 * Just the declared/unknown/unavailable STATE for a set of staff — no
 * materialized slots, no commitments. Used anywhere that needs to show
 * "has this person told us anything about their schedule" (StageConfigModal's
 * assignment picker) without paying for a full calendar-range fetch.
 */
export async function getAvailabilityStates(uids) {
  if (!firebaseReady || !uids.length) return {};
  const snaps = await Promise.all(uids.map((id) => getDoc(doc(db, "availability", id))));
  const out = {};
  uids.forEach((id, i) => { out[id] = availabilityState(snaps[i].exists() ? mapAvailabilityDoc(snaps[i].data()) : null); });
  return out;
}

/** Full declared-availability RECORDS (not just state) for a set of staff — what the ranking engine needs to check a specific proposed time. */
export async function getAvailabilityRecords(uids) {
  if (!firebaseReady || !uids.length) return {};
  const snaps = await Promise.all(uids.map((id) => getDoc(doc(db, "availability", id))));
  const out = {};
  uids.forEach((id, i) => { out[id] = snaps[i].exists() ? mapAvailabilityDoc(snaps[i].data()) : null; });
  return out;
}

// --- WS8 Part C — automated interview assignment ----------------------------
// CLAUDE.md WS8 §8.6: "fewest current assignments" is REAL BOOKING LOAD — how
// many interviews someone currently holds — never the pipeline-team-membership
// count StageConfigModal shows (see that section's note, added 2026-09-16).
// This is that real count, computed fresh from /interviews every time it's
// needed, never cached, never borrowed from a UI badge.
export async function getBookingCounts(uids) {
  if (!firebaseReady || !uids.length) return {};
  const snap = await getDocs(query(collection(db, "interviews"), where("interviewerId", "in", uids.slice(0, 30))));
  const out = {};
  snap.docs.forEach((d) => {
    const x = d.data();
    if (!["pending_confirmation", "confirmed"].includes(x.status)) return;
    out[x.interviewerId] = (out[x.interviewerId] || 0) + 1;
  });
  return out;
}

function mapInterviewDoc(d) {
  const x = d.data();
  return {
    id: d.id,
    applicationId: x.applicationId || "", positionId: x.positionId || "", stageId: x.stageId || "",
    candidateName: x.candidateName || "",
    scheduledAt: ms(x.scheduledAt), durationMs: x.durationMs || 3600000,
    status: x.status,
    rankedCandidates: x.rankedCandidates || [],
    excludedCandidates: x.excludedCandidates || [],
    poolReason: x.poolReason || null,
    interviewerId: x.interviewerId || null,
    requestedAt: x.requestedAt ? ms(x.requestedAt) : 0,
    respondedBy: x.respondedBy || [],
    createdAt: ms(x.createdAt), createdByUid: x.createdByUid || "", createdByName: x.createdByName || "",
    overriddenBy: x.overriddenBy || null,
  };
}
const interviewMessage = (candidateName) => `New DevOps interview request${candidateName ? ` for ${candidateName}` : ""} — respond from your notifications.`;

// A uid-keyed lookup of "who comes after this person in the ranking" — the
// mechanism the decline-cascade rule reads from. Chosen over indexing into
// `rankedCandidates` by position: live testing against the deployed rules
// showed a POSITION-indexed check (`rankedCandidates[currentRankIndex].uid`)
// did not actually constrain the write the way it reads — a forged
// reassignment to an arbitrary, unranked uid was incorrectly ALLOWED. A
// uid-KEYED map lookup (`rankedInfo[interviewerId].nextUid`) is the same
// pattern this ruleset already trusts elsewhere (`myRole()`, `stageOwner()`
// via a role string), verified live to actually deny a forged value — see
// firestore.rules and scratch-ws8/verify-cascade-rules.mjs.
// "" (never stored `null`) marks the end of the chain — a nested map field
// compared to `null` inside firestore.rules was found, live, NOT to behave as
// a straightforward equality check (see that file's comment); an empty
// string sentinel sidesteps the ambiguity entirely and compares reliably.
const NO_NEXT = "";
const buildRankedInfo = (ranked) => {
  const info = {};
  ranked.forEach((r, i) => { info[r.uid] = { nextUid: ranked[i + 1]?.uid || NO_NEXT }; });
  return info;
};

/**
 * WS8 §8/8.6 — the TRIGGER. Called the moment a candidate lands in a
 * schedulable stage (isSchedulableStage(), PositionDetail's move flow) with an
 * HR-proposed slot. Ranks the eligible DevOps pool for this position's level,
 * requests the top pick, and — critically — STORES the full ranking (and why
 * anyone was excluded) on the record itself. Nothing about this ranking is
 * ever recomputed later: the record IS the explanation, permanently.
 */
export async function createInterviewRequest({ applicationId, positionId, stageId, candidateName = "", scheduledAt, durationMs = 3600000, actor }) {
  if (!firebaseReady) return null;
  const position = positions.find((p) => p.id === positionId);
  const ownerRole = stageOwnerRole(position, stageId);
  const pool = (await listInterviewers()).filter((p) => p.role === ownerRole || p.role === ROLES.MANAGEMENT);
  const uids = pool.map((p) => p.uid);
  const [availabilityRecords, bookingCounts] = await Promise.all([getAvailabilityRecords(uids), getBookingCounts(uids)]);
  const { ranked, excluded, poolReason } = rankEligibleInterviewers({ interviewers: pool, position, targetMs: scheduledAt, availabilityRecords, bookingCounts });

  const data = {
    applicationId, positionId, stageId, candidateName,
    scheduledAt: new Date(scheduledAt), durationMs,
    status: ranked.length ? "pending_confirmation" : "needs_attention",
    rankedCandidates: ranked, rankedInfo: buildRankedInfo(ranked),
    excludedCandidates: excluded, poolReason,
    // "" (never `null`), same NO_NEXT sentinel as rankedInfo — see that
    // constant's comment. interviewerId is compared inside firestore.rules,
    // and a real Firebase uid is never "", so this sentinel can never be
    // mistaken for a real assignment by any rule that checks it against
    // request.auth.uid.
    interviewerId: ranked.length ? ranked[0].uid : NO_NEXT,
    requestedAt: ranked.length ? new Date() : null,
    respondedBy: [],
    createdAt: new Date(), createdByUid: actor?.uid || "", createdByName: actor?.name || "",
    overriddenBy: null,
  };
  const ref = await addDoc(collection(db, "interviews"), data);
  if (ranked.length) {
    await notifyUser({ uid: ranked[0].uid, type: "interview_request", message: interviewMessage(candidateName), candidateId: applicationId, positionId });
  }
  return mapInterviewDoc({ id: ref.id, data: () => data });
}

/**
 * The interviewer's own response to THEIR current pending request.
 *   accept  → confirmed, becomes a real commitment on their calendar (the
 *             existing DeclaredAvailabilityProvider already reads /interviews
 *             for commitments — nothing else needs to change for that).
 *   decline → mechanically advances via the pre-computed rankedInfo pointer
 *             (never a fresh rank, never a value the interviewer chose) — or,
 *             if exhausted, flips to needs_attention. Enforced again, not
 *             just trusted, by firestore.rules (see that file's comment).
 */
export async function respondToInterviewRequest(interviewId, { accept, actor }) {
  if (!firebaseReady) return { ok: false };
  const ref = doc(db, "interviews", interviewId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, reason: "not-found" };
  const x = snap.data();
  if (x.status !== "pending_confirmation") return { ok: false, reason: "not-pending" };
  if (x.interviewerId !== (actor?.uid || "")) return { ok: false, reason: "not-yours" };

  if (accept) {
    await updateDoc(ref, { status: "confirmed" });
    return { ok: true, status: "confirmed" };
  }

  // NO_NEXT ("") when exhausted — never `null`, matching rankedInfo's own
  // sentinel and what firestore.rules compares interviewerId against.
  const nextUid = x.rankedInfo?.[x.interviewerId]?.nextUid || NO_NEXT;
  await updateDoc(ref, {
    interviewerId: nextUid,
    status: nextUid ? "pending_confirmation" : "needs_attention",
    requestedAt: nextUid ? new Date() : null,
    respondedBy: arrayUnion({ uid: actor?.uid || "", name: actor?.name || "", action: "declined", at: Date.now() }),
  });
  if (nextUid) {
    await notifyUser({ uid: nextUid, type: "interview_request", message: interviewMessage(x.candidateName), candidateId: x.applicationId, positionId: x.positionId });
  }
  return { ok: true, status: nextUid ? "pending_confirmation" : "needs_attention" };
}

/**
 * WS8 §15 — HR's manual override. Works standalone (a brand-new interview
 * with no `interviewId`) or redirects an existing needs_attention record onto
 * whoever HR picks — either way it never depends on the ranking having
 * produced anyone, and it's the ONLY path that can hand a record to someone
 * the ranking excluded (HR overrides are a deliberate human decision, not a
 * ranking bypass bug).
 */
export async function overrideInterviewRequest({ interviewId = null, applicationId, positionId, stageId, candidateName = "", interviewerId, scheduledAt, durationMs = 3600000, actor }) {
  if (!firebaseReady) return { ok: false };
  const overriddenBy = { uid: actor?.uid || "", name: actor?.name || "" };
  if (interviewId) {
    await updateDoc(doc(db, "interviews", interviewId), {
      interviewerId, status: "pending_confirmation", requestedAt: new Date(),
      scheduledAt: new Date(scheduledAt), durationMs, overriddenBy,
    });
  } else {
    const data = {
      applicationId, positionId, stageId, candidateName,
      scheduledAt: new Date(scheduledAt), durationMs,
      status: "pending_confirmation",
      // No ranking behind a manual pick — rankedInfo stays empty, so if this
      // person declines it correctly falls to needs_attention (nothing to
      // cascade to) rather than silently inventing a next candidate that was
      // never actually ranked for this request.
      rankedCandidates: [], rankedInfo: {}, excludedCandidates: [], poolReason: null,
      interviewerId, requestedAt: new Date(), respondedBy: [],
      createdAt: new Date(), createdByUid: actor?.uid || "", createdByName: actor?.name || "",
      overriddenBy,
    };
    const ref = await addDoc(collection(db, "interviews"), data);
    interviewId = ref.id;
  }
  await notifyUser({ uid: interviewerId, type: "interview_request", message: interviewMessage(candidateName), candidateId: applicationId, positionId });
  return { ok: true, id: interviewId };
}

/** Every interview record for one application — HR's "needs attention" / status view. */
export async function getInterviewsForApplication(applicationId) {
  if (!firebaseReady || !applicationId) return [];
  const snap = await getDocs(query(collection(db, "interviews"), where("applicationId", "==", applicationId)));
  return snap.docs.map((d) => mapInterviewDoc(d));
}

/** One interviewer's own currently-pending requests. */
export async function getPendingInterviewsForStaff(uid) {
  if (!firebaseReady || !uid) return [];
  const snap = await getDocs(query(collection(db, "interviews"), where("interviewerId", "==", uid), where("status", "==", "pending_confirmation")));
  return snap.docs.map((d) => mapInterviewDoc(d));
}

export async function getInterview(id) {
  if (!firebaseReady || !id) return null;
  const snap = await getDoc(doc(db, "interviews", id));
  return snap.exists() ? mapInterviewDoc(snap) : null;
}

// Which collection holds this application id? A HIRED person's row lives in
// /employees, everyone else in /applications — so updates (comments, edits)
// hit the right document.
const collectionForId = (id) => (employees.some((e) => e.id === id) ? "employees" : "applications");

// Persist a change to one application (or its post-hire employee snapshot).
// Array fields (history/comments) are mutated with arrayUnion/arrayRemove so
// two people acting on the same candidate at once can't clobber each other's
// entries (the old read-modify-write on `[...arr, x]` silently lost writes).
async function writeApplication(id, { set = {}, appendHistory = null, appendComment = null, removeComment = null } = {}) {
  if (firebaseReady) {
    const patch = { ...set };
    if (appendHistory) patch.history = arrayUnion(appendHistory);
    if (appendComment) patch.comments = arrayUnion(appendComment);
    if (removeComment) patch.comments = arrayRemove(removeComment);
    await updateDoc(doc(db, collectionForId(id), id), patch);
    return;
  }
  const applyPatch = (obj) => {
    const next = { ...obj, ...set };
    if (appendHistory) next.history = [...(obj.history || []), appendHistory];
    if (appendComment) next.comments = [...(obj.comments || []), appendComment];
    if (removeComment) next.comments = (obj.comments || []).filter((cm) => cm !== removeComment);
    return next;
  };
  const ai = mockApplications.findIndex((a) => a.id === id);
  if (ai !== -1) {
    mockApplications[ai] = applyPatch(mockApplications[ai]);
  } else {
    const ei = mockEmployeesList.findIndex((e) => e.id === id);
    if (ei !== -1) mockEmployeesList[ei] = applyPatch(mockEmployeesList[ei]);
  }
  recomputeMock();
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
 * For every stage AFTER Applied, the acting user must first have left a
 * SCORE at the current stage — otherwise { ok:false, reason:"review-required" }.
 * Comment TEXT is only mandatory on top of that when the score is below the
 * position's shortlist threshold (WS8 §4) — otherwise { ok:false,
 * reason:"comment-required" }. Applied is exempt (it's just an application).
 * The review is copied onto the history entry so it shows in the candidate's
 * timeline.
 */
export async function advanceStage(candidateId, actor, opts = {}) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand) return { ok: false, reason: "not-found" };
  const pos = positions.find((p) => p.id === cand.positionId);
  if (cand.stage === "applied" && (opts.screeningBulk || opts.overrideBulk) && !canBulkSelect(scores.get(candidateId), pos, cand)) {
    return { ok: false, reason: "mandatory-eligibility-required" };
  }
  const nx = nextStage(pos ? pos.stages : DEFAULT_PIPELINE, cand.stage);
  if (!nx) return { ok: false, reason: "terminal" };

  const uidActor = idOf(actor);
  const review = (cand.comments || []).find(
    (cm) => commentId(cm) === uidActor && cm.stage === cand.stage
  );
  if (cand.stage !== "applied") {
    // A score is mandatory for every move past Applied, unconditionally.
    if (!review || review.score == null) {
      return { ok: false, reason: "review-required" };
    }
    // WS8 §4 — comment TEXT is only mandatory when this score is below the
    // position's shortlist threshold; the SAME >= comparison the
    // Applied-column colour uses (meetsShortlistThreshold in scoreStaleness.js),
    // so a green candidate can never be the one this blocks.
    if (!meetsShortlistThreshold(scores.get(candidateId), pos) && !(review.text && review.text.trim())) {
      return { ok: false, reason: "comment-required" };
    }
  }
  // Ties the loop closed: nobody reaches "hired" without a candidate-accepted offer.
  if (nx === "hired" && cand.offer?.status !== "accepted") {
    return { ok: false, reason: "offer-required" };
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
    const employeeId = await hireCandidate(candidateId, { deptName, title, entry, positionId: cand.positionId, personId: cand.personId });
    return { ok: true, hired: true, employeeId };
  }

  await writeApplication(candidateId, { set: { stage: nx }, appendHistory: entry });
  return { ok: true };
}

/**
 * Move an application into "hired" AND mint an employee ID in ONE atomic step.
 * The employee number is claimed from counters/employees inside the same
 * transaction as the writes, so the number and the hire commit together (or not
 * at all). The transaction reads the application + its identity + the position,
 * writes a full flattened snapshot into /employees (same shape as before this
 * split), deletes the application (its identity persists — a person's CV/profile
 * outlive any one application), and bumps the position's hiredCount, closing it
 * once headcount is filled (WS1 "hire and close"). Returns the issued employee
 * ID string.
 */
async function hireCandidate(applicationId, { deptName, title, entry, positionId, personId }) {
  if (firebaseReady) {
    const appRef = doc(db, "applications", applicationId);
    const identityRef = personId ? doc(db, "candidates", personId) : null;
    const counterRef = doc(db, "counters", "employees");
    const posRef = positionId ? doc(db, "positions", positionId) : null;
    let employeeId = "";
    await runTransaction(db, async (tx) => {
      // All reads first (Firestore requires reads before writes in a transaction).
      const appSnap = await tx.get(appRef);
      if (!appSnap.exists()) throw new Error("application-not-found");
      const app = appSnap.data();
      const identitySnap = identityRef ? await tx.get(identityRef) : null;
      const identity = identitySnap && identitySnap.exists() ? identitySnap.data() : {};
      const counterSnap = await tx.get(counterRef);
      const next = counterSnap.exists() ? Number(counterSnap.data().next) || EMPLOYEE_SEQ_START : EMPLOYEE_SEQ_START;
      const posSnap = posRef ? await tx.get(posRef) : null;
      employeeId = makeEmployeeId(deptName, title, next);
      const history = Array.isArray(app.history) ? [...app.history, entry] : [entry];
      tx.set(doc(db, "employees", employeeId), {
        personId: personId || "",
        candidateId: identity.candidateId || "",
        name: identity.name || "",
        email: identity.email || app.email || "",
        avatarColor: identity.avatarColor || "#1F3A5F",
        phone: identity.phone || "",
        location: identity.location || "",
        highestQualification: identity.highestQualification || "",
        fieldOfStudy: identity.fieldOfStudy || "",
        experience: identity.experience || "",
        currentRole: identity.currentRole || "",
        currentCompany: identity.currentCompany || "",
        skills: identity.skills || "",
        linkedIn: identity.linkedIn || "",
        totalYearsExperience: identity.totalYearsExperience || 0,
        education: identity.education || [],
        experienceEntries: identity.experienceEntries || [],
        certifications: identity.certifications || [],
        languages: identity.languages || [],
        cvExtractedText: identity.cvExtractedText || "",
        emailFromCv: identity.emailFromCv || "",
        emailMismatch: !!identity.emailMismatch,
        cvFileName: identity.cvFileName || "",
        cvDataUrl: identity.cvDataUrl || "",
        cvSize: identity.cvSize || 0,
        submittedByUid: identity.submittedByUid || app.submittedByUid || "",
        positionId: app.positionId,
        appliedRole: app.appliedRole,
        coverNote: app.coverNote || "",
        source: app.source || "Added by HR",
        needsReview: !!app.needsReview,
        cvValidation: app.cvValidation || null,
        offer: app.offer || null,
        rejection: app.rejection || null,
        comments: Array.isArray(app.comments) ? app.comments : [],
        stage: "hired",
        employeeId,
        employeeDept: deptName,
        employeeRole: title,
        hiredAt: new Date(),
        appliedAt: app.appliedAt || new Date(),
        history,
      });
      tx.delete(appRef);
      tx.set(counterRef, { next: next + 1 });
      // Fill the requisition: bump hiredCount, close the position once headcount is met.
      if (posSnap && posSnap.exists()) {
        const p = posSnap.data();
        const headcount = Number(p.headcount) || 1;
        const hiredCount = (Number(p.hiredCount) || 0) + 1;
        tx.update(posRef, hiredCount >= headcount ? { hiredCount, status: "Closed" } : { hiredCount });
      }
    });
    return employeeId;
  }
  // mock mode
  const identity = mockIdentities.get(personId) || {};
  const nextNum = Math.max(EMPLOYEE_SEQ_START - 1, ...mockEmployeesList.map((e) => parseCandNum(e.employeeId)), 0) + 1;
  const employeeId = makeEmployeeId(deptName, title, nextNum);
  const ai = mockApplications.findIndex((a) => a.id === applicationId);
  const app = ai !== -1 ? mockApplications[ai] : null;
  if (ai !== -1) mockApplications.splice(ai, 1);
  mockEmployeesList.push(joinFlat(identity, {
    ...(app || { id: applicationId, positionId, appliedRole: title, appliedAt: Date.now(), coverNote: "", source: "Added by HR", needsReview: false, cvValidation: null, offer: null, rejection: null, comments: [] }),
    id: applicationId, stage: "hired", employeeId, employeeDept: deptName, employeeRole: title,
    hiredAt: Date.now(), history: [...((app && app.history) || []), entry],
  }));
  positions = positions.map((p) => {
    if (p.id !== positionId) return p;
    const hiredCount = (p.hiredCount || 0) + 1;
    return { ...p, hiredCount, status: hiredCount >= (p.headcount || 1) ? "Closed" : p.status };
  });
  recomputeMock();
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
  await writeApplication(candidateId, { set: { stage: "rejected", rejection }, appendHistory: entry });
  // Notify the applicant, if this application is linked to a real account (a
  // candidate added directly by HR with no login has nowhere to be notified).
  if (cand.submittedByUid) {
    const pos = positions.find((p) => p.id === cand.positionId);
    notifyUser({
      uid: cand.submittedByUid,
      type: "rejection",
      message: `Your application for ${pos?.title || "this role"} wasn't successful${reason ? ` — ${reason}` : ""}.`,
      candidateId,
      positionId: cand.positionId,
    });
  }
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
  await writeApplication(candidateId, { set: { stage: "applied", rejection: null }, appendHistory: entry });
}

/**
 * Add a reviewer comment to a candidate. Any staff member can leave their
 * thoughts; the note is tagged with who wrote it, their role and the stage the
 * candidate was at — so the next reviewer down the pipeline can read it.
 */
const RECOMMENDATIONS = ["advance", "reject", "hold"];

export async function addComment(candidateId, { text, score = null, recommendation = null, actor }) {
  const cand = candidates.find((c) => c.id === candidateId);
  const hasText = !!(text && text.trim());
  // Validate the score here too (not just below) so a text-less "score only"
  // review (WS8 §4 — comment text is optional at/above the position's
  // shortlist threshold) can still be told apart from truly empty input.
  const scoreNum = score !== null && score !== undefined && score !== "" ? Number(score) : NaN;
  const hasScore = Number.isFinite(scoreNum);
  if (!cand || (!hasText && !hasScore)) return;
  // One comment per user per stage — enforced HERE, not only in the UI, so a
  // second tab or a stray caller can't post a duplicate review.
  const mine = idOf(actor);
  if ((cand.comments || []).some((cm) => commentId(cm) === mine && cm.stage === cand.stage)) return;
  const entry = { stage: cand.stage, at: Date.now(), ...actorFields(actor) };
  if (hasText) entry.text = text.trim();
  // Clamp to 0–100 — already validated finite above.
  if (hasScore) entry.score = Math.min(100, Math.max(0, Math.round(scoreNum)));
  // Structured recommendation (advance / reject / hold) — this is what turns a
  // scorecard into a decision, not just free-text feedback. Anything else is dropped.
  if (RECOMMENDATIONS.includes(recommendation)) entry.recommendation = recommendation;
  await writeApplication(candidateId, { appendComment: entry });
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
  await writeApplication(candidateId, { removeComment: target });
}

const OFFER_STATUSES = ["sent", "accepted", "declined", "negotiating"];

/** Create and send an offer — salary + start date, status starts at "sent". */
export async function sendOffer(candidateId, { salary, startDate, actor }) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand || !String(salary || "").trim() || !startDate) return;
  const offer = { salary: String(salary).trim(), startDate, status: "sent", sentAt: Date.now(), ...actorFields(actor) };
  const entry = { type: "offer", status: "sent", at: Date.now(), ...actorFields(actor) };
  await writeApplication(candidateId, { set: { offer }, appendHistory: entry });
}

/** Record the candidate's response to an offer already sent. */
export async function respondToOffer(candidateId, { status, actor }) {
  const cand = candidates.find((c) => c.id === candidateId);
  if (!cand || !cand.offer || !OFFER_STATUSES.includes(status)) return;
  const offer = { ...cand.offer, status, respondedAt: Date.now() };
  const entry = { type: "offer", status, at: Date.now(), ...actorFields(actor) };
  await writeApplication(candidateId, { set: { offer }, appendHistory: entry });
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

/**
 * Record a CV validation rejection (WS3) — demo evidence that the gate
 * actually works. Only ever called for a hard BLOCK, never a pass or a
 * needs-review accept, matching the brief's "log every rejection" scope.
 */
export async function logCvRejection({ reason, stage, confidence, missingSections, fileName, fileSize, positionId, submittedByUid }) {
  const data = {
    reason: reason || "",
    stage: stage || "",
    confidence: confidence ?? null,
    missingSections: missingSections || [],
    fileName: fileName || "",
    fileSize: fileSize || 0,
    positionId: positionId || "",
    submittedByUid: submittedByUid || "",
    at: new Date(),
  };
  if (firebaseReady) {
    await addDoc(collection(db, "validation_logs"), data);
    return;
  }
  // Mock mode: nothing to persist to — no UI reads this collection, it's pure
  // demo evidence for a real Firestore-backed deployment.
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
