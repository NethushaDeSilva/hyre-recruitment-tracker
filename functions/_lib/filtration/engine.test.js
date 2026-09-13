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

describe("scoreApplication — guard", () => {
  it("throws ScoringError rather than returning a fabricated score when requiredSkills is empty", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    await expect(scoreApplication({ skills: [] }, { requiredSkills: [] }, { embedTexts }))
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
    const result = await scoreApplication(candidate, requirements, { embedTexts });

    expect(result.capApplied).toBe(false);
    expect(result.overallScore).toBe(90); // 25 (qual) + 45 (skills) + 20 (experience) + 0 (nice-to-have)
    expect(result.breakdown.qualifications).toMatchObject({ score: 25, max: 25, levelMet: true });
    expect(result.breakdown.coreSkills).toMatchObject({ score: 45, max: 45, missing: [] });
    expect(result.breakdown.coreSkills.matched.every((m) => m.status === "verified")).toBe(true);
    expect(result.breakdown.experience).toEqual({ score: 20, max: 20, candidateYears: 5, requiredYears: 3 });
    // 3 matched terms (React, Node.js, the qualification field), all found
    // literally in extractedText — verifyTerm() never needed to embed.
    expect(result.instrumentation.verification).toEqual({ literal: 3, embedding: 0 });
    expect(result.instrumentation.borderline).toBe(0);
    // No `meta` here by design — the engine is pure and has no clock or model
    // identity of its own; filtration-ai.test.js covers meta assembly.
    expect(result.meta).toBeUndefined();
  });
});

describe("scoreApplication — layer 3 removed (5.4, 2026-09-12): a real semantic equivalence with no shared normalized form now stays missing", () => {
  it("does not credit 'Container orchestration' against a candidate who only states 'Kubernetes', even though Kubernetes appears literally in the CV text", async () => {
    const embedTexts = async () => { throw new Error("matching.js no longer calls embedTexts — only verifyTerm() does, and only on a MATCHED term"); };
    const requirements = { requiredQualification: null, requiredSkills: ["Container orchestration"], minYearsExperience: 2, niceToHave: [] };
    const candidate = {
      skills: ["Kubernetes"],
      education: [],
      totalYearsExperience: 2,
      extractedText: "Deployed workloads using Kubernetes across multiple clusters.",
    };
    const result = await scoreApplication(candidate, requirements, { embedTexts });

    expect(result.breakdown.qualifications).toEqual({ applicable: false });
    expect(result.breakdown.coreSkills.matched).toEqual([]);
    expect(result.breakdown.coreSkills.missing).toEqual(["Container orchestration"]);
    expect(result.overallScore).toBe(Math.round(((0 + 20 + 0) / 75) * 100)); // 27 — the skill earns nothing
    expect(result.capApplied).toBe(false);
    expect(result.instrumentation.verification).toEqual({ literal: 0, embedding: 0 }); // nothing was ever matched, so nothing was ever verified either
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
    const result = await scoreApplication(candidate, requirements, { embedTexts });

    expect(result.breakdown.qualifications.score).toBe(0);
    expect(result.breakdown.qualifications.matched).toEqual([]);
    expect(result.breakdown.qualifications.needsReview).toBe(true);
    expect(result.breakdown.qualifications.reviewReason).toBe("unverifiable");
    expect(result.breakdown.qualifications.flaggedQualification).toBe("BSc Computer Science");
    // Level was structurally met (BSc = level 6 >= required 6) independent of the
    // grounding failure — the cap must not fire for a reason unrelated to level.
    expect(result.capApplied).toBe(false);
    expect(result.overallScore).toBe(65); // 0 (qual, withdrawn) + 45 (skills) + 20 (experience, min 0) + 0
  });
});

