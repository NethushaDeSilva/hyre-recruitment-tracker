// WS5 5.2 — "never silently mix scores computed under different rules."
// A score can go stale two ways: an explicit flag (requirements were edited —
// see updatePosition() in data/store.js) or a DRIFT between what the score
// was computed under and what's live now (thresholds recalibrated, or the
// engine itself changed version). The drift check is never stored — it's
// computed at read time against the same constants the engine itself uses,
// imported straight from the pure modules rather than duplicated as a
// hand-typed copy that could silently fall out of sync.
import { ENGINE_VERSION } from "../../functions/_lib/filtration/engine.js";
import { getThresholds } from "../../functions/_lib/filtration/thresholds.js";
import { assessEligibility, CORRECTNESS_VERSION } from "../../functions/_lib/filtration/eligibility.js";
import { normalizeTerm } from "../../functions/_lib/filtration/matching.js";
import { snapshotKey } from "./rescoreBatch.js";

export function correctionReviewReason(score, candidate, position) {
  if (!score || score.meta?.correctnessVersion === CORRECTNESS_VERSION) return "";
  const blocks = [score.breakdown?.coreSkills, score.breakdown?.preferredSkills];
  if (blocks.some(b => b?.matched?.some(r => /angular/i.test(r.required) && normalizeTerm(r.required) !== normalizeTerm(r.found)))) {
    return "Legacy Angular/AngularJS credit needs targeted reassessment.";
  }
  if ([...(position?.requirements?.requiredSkills || []), ...(position?.requirements?.niceToHave || [])].some(s => /^angular[.\s]*js/i.test(s))) {
    return "Legacy AngularJS normalization needs targeted reassessment.";
  }
  if (score.instrumentation?.verification?.embedding > 0) {
    const text = candidate?.cvExtractedText;
    if (!text) return "Legacy embedding completeness cannot be established; review this assessment.";
    const sentences = String(text).match(/[^.!?\n]+[.!?\n]*/g) || [];
    if (sentences.length > 99 || sentences.some(s => s.trim().length > 2000)) return "Legacy embedding inputs may have been truncated; targeted reassessment needed.";
  }
  return "";
}

export function assessmentEligibility(score, position, candidate) {
  const review = message => ({ status: "needs_review", reasons: [{ code: "ASSESSMENT_REVIEW", status: "needs_review", message }] });
  if (!score || score.status !== "scored") return review("Eligibility has not been assessed.");
  if (isScoreStale(score)) return review(staleReason(score));
  const correction = correctionReviewReason(score, candidate, position);
  if (correction) return review(correction);
  if (score.eligibility) return score.eligibility;
  // Never fabricate correspondence between old evidence and new requirements.
  // When a snapshot exists, derive eligibility locally without an AI rescore.
  if (candidate && position?.requirements && score.requirementsSnapshot && snapshotKey(score.requirementsSnapshot) === snapshotKey(position.requirements)) {
    return assessEligibility(candidate, position.requirements, score);
  }
  return review("Legacy score retained; mandatory eligibility needs review (no matching requirements snapshot).");
}

export function canBulkSelect(score, position, candidate) {
  return score?.status === "scored" && !isScoreStale(score) &&
    score.overallScore >= (position?.shortlistThreshold ?? 0) &&
    assessmentEligibility(score, position, candidate).status === "meets";
}



/**
 * @param {object|null} score - an applicationScores document (or null/undefined
 *   if the application was never scored at all)
 * @returns {boolean}
 */
export function isScoreStale(score) {
  if (!score || !score.meta) return false; // "never scored" isn't "stale" — see 10.1, a different UI state entirely
  if (score.stale) return true;

  const { SKILL_SIMILARITY_THRESHOLD, QUAL_SIMILARITY_THRESHOLD } = getThresholds();
  if (score.meta.engineVersion !== ENGINE_VERSION) return true;
  if (score.meta.skillThreshold !== SKILL_SIMILARITY_THRESHOLD) return true;
  if (score.meta.qualThreshold !== QUAL_SIMILARITY_THRESHOLD) return true;
  return false;
}

/** Why a score is stale, for the tooltip — checked in the same order as
 * isScoreStale() so the first true reason shown is the first one that fired. */
export function staleReason(score) {
  if (!score || !score.meta) return "";
  if (score.stale) return "The vacancy's requirements were edited after this was scored.";
  const { SKILL_SIMILARITY_THRESHOLD, QUAL_SIMILARITY_THRESHOLD } = getThresholds();
  if (score.meta.engineVersion !== ENGINE_VERSION) return "Scored under an older version of the scoring engine.";
  if (score.meta.skillThreshold !== SKILL_SIMILARITY_THRESHOLD || score.meta.qualThreshold !== QUAL_SIMILARITY_THRESHOLD) {
    return "Scored under previously-calibrated thresholds.";
  }
  return "";
}

/**
 * Why an application shows no score, for the "not scored" state (10.1: never a
 * 0, never blank). Shared by ShortlistPanel and the Candidates Match column so
 * the reason text can't drift between the two places it's shown.
 * @param {object|null} scoreDoc - an applicationScores doc, or null/undefined
 * @param {object|null} position - the position this application is against
 */
export function notScoredReason(scoreDoc, position) {
  if (!position?.requirements) return "no requirements set on this position";
  if (scoreDoc?.status === "failed") return scoreDoc.error || "scoring failed";
  return "not yet scored";
}

/** Colour band for a Match pill — shared so the Shortlist and the Candidates
 * Match column render the same score the same colour. */
export function scorePillClass(score) {
  return score >= 75 ? "bg-[#16A34A]/12 text-[#16A34A] dark:text-[#4ADE80]"
    : score >= 50 ? "bg-[#E0A422]/15 text-[#B4801A] dark:text-[#F5D77E]"
    : "bg-[#DC2626]/10 text-[#DC2626] dark:text-[#F87171]";
}
