// The company's FIXED set of departments. When HR opens a position they pick ONE
// from this list — it is NOT free-text. A position (job role) belongs to exactly
// one department, and a candidate applies into that role.
//
// `code` is the department's SHORT FORM, used as the prefix of a hired employee's
// ID (e.g. a hire in Software Engineering → "SE-0007"). Keep codes stable — they
// become part of every employee ID issued for that department.
export const DEPARTMENTS = [
  { name: "People & Culture", code: "PC" },
  { name: "Software Engineering", code: "SE" },
  { name: "Quality Engineering", code: "QE" },
  { name: "AI & Data Analytics", code: "AI" },
  { name: "Delivery & Project Management", code: "DPM" },
  { name: "Sales", code: "SAL" },
  { name: "Marketing", code: "MKT" },
  { name: "Customer Support", code: "CS" },
];

export const DEPARTMENT_NAMES = DEPARTMENTS.map((d) => d.name);

// The short code for a department name. Falls back to the initials of the words
// for any legacy/unknown department string left on older positions, so nothing
// ever breaks if the department isn't one of the fixed eight.
export function departmentCode(name) {
  const key = String(name || "").trim().toLowerCase();
  const found = DEPARTMENTS.find((d) => d.name.toLowerCase() === key);
  if (found) return found.code;
  const initials = String(name || "")
    .replace(/&/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return initials.slice(0, 3) || "GEN";
}

// Best-fit fixed department for a free-text JOB TITLE. Staff (HR / Interviewer /
// Management) aren't tied to a position, so their employee ID's department part
// is derived from their title with this keyword heuristic. Defaults to Software
// Engineering — Hyre is an IT company and most roles are engineering.
export function departmentForTitle(title) {
  const t = String(title || "").toLowerCase();
  if (/\b(hr|recruit|recruiter|talent|people|culture)\b/.test(t)) return "People & Culture";
  if (/\b(qa|quality|test|sdet)\b/.test(t)) return "Quality Engineering";
  if (/\b(data|ml|machine learning|ai|analytics|scientist)\b/.test(t)) return "AI & Data Analytics";
  if (/\b(sales|account)\b/.test(t)) return "Sales";
  if (/\b(marketing|brand|content|seo)\b/.test(t)) return "Marketing";
  if (/\b(support|customer|helpdesk)\b/.test(t)) return "Customer Support";
  if (/\b(project|delivery|program|product|operations|scrum|owner|release)\b/.test(t)) return "Delivery & Project Management";
  return "Software Engineering";
}
