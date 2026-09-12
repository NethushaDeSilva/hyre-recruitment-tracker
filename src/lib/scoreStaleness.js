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
