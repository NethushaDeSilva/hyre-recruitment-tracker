import { it, expect } from "vitest";
import { isScoreStale, assessmentEligibility, canBulkSelect, correctionReviewReason, meetsShortlistThreshold, scorePillClass } from "./scoreStaleness.js";
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
it("meetsShortlistThreshold: above, at (boundary) and below the position's threshold", () => {
  expect(meetsShortlistThreshold({ ...score, overallScore: 95 }, { shortlistThreshold: 90 })).toBe(true);
  expect(meetsShortlistThreshold({ ...score, overallScore: 90 }, { shortlistThreshold: 90 })).toBe(true); // >= is a pass
  expect(meetsShortlistThreshold({ ...score, overallScore: 89 }, { shortlistThreshold: 90 })).toBe(false);
});
it("meetsShortlistThreshold: never true for unscored, failed or stale — the safe default is 'demands a comment'", () => {
  expect(meetsShortlistThreshold(null, { shortlistThreshold: 0 })).toBe(false);
  expect(meetsShortlistThreshold({ status: "failed" }, { shortlistThreshold: 0 })).toBe(false);
  expect(meetsShortlistThreshold({ ...score, stale: true }, { shortlistThreshold: 0 })).toBe(false);
});
it("meetsShortlistThreshold: an unset threshold defaults to 0, matching the rest of the codebase", () => {
  expect(meetsShortlistThreshold({ ...score, overallScore: 0 }, {})).toBe(true);
  expect(meetsShortlistThreshold({ ...score, overallScore: 0 }, null)).toBe(true);
});
it("scorePillClass: green at/above threshold, red below — no absolute 75/50 band anymore", () => {
  expect(scorePillClass(60, { shortlistThreshold: 60 })).toContain("16A34A"); // boundary, green
  expect(scorePillClass(59, { shortlistThreshold: 60 })).toContain("DC2626");
  expect(scorePillClass(10, { shortlistThreshold: 0 })).toContain("16A34A");
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
