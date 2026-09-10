import { describe, it, expect } from "vitest";
import {
  experienceScore,
  weightedSkillsScore,
  classifyCandidateEducation,
  levelMetFor,
  qualificationScore,
  aggregateScore,
  creditWeightForStatus,
  INFERRED_CREDIT_WEIGHT,
} from "./scoring.js";

describe("experienceScore", () => {
  it("returns a flat 20 when the requirement is 0", () => {
    expect(experienceScore(0, 0)).toBe(20);
  });
  it("returns a flat 20 at or above the requirement — 3 years and 15 years score identically", () => {
    expect(experienceScore(3, 3)).toBe(20);
    expect(experienceScore(15, 3)).toBe(20);
  });
  it("penalises a deficit non-linearly, per the 5.3 formula exactly", () => {
    expect(experienceScore(2, 4)).toBe(Math.round(20 * Math.pow(0.5, 1.5))); // 7
  });
});

describe("creditWeightForStatus", () => {
  it("verified=1, inferred=documented partial weight, unverifiable/other=0", () => {
    expect(creditWeightForStatus("verified")).toBe(1);
    expect(creditWeightForStatus("inferred")).toBe(INFERRED_CREDIT_WEIGHT);
    expect(creditWeightForStatus("unverifiable")).toBe(0);
    expect(creditWeightForStatus(undefined)).toBe(0);
  });
});

describe("weightedSkillsScore", () => {
  it("is the proportion of required skills earned, times the component weight", () => {
    // 2 verified + 1 inferred (0.5) + 1 missing, out of 4 required, worth 45
    expect(weightedSkillsScore([1, 1, 0.5], 4, 45)).toBe(Math.round((2.5 / 4) * 45)); // 28
  });
  it("is 0 when there are no required terms", () => {
    expect(weightedSkillsScore([], 0, 45)).toBe(0);
  });
});

describe("classifyCandidateEducation / levelMetFor", () => {
  const education = [{ degree: "BSc Computer Science" }, { degree: "MSc Data Science" }];
  it("classifies every entry and keeps the source string", () => {
    const classified = classifyCandidateEducation(education);
    expect(classified).toEqual([
      { level: 6, field: "Computer Science", recognised: true, source: "BSc Computer Science" },
      { level: 7, field: "Data Science", recognised: true, source: "MSc Data Science" },
    ]);
  });
  it("level is met from ANY entry meeting or exceeding the required level, independent of field", () => {
    const classified = classifyCandidateEducation(education);
    expect(levelMetFor(classified, 6)).toBe(true);
    expect(levelMetFor(classified, 7)).toBe(true);
    expect(levelMetFor(classified, 8)).toBe(false);
  });
});

describe("qualificationScore", () => {
  it("when no field is required, credit is gated on level alone", () => {
    const classified = [{ level: 7, field: "Physics", recognised: true, source: "MSc Physics" }];
    expect(qualificationScore({ level: 7, field: null }, { levelMet: true, fieldMatch: null, classifiedEducation: classified }))
      .toEqual({ score: 25, max: 25, levelMet: true, fieldSimilarity: null, matched: ["MSc Physics"] });
    expect(qualificationScore({ level: 8, field: null }, { levelMet: false, fieldMatch: null, classifiedEducation: classified }))
      .toEqual({ score: 0, max: 25, levelMet: false, fieldSimilarity: null, matched: [] });
  });

  it("when a field is required, credit and level are independent — a field match at the wrong level still earns the 25", () => {
    const classified = [{ level: 6, field: "Computer Science", recognised: true, source: "BSc Computer Science" }];
    const fieldMatch = { matched: [{ required: "Computer Science", found: "Computer Science", similarity: 1, layer: "normalisation" }], missing: [], counters: {} };
    const result = qualificationScore({ level: 8, field: "Computer Science" }, { levelMet: false, fieldMatch, classifiedEducation: classified });
    expect(result.score).toBe(25); // field matched...
    expect(result.levelMet).toBe(false); // ...but level did not — the cap, not this score, is what penalises it
    expect(result.matched).toEqual(["BSc Computer Science"]);
  });

  it("no field match earns 0, regardless of level", () => {
    const classified = [{ level: 8, field: "Physics", recognised: true, source: "PhD Physics" }];
    const fieldMatch = { matched: [], missing: ["Computer Science"], counters: {} };
    const result = qualificationScore({ level: 6, field: "Computer Science" }, { levelMet: true, fieldMatch, classifiedEducation: classified });
    expect(result.score).toBe(0);
  });
});

describe("aggregateScore", () => {
  it("null requiredQualification: rescales the remaining 75 points to 100, capApplied always false", () => {
    const { overallScore, capApplied } = aggregateScore({ qual: null, skillsScore: 45, experienceScoreValue: 20, niceToHaveScore: 10 });
    expect(overallScore).toBe(100);
    expect(capApplied).toBe(false);
  });

  it("levelMet: no cap, overallScore is the plain sum", () => {
    const qual = { score: 25, max: 25, levelMet: true };
    const { overallScore, capApplied } = aggregateScore({ qual, skillsScore: 30, experienceScoreValue: 13, niceToHaveScore: 0 });
    expect(overallScore).toBe(68);
    expect(capApplied).toBe(false);
  });

  it("level deficit: scaled cap, matching 5.3's own worked examples exactly (raw 90 -> 36, raw 50 -> 20)", () => {
    const raw90 = aggregateScore({ qual: { score: 25, levelMet: false }, skillsScore: 45, experienceScoreValue: 20, niceToHaveScore: 0 });
    expect(raw90.overallScore).toBe(36);
    expect(raw90.capApplied).toBe(true);

    const raw50 = aggregateScore({ qual: { score: 0, levelMet: false }, skillsScore: 30, experienceScoreValue: 20, niceToHaveScore: 0 });
    expect(raw50.overallScore).toBe(20);
    expect(raw50.capApplied).toBe(true);
  });

  it("the cap is scaled, never clamped — two different raw scores under deficit produce two different capped scores", () => {
    const a = aggregateScore({ qual: { score: 25, levelMet: false }, skillsScore: 45, experienceScoreValue: 20, niceToHaveScore: 0 }); // raw 90
    const b = aggregateScore({ qual: { score: 0, levelMet: false }, skillsScore: 30, experienceScoreValue: 20, niceToHaveScore: 0 }); // raw 50
    expect(a.overallScore).not.toBe(b.overallScore);
  });
});
