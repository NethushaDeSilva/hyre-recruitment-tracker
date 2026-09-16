import { it, expect } from "vitest";
import { assessEligibility } from "./eligibility.js";

const requirements = { requiredSkills: ["React"], minYearsExperience: 8, niceToHave: ["Docker"] };
const candidate = { totalYearsExperience: 0.25, education: [], extractionQuality: { complete: true, experienceReliable: true } };
const score = { overallScore: 80, breakdown: { coreSkills: { matched: [{ required: "React", status: "verified" }] } } };
it("does not allow a score of 80 to compensate for three months against eight years", () => {
  expect(assessEligibility(candidate, requirements, score).status).toBe("does_not_meet");
  expect(score.overallScore).toBe(80);
});
it("uncertain experience is not a definitive failure", () => {
  expect(assessEligibility({ ...candidate, extractionQuality: {} }, requirements, score).status).toBe("needs_review");
});
it.each(["inputTruncated", "outputCapped"])("%s forces review rather than a definitive failure", flag => {
  expect(assessEligibility({ ...candidate, extractionQuality: { ...candidate.extractionQuality, [flag]: true } }, requirements, score).status).toBe("needs_review");
});
it("truncated embeddings force review", () => {
  expect(assessEligibility(candidate, requirements, { ...score, inputTruncated: true }).status).toBe("needs_review");
});
it("preferred skill absence does not block eligibility", () => {
  expect(assessEligibility({ ...candidate, totalYearsExperience: 8 }, requirements, score).status).toBe("meets");
});
it("does not combine a high degree in the wrong field with a lower degree in the right field", () => {
  const c = { ...candidate, totalYearsExperience: 8, education: [{ awardType: "Master's Degree", field: "History" }, { awardType: "Bachelor's Degree", field: "Computer Science" }] };
  expect(assessEligibility(c, { ...requirements, requiredQualification: { level: 7, field: "Computer Science" } }, score).status).not.toBe("meets");
});
