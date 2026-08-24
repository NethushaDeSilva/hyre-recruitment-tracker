// Role permission matrix — the single source of truth for who can do what.
// This governs the UI only; real enforcement will live in Firestore security
// rules later (roadmap Part 8). Role strings match AuthContext's users.
export const ROLES = {
  HR: "HR",
  INTERVIEWER: "Interviewer",
  MANAGEMENT: "Management",
  CANDIDATE: "Candidate",
};

export const ROLE_LABELS = {
  HR: "HR / Recruiter",
  Interviewer: "Interviewer",
  Management: "Management",
  Candidate: "Candidate",
};

// Who can do what.
//  - HR: the recruitment coordinator — opens positions, configures the stage
//    pipeline AND assigns the team for each stage, adds candidates, moves & rejects.
//  - Interviewer: view the board and act on the stages they're assigned to.
//  - Management: NO position/config powers — they only run the interview stages
//    they've been assigned to (e.g. the final interview). No opening, no configuring.
//  - Candidate: apply to open roles and manage their own application only.
const MATRIX = {
  // internal / staff tracking
  accessDashboard: [ROLES.MANAGEMENT], // dashboard is management-only (Sprint 2)
  managePositions: [ROLES.HR], // open + configure positions — HR only
  approvePositions: [ROLES.HR], // close / reopen a vacancy — HR only
  deletePositions: [ROLES.HR], // destructive — HR only
  manageStages: [ROLES.HR], // configure stages + assign the per-stage team — HR only
  manageCandidates: [ROLES.HR, ROLES.MANAGEMENT], // add / move / reject (on stages they can act on)
  reconsiderCandidate: [ROLES.HR], // move a rejected candidate from the pool back into the pipeline — HR ONLY
  moveCandidates: [ROLES.HR, ROLES.MANAGEMENT],
  makeDecisions: [ROLES.HR, ROLES.MANAGEMENT],
  viewBoard: [ROLES.HR, ROLES.MANAGEMENT, ROLES.INTERVIEWER],
  viewCandidatesTable: [ROLES.HR, ROLES.MANAGEMENT],
  viewEmployees: [ROLES.HR, ROLES.MANAGEMENT], // the hired roster — HR & Management
  downloadCv: [ROLES.HR, ROLES.MANAGEMENT],
  submitFeedback: [ROLES.INTERVIEWER, ROLES.HR, ROLES.MANAGEMENT], // Sprint 2
  compareCandidates: [ROLES.HR, ROLES.INTERVIEWER], // side-by-side compare — HR & Interviewer only, NOT Management
  exportReports: [ROLES.HR, ROLES.MANAGEMENT], // Sprint 2

  // candidate side
  apply: [ROLES.CANDIDATE],
  viewOwnApplications: [ROLES.CANDIDATE],
};

/** True if `role` is allowed to perform `action`. */
export function can(role, action) {
  const allowed = MATRIX[action];
  return allowed ? allowed.includes(role) : false;
}

/** True if `role` is a staff role (works inside the tracker, not an applicant). */
export const isStaff = (role) => role !== ROLES.CANDIDATE;

/** True if `role` is Management (the admin role with approval authority). */
export const isManagement = (role) => role === ROLES.MANAGEMENT;

// Position lifecycle statuses.
export const POSITION_STATUS = { PENDING: "Pending", OPEN: "Open", CLOSED: "Closed" };

/** Where each role lands after signing in. */
export const HOME_FOR = {
  HR: "/positions",
  Interviewer: "/positions",
  Management: "/positions", // Dashboard is Sprint 2 — not exposed yet
  Candidate: "/jobs",
};
export const homeFor = (role) => HOME_FOR[role] || "/jobs";
