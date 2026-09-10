// WS5/5.4 — layer-3 (embedding) similarity thresholds. Loaded from the
// calibration script's generated output, never a hand-typed literal here —
// see calibrated-thresholds.generated.js and, for the full evidence trail,
// test-fixtures/calibration-pairs/. The engine refuses to run rather than
// silently score against a guessed number.
//
// SKILL_SIMILARITY_THRESHOLD is set by the PRIMARY calibration (keyword vs
// keyword) only. The SECONDARY (phrase vs keyword) measurement is evidence
// for the category-to-instance/directionality limitation named in 5.4 and
// never feeds this constant — see calibration-results.md.

import { CALIBRATED_THRESHOLDS } from "./calibrated-thresholds.generated.js";

let calibrated = null;
if (
  CALIBRATED_THRESHOLDS &&
  Number.isFinite(CALIBRATED_THRESHOLDS.skillThreshold) &&
  Number.isFinite(CALIBRATED_THRESHOLDS.qualThreshold)
) {
  calibrated = {
    SKILL_SIMILARITY_THRESHOLD: CALIBRATED_THRESHOLDS.skillThreshold,
    QUAL_SIMILARITY_THRESHOLD: CALIBRATED_THRESHOLDS.qualThreshold,
    calibratedAt: CALIBRATED_THRESHOLDS.calibratedAt,
    model: CALIBRATED_THRESHOLDS.model,
  };
}

export function getThresholds() {
  if (!calibrated) {
    throw new Error(
      "FATAL: similarity thresholds are UNCALIBRATED. " +
        "Run 'npm run calibrate' before executing the scoring engine."
    );
  }
  return calibrated;
}

/**
 * Credit rule for a layer-3 comparison: STRICTLY above threshold, never
 * at-or-above (5.4). The threshold is max(hardNegatives) whenever the
 * calibration distributions overlap, so an at-or-above rule would let that
 * exact hard negative satisfy its own boundary.
 * @param {number} similarity
 * @param {number} threshold
 */
export function clearsThreshold(similarity, threshold) {
  return similarity > threshold;
}
