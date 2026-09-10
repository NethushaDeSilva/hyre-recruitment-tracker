import { describe, it, expect } from "vitest";
import { scoreApplication, scoreApplications, sortApplications, ScoringError } from "./engine.js";

function mockEmbed(table) {
  return async (texts) => texts.map((t) => {
    if (!(t in table)) throw new Error(`mockEmbed: no vector configured for "${t}"`);
    return table[t];
  });
}
const unit = (cosineValue) => [cosineValue, Math.sqrt(1 - cosineValue * cosineValue)];
const REF = [1, 0];
const NOW = () => new Date("2026-09-10T12:00:00Z");

describe("scoreApplication — guard", () => {
  it("throws ScoringError rather than returning a fabricated score when requiredSkills is empty", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    await expect(scoreApplication({ skills: [] }, { requiredSkills: [] }, { embedTexts, now: NOW }))
      .rejects.toBeInstanceOf(ScoringError);
  });
});

describe("scoreApplication — fully normalised match, zero embedding calls", () => {
  it("scores a candidate who clears every requirement via layer 1 alone", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const requirements = {
      requiredQualification: { level: 6, field: "Computer Science" },
      requiredSkills: ["React", "Node.js"],
      minYearsExperience: 3,
      niceToHave: [],
    };
    const candidate = {
      skills: ["React.js", "Node"],
      education: [{ degree: "BSc Computer Science" }],
      totalYearsExperience: 5,
      extractedText: "BSc Computer Science graduate, experienced in React.js and Node.js, building GraphQL APIs.",
    };
    const result = await scoreApplication(candidate, requirements, { embedTexts, now: NOW });

    expect(result.capApplied).toBe(false);
    expect(result.overallScore).toBe(90); // 25 (qual) + 45 (skills) + 20 (experience) + 0 (nice-to-have)
    expect(result.breakdown.qualifications).toMatchObject({ score: 25, max: 25, levelMet: true });
    expect(result.breakdown.coreSkills).toMatchObject({ score: 45, max: 45, missing: [] });
    expect(result.breakdown.coreSkills.matched.every((m) => m.layer === "normalisation" && m.status === "verified")).toBe(true);
    expect(result.breakdown.experience).toEqual({ score: 20, max: 20, candidateYears: 5, requiredYears: 3 });
    expect(result.instrumentation.layers).toEqual({ normalisation: 3, embedding: 0, none: 0 });
    expect(result.instrumentation.borderline).toBe(0);
    expect(result.meta.scoredAt).toBe("2026-09-10T12:00:00.000Z");
  });
});

describe("scoreApplication — embedding fallback and the null-qualification rescale", () => {
  it("matches via embedding when no requirement has a qualification to score against", async () => {
    const embedTexts = mockEmbed({ "Container orchestration": REF, Kubernetes: unit(0.95) });
    const requirements = { requiredQualification: null, requiredSkills: ["Container orchestration"], minYearsExperience: 2, niceToHave: [] };
    const candidate = {
      skills: ["Kubernetes"],
      education: [],
      totalYearsExperience: 2,
      extractedText: "Deployed workloads using Kubernetes across multiple clusters.",
    };
    const result = await scoreApplication(candidate, requirements, { embedTexts, now: NOW });

    expect(result.breakdown.qualifications).toEqual({ applicable: false });
    expect(result.breakdown.coreSkills.matched[0].layer).toBe("embedding");
    expect(result.breakdown.coreSkills.matched[0].status).toBe("verified"); // "Kubernetes" appears literally in the CV text
    expect(result.overallScore).toBe(Math.round(((45 + 20 + 0) / 75) * 100)); // 87
    expect(result.capApplied).toBe(false);
    expect(result.instrumentation.layers.embedding).toBe(1);
  });
});

