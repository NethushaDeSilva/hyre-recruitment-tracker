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
