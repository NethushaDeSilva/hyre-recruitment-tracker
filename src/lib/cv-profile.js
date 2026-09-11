// WS4 — turn a parsed CV profile (functions/api/parse-cv.js's output) into the
// candidate fields the rest of the app already reads. The legacy single-value
// fields (highestQualification, fieldOfStudy, experience, currentRole,
// currentCompany, skills) are DERIVED here so existing filters, search and
// AI ranking keep working unmodified; the full structured data is stored too.
const EXPERIENCE_RANGES = ["No experience", "Less than 1 year", "1–3 years", "3–5 years", "5–10 years", "10+ years"];

function bucketExperience(years) {
  const y = Number(years) || 0;
  if (y <= 0) return EXPERIENCE_RANGES[0];
  if (y < 1) return EXPERIENCE_RANGES[1];
  if (y < 3) return EXPERIENCE_RANGES[2];
  if (y < 5) return EXPERIENCE_RANGES[3];
  if (y < 10) return EXPERIENCE_RANGES[4];
  return EXPERIENCE_RANGES[5];
}

// Ordered highest-first so a CV mentioning multiple qualifications matches its
// highest one. This is a best-effort courtesy mapping onto the existing fixed
// QUALIFICATIONS dropdown (src/lib/application.js) — the raw `education` array
// is what's actually authoritative and shown in full on the profile.
const QUALIFICATION_RULES = [
  ["PhD", /\bph\.?d\b|doctorate/i],
  ["Master's Degree", /\bmaster|\bmsc\b|m\.sc|\bmba\b|\bm\.a\b/i],
  ["Postgraduate Diploma", /postgraduate diploma|pg diploma/i],
  ["Bachelor's Degree", /bachelor|\bbsc\b|b\.sc|b\.eng|\bbeng\b|\bb\.a\b/i],
  ["Higher Diploma", /higher diploma/i],
  ["Diploma", /\bdiploma\b/i],
  ["GCE A/L", /a\/?level|advanced level|gce a/i],
  ["GCE O/L", /o\/?level|ordinary level|gce o/i],
  ["Professional Certification", /certif/i],
];

// Current WS4 shape splits awardType/field apart (see CLAUDE.md WS4 — a
// combined "degree" string let extraction lose the field entirely). Legacy
// candidates parsed before that fix only have `degree`, so this rebuilds the
// same kind of combined text for the qualification-dropdown matcher below,
// which was always designed to read a whole title, either way.
const degreeText = (e) => (e.awardType ? `${e.awardType}${e.field ? ` ${e.field}` : ""}` : e.degree || "");

function matchQualification(education) {
  const text = (education || []).map(degreeText).join(" ");
  if (!text.trim()) return "";
  for (const [label, re] of QUALIFICATION_RULES) if (re.test(text)) return label;
  return "";
}

/** Turn a parsed CV profile into the fields addCandidate()/applyToPosition() understand. */
export function profileToCandidateFields(profile) {
  if (!profile) return {};
  const experience = profile.experience || [];
  const currentJob = experience.find((e) => !e.endDate) || experience[0] || null;
  const firstEd = profile.education?.[0];
  return {
    name: profile.fullName || "",
    location: profile.location || "",
    highestQualification: matchQualification(profile.education),
    // Prefer the genuinely-extracted field of study; fall back to the whole
    // (legacy) degree string only for candidates parsed before this split.
    fieldOfStudy: firstEd ? (firstEd.field || degreeText(firstEd)) : "",
    experience: bucketExperience(profile.totalYearsExperience),
    totalYearsExperience: profile.totalYearsExperience || 0,
    currentRole: currentJob?.title || "",
    currentCompany: currentJob?.company || "",
    skills: (profile.skills || []).join(", "),
    education: profile.education || [],
    experienceEntries: experience,
    certifications: profile.certifications || [],
    languages: profile.languages || [],
  };
}
