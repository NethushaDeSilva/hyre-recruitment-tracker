// The interview pipeline stages — single source of truth for stage identity,
// labels, colours and OWNERSHIP. Recruitment is a multi-stage filtering process,
// not one flow: HR does initial screening, the business/department reviews and
// interviews shortlisted people, and senior management handles the final round.
// Each stage records which role is responsible for moving a candidate out of it.
import { ROLES } from "@/lib/permissions";

// owner = the role that actions (advances / rejects) a candidate sitting in this
// stage. Management can act on any stage (see canActOnStage). null = terminal.
export const STAGES = {
  applied:    { id: "applied",    label: "Applied",            dot: "#64748B", badgeBg: "#EEF1F5", badgeFg: "#64748B", owner: ROLES.HR },
  screening:  { id: "screening",  label: "HR Screening",       dot: "#2563EB", badgeBg: "#E7EEFE", badgeFg: "#2563EB", owner: ROLES.HR },
  dept:       { id: "dept",       label: "Department Review",  dot: "#0EA5E9", badgeBg: "#E0F2FE", badgeFg: "#0369A1", owner: ROLES.INTERVIEWER },
  interview:  { id: "interview",  label: "Initial Interview",  dot: "#4F46E5", badgeBg: "#ECEBFB", badgeFg: "#4F46E5", owner: ROLES.INTERVIEWER },
  interview2: { id: "interview2", label: "Further Interview",  dot: "#7C3AED", badgeBg: "#F1EBFC", badgeFg: "#7C3AED", owner: ROLES.INTERVIEWER },
  final:      { id: "final",      label: "Final Interview",    dot: "#E0A422", badgeBg: "#FBF1DC", badgeFg: "#A9781A", owner: ROLES.MANAGEMENT },
  hired:      { id: "hired",      label: "Hired",              dot: "#16A34A", badgeBg: "#E7F6EC", badgeFg: "#16A34A", owner: null },
  rejected:   { id: "rejected",   label: "Rejected",           dot: "#DC2626", badgeBg: "#FBE9E9", badgeFg: "#DC2626", owner: null },
  hold:       { id: "hold",       label: "On hold",            dot: "#94A3B8", badgeBg: "#EEF1F5", badgeFg: "#94A3B8", owner: ROLES.HR },
};

// A position's pipeline is an ordered list of stage ids. Applied + Hired always
// bookend it; the middle stages are configurable per vacancy.
export const DEFAULT_PIPELINE = ["applied", "screening", "dept", "interview", "final", "hired"];
export const JUNIOR_PIPELINE = ["applied", "screening", "interview", "hired"]; // lighter process

// Stages HR can toggle when configuring a vacancy (Applied/Hired are locked on).
// Order here is the canonical pipeline order the board renders them in.
export const CONFIGURABLE_STAGES = ["screening", "dept", "interview", "interview2", "final"];
export const LOCKED_STAGES = ["applied", "hired"];

// Given a chosen set of middle stages, build a valid ordered pipeline.
export function buildPipeline(selectedMiddle) {
  const middle = CONFIGURABLE_STAGES.filter((s) => selectedMiddle.includes(s));
  return ["applied", ...middle, "hired"];
}

// The stage a candidate advances to next in a given pipeline, or null if terminal.
export function nextStage(pipeline, stageId) {
  const i = pipeline.indexOf(stageId);
  if (i === -1 || i >= pipeline.length - 1) return null;
  return pipeline[i + 1];
}

// Who owns a stage (the role responsible for acting on it).
export const stageOwner = (stageId) => STAGES[stageId]?.owner || null;

// True if `role` may advance/reject a candidate sitting in `stageId` (role-level,
// position-agnostic). Management can act on any stage; otherwise the role must
// own the stage. Kept for callers that don't have the position in scope.
export function canActOnStage(role, stageId) {
  if (!role) return false;
  if (role === ROLES.MANAGEMENT) return true;
  return stageOwner(stageId) === role;
}

// ---------------------------------------------------------------------------
// CUSTOM STAGES + PER-STAGE ASSIGNMENT (per-position)
// ---------------------------------------------------------------------------
// A position may add its own stages on top of the built-in catalogue and may
// assign a specific staff member to a stage. That metadata lives ON the position
// (position.stageMeta / position.stageAssignees). Global consumers (badges,
// tables, the candidate's tracker) don't have the position in scope, so the data
// store publishes every position's custom-stage metadata into this registry —
// letting stageInfo() render a custom stage's label/colour anywhere.
//
// NOTE (Sprint 1): a candidate sitting in a CUSTOM stage can only be actioned by
// Management, because the deployed Firestore rules treat any unknown stage id as
// management-only. So custom stages default to a Management owner (UI == rules).
// Per-role custom stages + person-level DB enforcement land in Sprint 2.
const CUSTOM_META = new Map(); // stageId -> { label, owner, dot, badgeBg, badgeFg }
export function registerStageMeta(metaById = {}) {
  for (const [id, m] of Object.entries(metaById || {})) {
    if (id && m && !STAGES[id]) CUSTOM_META.set(id, m);
  }
}
const NEUTRAL = { dot: "#64748B", badgeBg: "#EEF1F5", badgeFg: "#64748B", owner: ROLES.MANAGEMENT };
const prettyId = (id) =>
  String(id).replace(/^custom[_-]?/i, "").replace(/[._-]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase()) || "Stage";

