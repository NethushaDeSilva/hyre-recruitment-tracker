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

// The QUALIFICATIONS list above is ordered lowest → highest, so an item's index
// doubles as a simple rank. `meetsQualification` uses that to decide whether an
// applicant clears a position's minimum bar. It's only ever a HINT for the
// recruiter — the app never auto-rejects anyone on the strength of it.
//   returns true  → candidate meets/exceeds the bar
//           false → candidate is below the bar
//           null  → can't tell (no minimum set, or the candidate didn't say)
export function meetsQualification(candidateQual, minQual) {
  if (!minQual || !candidateQual) return null;
  const ci = QUALIFICATIONS.indexOf(candidateQual);
  const mi = QUALIFICATIONS.indexOf(minQual);
  if (ci === -1 || mi === -1) return null;
  return ci >= mi;
}
