// Plain auth constants + the email→role mapping. Kept OUT of AuthContext.jsx so
// that file can export only its React component + hook — otherwise these
// non-component exports break React Fast Refresh and Vite ends up serving two
// copies of the context module ("useAuth must be used within AuthProvider").

export const ROLE_USERS = {
  HR: { role: "HR", name: "Priya Fernando", title: "HR Recruiter", avatarColor: "#1F3A5F" },
  Interviewer: { role: "Interviewer", name: "Rehan Silva", title: "Full Stack Developer", avatarColor: "#4F46E5" },
  Management: { role: "Management", name: "Dilani Perera", title: "Engineering Manager", avatarColor: "#E0A422" },
  Candidate: { role: "Candidate", name: "Amara Jayasuriya", title: "Applicant", avatarColor: "#2563EB" },
};

export const DEMO_PASSWORD = "hyre1234";

export const ACCOUNTS = [
  { email: "hr@hyre.app", user: ROLE_USERS.HR },
  { email: "interviewer@hyre.app", user: ROLE_USERS.Interviewer },
  { email: "management@hyre.app", user: ROLE_USERS.Management },
  { email: "candidate@hyre.app", user: ROLE_USERS.Candidate },
];

export const DEMO_LOGINS = ACCOUNTS.map((a) => ({ email: a.email, title: a.user.title, role: a.user.role }));

// Company staff sign in with a @hyre.com address; the role comes from the
// local-part suffix, so you can add as many people per role as you like:
//   name.management@hyre.com   → Management
//   name.interviewer@hyre.com  → Interviewer
//   name@hyre.com  (no suffix) → HR
// The legacy fixed demo accounts still work. Anyone else is a Candidate.
//
// NOTE: this only DECIDES the role for provisioning/display. It is NOT the
// security boundary — self-registration is always forced to Candidate (see
// register()), and staff roles must be provisioned into users/{uid} out-of-band.
export const STAFF_DOMAIN = "hyre.com";

// Titles that must NEVER appear — leadership roles that don't run interviews.
// Any stored value matching these (e.g. a stale "Director" left on an old account)
// is normalised to a sensible per-role default, so the UI can't show it even
// before the account data is re-seeded. Belt-and-braces against stale data.
const FORBIDDEN_TITLE = /\b(director|vice[\s-]*president|vp|chief|c[efo]o|head\s+of|president|managing)\b/i;
const DEFAULT_TITLE = { HR: "HR Recruiter", Interviewer: "Software Developer", Management: "Engineering Manager", Candidate: "Applicant" };
// Roles whose title is FIXED and uniform — every person in the role shows this one
// title regardless of what's stored. HR (the HR-screening owners) are always shown
// as "HR Recruiter" — no Tech Talent Scout / Talent Acquisition Partner variants.
// Interviewer & Management keep their varied per-person titles.
const FIXED_ROLE_TITLE = { HR: "HR Recruiter" };
export function cleanTitle(role, title) {
  if (FIXED_ROLE_TITLE[role]) return FIXED_ROLE_TITLE[role];
  const t = String(title || "").trim();
  if (!t || FORBIDDEN_TITLE.test(t)) return DEFAULT_TITLE[role] || t || "";
  return t;
}

// Turn an email local-part into a readable display name (drop the role suffix).
function nameFromEmail(local) {
  const base = local.replace(/\.(management|interviewer)$/i, "").replace(/[._-]+/g, " ").trim();
  return base ? base.replace(/\b\w/g, (c) => c.toUpperCase()) : "Team member";
}

export const roleForEmail = (email) => {
  const e = String(email).trim().toLowerCase();
  const legacy = ACCOUNTS.find((a) => a.email === e);
  if (legacy) return legacy.user;

  const at = e.lastIndexOf("@");
  const local = at >= 0 ? e.slice(0, at) : e;
  const domain = at >= 0 ? e.slice(at + 1) : "";
  if (domain === STAFF_DOMAIN) {
    if (/\.management$/.test(local)) return { role: "Management", name: nameFromEmail(local), title: "Engineering Manager", avatarColor: "#E0A422" };
    if (/\.interviewer$/.test(local)) return { role: "Interviewer", name: nameFromEmail(local), title: "Software Developer", avatarColor: "#4F46E5" };
    return { role: "HR", name: nameFromEmail(local), title: "HR Recruiter", avatarColor: "#1F3A5F" };
  }
  return { role: "Candidate", name: email, title: "Applicant", avatarColor: "#2563EB" };
};