describe("scoreApplication — unverifiable qualification is flagged for review, not silently dropped", () => {
  it("withdraws credit and flags the candidate when the matched degree isn't grounded in the CV text", async () => {
    const embedTexts = mockEmbed({
      "BSc Computer Science": REF,
      "Skilled in React.": unit(0.2),
      "No formal qualifications listed here.": unit(0.1),
    });
    const requirements = { requiredQualification: { level: 6, field: "Computer Science" }, requiredSkills: ["React"], minYearsExperience: 0, niceToHave: [] };
    const candidate = {
      skills: ["React"],
      education: [{ degree: "BSc Computer Science" }], // WS4 extracted this, but the CV text never actually says it
      totalYearsExperience: 0,
      extractedText: "Skilled in React. No formal qualifications listed here.",
    };
    const result = await scoreApplication(candidate, requirements, { embedTexts, now: NOW });

    expect(result.breakdown.qualifications.score).toBe(0);
    expect(result.breakdown.qualifications.matched).toEqual([]);
    expect(result.breakdown.qualifications.needsReview).toBe(true);
    expect(result.breakdown.qualifications.flaggedQualification).toBe("BSc Computer Science");
    // Level was structurally met (BSc = level 6 >= required 6) independent of the
    // grounding failure — the cap must not fire for a reason unrelated to level.
    expect(result.capApplied).toBe(false);
    expect(result.overallScore).toBe(65); // 0 (qual, withdrawn) + 45 (skills) + 20 (experience, min 0) + 0
  });
});

describe("scoreApplications — batch", () => {
  it("one candidate's failure never aborts the batch or produces a fabricated score", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const requirements = { requiredQualification: null, requiredSkills: ["React"], minYearsExperience: 0, niceToHave: [] };
    const good = { candidateId: "CAND-1", skills: ["React"], education: [], totalYearsExperience: 0, extractedText: "React developer." };
    const broken = null; // simulates a malformed/missing candidate record
    const results = await scoreApplications([good, broken], requirements, { embedTexts, now: NOW });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("scored");
    expect(results[0].result.overallScore).toBeGreaterThan(0);
    expect(results[1].status).toBe("failed");
    expect(results[1].result).toBeUndefined();
  });
});

describe("scoreApplication — WS6.4 scoring-stage stability", () => {
  it("produces byte-identical output across 100 runs on one static CandidateProfile (σ = 0.00)", async () => {
    // Mixed layer 1 (React, BSc Computer Science — exact after normalisation)
    // and layer 3 (Container orchestration/Kubernetes — embedding) matches,
    // and an experience shortfall (3 of 4 years) so the non-linear formula is
    // exercised too. The claim under test is determinism, not any particular
    // score — a representative candidate, not a trivial all-layer-1 one.
    // "React.js" needs a vector too even though it resolves at layer 1 — once
    // "Container orchestration" has no layer-1 match, matchTermSet embeds the
    // whole candidate skill list to find its best layer-3 match. [0, 1] is
    // orthogonal to REF so it can't accidentally outscore the intended
    // Kubernetes match.
    const embedTexts = mockEmbed({
      "Container orchestration": REF, Kubernetes: unit(0.95), "React.js": [0, 1],
      GraphQL: [0, 1], // no candidate skill actually covers it — stays "missing" from niceToHave
    });
    const requirements = {
      requiredQualification: { level: 6, field: "Computer Science" },
      requiredSkills: ["React", "Container orchestration"],
      minYearsExperience: 4,
      niceToHave: ["GraphQL"],
    };
    const candidate = {
      candidateId: "CAND-STABILITY-01",
      skills: ["React.js", "Kubernetes"],
      education: [{ degree: "BSc Computer Science" }],
      totalYearsExperience: 3,
      extractedText:
        "BSc Computer Science graduate. Built React.js applications and deployed workloads on Kubernetes across multiple clusters.",
    };

    const runs = [];
    for (let i = 0; i < 100; i++) {
      runs.push(await scoreApplication(candidate, requirements, { embedTexts, now: NOW }));
    }

    const first = JSON.stringify(runs[0]);
    expect(runs.every((r) => JSON.stringify(r) === first)).toBe(true);

    const scores = runs.map((r) => r.overallScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    expect(Math.sqrt(variance)).toBe(0);
  });
});

describe("sortApplications", () => {
  it("orders by overallScore desc, then core-skills score desc, then candidateId ascending; unscored sorts last", () => {
    const make = (candidateId, overallScore, coreScore) => ({
      candidateId, status: "scored", result: { overallScore, breakdown: { coreSkills: { score: coreScore } } },
    });
    const scored = [
      make("CAND-0003", 70, 30),
      make("CAND-0001", 80, 40),
      make("CAND-0002", 80, 40), // tie with CAND-0001 on both scores — ID breaks it
      { candidateId: "CAND-0004", status: "failed", error: "boom" },
    ];
    const sorted = sortApplications(scored);
    expect(sorted.map((s) => s.candidateId)).toEqual(["CAND-0001", "CAND-0002", "CAND-0003", "CAND-0004"]);
  });
});
