// The "standard CV application" vocabulary — bank-style dropdown options, shared
// by the candidate apply form and the HR/Management filter table so the values
// always line up. Deliberately NO demographic fields (gender, age, race,
// religion): candidates are judged on qualifications and experience only.
export const QUALIFICATIONS = [
  "GCE O/L",
  "GCE A/L",
  "Diploma",
  "Higher Diploma",
  "Bachelor's Degree",
  "Postgraduate Diploma",
  "Master's Degree",
  "PhD",
  "Professional Certification",
];

export const EXPERIENCE_RANGES = [
  "No experience",
  "Less than 1 year",
  "1–3 years",
  "3–5 years",
  "5–10 years",
  "10+ years",
];

// The QUALIFICATIONS list above is ordered lowest → highest, so an item's
// index doubles as a simple rank for sorting the Candidates table by
// qualification (see rank() in CandidatesTable.jsx).

// WS5 5.2/5.3 — the single source for the scoring engine's degree LEVEL.
// There used to be a second, independent "minimum degree level" dropdown
// (6/7/8) alongside this ladder; that duplication was the actual bug (two
// qualification inputs that could disagree). Only these three map onto the
// engine's 6/7/8 scale — everything else, including Postgraduate Diploma
// (deliberately not treated as degree-equivalent here), leaves
// requiredQualification on the existing nullable/not-applicable path.
export const QUALIFICATION_TO_DEGREE_LEVEL = {
  "Bachelor's Degree": 6,
  "Master's Degree": 7,
  "PhD": 8,
};