// Global (position-agnostic) stage metadata: built-in → custom registry → neutral
// fallback. Always returns a usable object, so a custom stage id never crashes.
export function stageInfo(id) {
  if (STAGES[id]) return STAGES[id];
  const c = CUSTOM_META.get(id);
  if (c) return { id, label: c.label || prettyId(id), dot: c.dot || NEUTRAL.dot, badgeBg: c.badgeBg || NEUTRAL.badgeBg, badgeFg: c.badgeFg || NEUTRAL.badgeFg, owner: c.owner || NEUTRAL.owner };
  return { id, label: prettyId(id), ...NEUTRAL };
}
export const stageLabelOf = (id) => stageInfo(id).label;

// Position-aware resolution — prefers the position's own stageMeta (covers custom
// stages and edited labels of built-ins), then the global stageInfo().
export function resolveStage(position, id) {
  const base = stageInfo(id);
  const meta = position?.stageMeta?.[id];
  if (!meta) return base;
  return { ...base, ...meta, id, label: meta.label || base.label, owner: meta.owner || base.owner };
}
export const stageOwnerRole = (position, id) => resolveStage(position, id).owner || null;

// The TEAM of staff assigned to own this stage on this position (an array).
// Tolerates the legacy shape (a single {uid,name,role} object) by wrapping it.
export function assigneesFor(position, id) {
  const a = position?.stageAssignees?.[id];
  if (!a) return [];
  const list = Array.isArray(a) ? a : [a];
  return list.filter((x) => x && (x.uid || x.name));
}
// Back-compat single helper — the first assignee, or null.
export const assigneeFor = (position, id) => assigneesFor(position, id)[0] || null;

// Does this assignee record refer to the same person as `user`? Matches on ANY
// identifier — UID, email or name — rather than UID-exclusively. This matters
// because the SAME person can sign in under a different account than the one HR
// picked from the staff directory (e.g. a demo @hyre.app login vs the @hyre.com
// staff record, or a users/{doc} whose id isn't the Firebase Auth uid). If we
// only trusted the UID, an assigned reviewer could be locked out of their own
// position. Name is a deliberate fallback so identity survives a UID mismatch.
const normId = (s) => String(s || "").trim().toLowerCase();
function sameStaff(a, user) {
  if (!a || !user) return false;
  if (a.uid && user.uid && a.uid === user.uid) return true;
  if (a.email && user.email && normId(a.email) === normId(user.email)) return true;
  if (a.name && user.name && normId(a.name) === normId(user.name)) return true;
  return false;
}

// Assignment-aware permission: may THIS user act on a candidate in `stageId`?
//  • Management → always (mirrors the DB rules).
//  • Otherwise the user's role must own the stage, AND if a team is assigned, the
//    user must be ONE of them. (App-level; DB enforcement = S2.)
export function canActOnStageFor(user, position, stageId) {
  if (!user?.role) return false;
  if (user.role === ROLES.MANAGEMENT) return true;
  if (stageOwnerRole(position, stageId) !== user.role) return false;
  const team = assigneesFor(position, stageId);
  if (!team.length) return true; // owned by the role, nobody specifically assigned
  return team.some((a) => sameStaff(a, user));
}

// True if `user` is on the assigned team of ANY stage of this position.
function onAnyTeam(position, user) {
  const map = position?.stageAssignees || {};
  for (const v of Object.values(map)) {
    const arr = Array.isArray(v) ? v : v ? [v] : [];
    if (arr.some((a) => sameStaff(a, user))) return true;
  }
  return false;
}

// Which positions a staff user may SEE:
//  • HR → EVERY position in the system (recruitment oversight).
//  • Interviewer & Management → only positions they're assigned to OR that they
//    opened themselves. (Interviewers can't open positions, so for them this is
//    effectively "assigned only".)
export function positionVisibleTo(position, user) {
  if (!user?.role) return false;
  if (user.role === ROLES.HR) return true;
  const createdByMe = !!position?.createdByUid && position.createdByUid === user.uid;
  return onAnyTeam(position, user) || createdByMe;
}
export const visiblePositions = (positions, user) => (positions || []).filter((p) => positionVisibleTo(p, user));
