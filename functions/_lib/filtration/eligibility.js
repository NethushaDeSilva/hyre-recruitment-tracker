import { classifyCandidateEducation } from "./scoring.js";
import { matchTermSet } from "./matching.js";

export const ELIGIBILITY_VERSION = 1;
export const CORRECTNESS_VERSION = 1;

// Eligibility is separate from arithmetic. Unknown evidence never establishes
// a failure, and any known truncation makes the assessment require review.
export function assessEligibility(candidate, requirements, assessment) {
  const reasons = [];
  const add = (code, status, message) => reasons.push({ code, status, message });
  const quality = candidate.extractionQuality;
  if (assessment.inputTruncated || quality?.inputTruncated || quality?.outputCapped || candidate.cvTruncation?.applied) {
    add("TRUNCATED_EVIDENCE", "needs_review", "CV evidence was truncated or capped; review the original CV.");
    return { status: "needs_review", reasons };
  }
  if (candidate.needsReview) add("EXTRACTION_REVIEW", "needs_review", "CV extraction or validation needs human review.");
  const core = assessment.breakdown?.coreSkills;
  for (const skill of requirements.requiredSkills || []) {
    const record = core?.matched?.find(r => r.required === skill);
    if (!record || record.status !== "verified") add("SKILL_NOT_ESTABLISHED", "needs_review", `Mandatory skill ${skill} is not established by verified CV evidence.`);
  }
  if (requirements.minYearsExperience > 0) {
    const years = candidate.totalYearsExperience;
    if (!Number.isFinite(years) || !quality?.experienceReliable) {
      add("EXPERIENCE_UNCERTAIN", "needs_review", `Confirm the mandatory ${requirements.minYearsExperience} years of experience; extracted dates are incomplete or uncertain.`);
    } else if (years < requirements.minYearsExperience) {
      add("EXPERIENCE_BELOW_MINIMUM", "does_not_meet", `Experience ${years} years; mandatory minimum ${requirements.minYearsExperience} years.`);
    }
  }
  const rq = requirements.requiredQualification;
  if (rq) {
    const education = classifyCandidateEducation(candidate.education || []);
    const qualifying = education.filter(e => e.level != null && e.level >= rq.level && (!rq.field || matchTermSet([rq.field], [e.field]).matched.length));
    const uncertain = quality?.complete !== true || !education.length || education.some(e => !e.recognised || e.level == null || (rq.field && !e.field));
    if (!qualifying.length) {
      add("QUALIFICATION_NOT_MET", uncertain ? "needs_review" : "does_not_meet", `Mandatory qualification: level ${rq.level}${rq.field ? ` in ${rq.field}` : ""}; no single extracted qualification establishes it.`);
    } else if (assessment.breakdown?.qualifications?.needsReview || quality?.complete !== true ||
      assessment.breakdown?.qualifications?.verificationStatus !== "verified" ||
      !qualifying.some(e => assessment.breakdown?.qualifications?.matched?.includes(e.source))) {
      add("QUALIFICATION_UNCERTAIN", "needs_review", "Confirm the mandatory qualification against the original CV.");
    }
  }
  return { status: reasons.some(r => r.status === "does_not_meet") ? "does_not_meet" : reasons.length ? "needs_review" : "meets", reasons };
}