describe("scoreApplication — qualification field not extracted is flagged for review, never a silent zero", () => {
  it("flags rather than scores when the level is met but no education entry carries any field at all", async () => {
    const embedTexts = async () => { throw new Error("should not be called — nothing to embed a field against"); };
    const requirements = { requiredQualification: { level: 6, field: "Computer Science" }, requiredSkills: ["React"], minYearsExperience: 0, niceToHave: [] };
    const candidate = {
      skills: ["React"],
      // Real WS4 shape: awardType correctly classifies as level 6, but the
      // extraction genuinely returned no field — exactly the bug this fix
      // targets, except now it's an honest signal instead of a silent 0/25.
      education: [{ awardType: "BSc (Hons)", field: null, institution: "University of Moratuwa", year: "2020" }],
      totalYearsExperience: 0,
      extractedText: "Skilled in React.",
    };
    const result = await scoreApplication(candidate, requirements, { embedTexts });

    expect(result.breakdown.qualifications.score).toBe(0);
    expect(result.breakdown.qualifications.levelMet).toBe(true);
    expect(result.breakdown.qualifications.needsReview).toBe(true);
    expect(result.breakdown.qualifications.reviewReason).toBe("field-not-extracted");
    // No flaggedQualification here — unlike "unverifiable", there's no
    // specific matched claim to point at; the whole point is nothing matched.
    expect(result.breakdown.qualifications.flaggedQualification).toBeUndefined();
    expect(result.capApplied).toBe(false); // level met — the cap must not fire for an unrelated reason
    expect(result.instrumentation.verification).toEqual({ literal: 1, embedding: 0 }); // only "React" was ever matched/verified (literally); no qualification claim to verify at all
  });

  it("does not flag when the field genuinely doesn't apply (level not met — the cap path handles it)", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const requirements = { requiredQualification: { level: 8, field: "Computer Science" }, requiredSkills: ["React"], minYearsExperience: 0, niceToHave: [] };
    const candidate = {
      skills: ["React"],
      education: [{ awardType: "BSc (Hons)", field: null, institution: "", year: "" }],
      totalYearsExperience: 0,
      extractedText: "Skilled in React.",
    };
    const result = await scoreApplication(candidate, requirements, { embedTexts });

    expect(result.breakdown.qualifications.levelMet).toBe(false);
    expect(result.breakdown.qualifications.needsReview).toBeUndefined();
    expect(result.capApplied).toBe(true); // level genuinely not met — this is what the cap is for
  });
});

describe("scoreApplications — batch", () => {
  it("one candidate's failure never aborts the batch or produces a fabricated score", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const requirements = { requiredQualification: null, requiredSkills: ["React"], minYearsExperience: 0, niceToHave: [] };
    const good = { candidateId: "CAND-1", skills: ["React"], education: [], totalYearsExperience: 0, extractedText: "React developer." };
    const broken = null; // simulates a malformed/missing candidate record
    const results = await scoreApplications([good, broken], requirements, { embedTexts });

    expect(results).toHaveLength(2);
    expect(results[0].status).toBe("scored");
    expect(results[0].result.overallScore).toBeGreaterThan(0);
    expect(results[1].status).toBe("failed");
    expect(results[1].result).toBeUndefined();
  });
});

describe("scoreApplication — WS6.4 scoring-stage stability", () => {
  it("produces byte-identical output across 100 runs on one static CandidateProfile (σ = 0.00)", async () => {
    // Layer 1 handles all the MATCHING here (React and Kubernetes both match
    // literally after normalisation — matching.js's layer 3 was removed,
    // 5.4). The one remaining embedding-backed step in the whole scoring
    // path is verifyTerm() (5.6), deliberately exercised here: "Kubernetes"
    // is a real, matched candidate skill, but the CV text never states it
    // literally (only a paraphrase, "orchestrated container platform") — so
    // verifyTerm()'s literal search fails and it falls to its own embedding
    // comparison. The claim under test is determinism THROUGH that fallback
    // specifically, since it's the one place non-determinism could still
    // enter — not determinism of matching, which is now a pure string
    // comparison and was never in question.
    // verifyTerm() embeds the term plus EVERY sentence in extractedText (it
    // doesn't know in advance which one will win) — all three sentences here
    // need a vector, not just the one expected to match best. Deliberately
    // avoiding "React.js" in prose: the naive sentence-splitter (regex on
    // ./!/?) treats the "." in ".js" as its own sentence boundary, which
    // would otherwise split "Built React.js applications." into two
    // fragments — a real, pre-existing quirk, not something to paper over
    // with extra mock entries that obscure what this test is actually about.
    const embedTexts = mockEmbed({
      Kubernetes: REF,
      "BSc Computer Science graduate.": [0, 1],
      "Built React applications.": [0, 1],
      "Deployed workloads using a fully orchestrated container platform across multiple clusters.": unit(0.95),
    });
    const requirements = {
      requiredQualification: { level: 6, field: "Computer Science" },
      requiredSkills: ["React", "Kubernetes"],
      minYearsExperience: 4,
      niceToHave: ["GraphQL"], // no candidate skill covers it — stays missing, never reaches verifyTerm at all
    };
    const candidate = {
      candidateId: "CAND-STABILITY-01",
      skills: ["React", "Kubernetes"],
      education: [{ degree: "BSc Computer Science" }],
      totalYearsExperience: 3,
      extractedText:
        "BSc Computer Science graduate. Built React applications. Deployed workloads using a fully orchestrated container platform across multiple clusters.",
    };

    const runs = [];
    for (let i = 0; i < 100; i++) {
      runs.push(await scoreApplication(candidate, requirements, { embedTexts }));
    }

    const first = JSON.stringify(runs[0]);
    expect(runs.every((r) => JSON.stringify(r) === first)).toBe(true);
    // Confirms the fallback actually fired in every run, not that it was
    // silently skipped — a determinism claim over a path that never ran
    // would prove nothing.
    expect(runs[0].instrumentation.verification.embedding).toBe(1);

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
