import { it, expect } from "vitest";
import { isScoreStale, assessmentEligibility, canBulkSelect, correctionReviewReason } from "./scoreStaleness.js";
import { ENGINE_VERSION } from "../../functions/_lib/filtration/engine.js";
import { getThresholds } from "../../functions/_lib/filtration/thresholds.js";
const thresholds = getThresholds();
const score = { status: "scored", overallScore: 95, breakdown: {}, meta: { engineVersion: ENGINE_VERSION, skillThreshold: thresholds.SKILL_SIMILARITY_THRESHOLD, qualThreshold: thresholds.QUAL_SIMILARITY_THRESHOLD } };
it("missing eligibility does not mark every legacy numerical score stale", () => {
  expect(isScoreStale(score)).toBe(false);
  expect(assessmentEligibility(score, {}).status).toBe("needs_review");
  expect(score.overallScore).toBe(95);
});
it("bulk selection requires both threshold and eligibility and excludes stale scores", () => {
  const s = { ...score, eligibility: { status: "meets", reasons: [] } };
  expect(canBulkSelect(s, { shortlistThreshold: 90 })).toBe(true);
  expect(canBulkSelect(s, { shortlistThreshold: 96 })).toBe(false);
  expect(canBulkSelect({ ...s, stale: true }, {})).toBe(false);
  expect(canBulkSelect({ ...s, eligibility: { status: "does_not_meet", reasons: [] } }, {})).toBe(false);
});
it("targets legacy Angular collapse without touching an ordinary React score", () => {
  const s = { ...score, breakdown: { coreSkills: { matched: [{ required: "Angular", found: "AngularJS" }] } } };
  expect(correctionReviewReason(s)).toContain("Angular");
  expect(correctionReviewReason(score)).toBe("");
});
it("distinguishes potentially truncated legacy verification from short CV verification", () => {
  const s = { ...score, instrumentation: { verification: { embedding: 1 } } };
  expect(correctionReviewReason(s, { cvExtractedText: "Sentence. ".repeat(100) })).toContain("truncated");
  expect(correctionReviewReason(s, { cvExtractedText: "Short CV." })).toBe("");
});
