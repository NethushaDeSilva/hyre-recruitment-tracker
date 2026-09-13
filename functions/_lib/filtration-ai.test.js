import { describe, it, expect } from "vitest";
import { scoreOneApplication, scoreVacancyApplications, ScoringError } from "./filtration-ai.js";
import { ENGINE_VERSION } from "./filtration/engine.js";
import { getThresholds } from "./filtration/thresholds.js";
import { EMBEDDING_MODEL } from "./embeddings.js";

const unit = (cosineValue) => [cosineValue, Math.sqrt(1 - cosineValue * cosineValue)];
const REF = [1, 0];
const NOW = () => new Date("2026-09-10T12:00:00Z");

// A fake Workers AI binding: records every call and returns vectors from a
// lookup table, positionally aligned to the (already-deduped) input — the
// same contract runEmbeddings() expects of the real env.AI.run.
function fakeAiEnv(table) {
  const calls = [];
  return {
    calls,
    env: {
      AI: {
        run: async (model, { text }) => {
          calls.push([...text]);
          return {
            data: text.map((t) => {
              if (!(t in table)) throw new Error(`fakeAiEnv: no vector configured for "${t}"`);
              return table[t];
            }),
          };
        },
      },
    },
  };
}

describe("scoreOneApplication — meta is assembled after the engine returns", () => {
  it("attaches meta with real thresholds/engineVersion, and calls Workers AI zero times on a fully layer-1 match", async () => {
    const { env, calls } = fakeAiEnv({}); // no entries — any call throws, proving zero embedding calls
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
      extractedText: "BSc Computer Science graduate, experienced in React.js and Node.js.",
    };

    const result = await scoreOneApplication({ candidate, requirements, env, now: NOW });

    expect(calls).toHaveLength(0);
    expect(result.overallScore).toBe(90);
    expect(result.meta).toEqual({
      extractionModel: null,
      embeddingModel: EMBEDDING_MODEL,
      skillThreshold: getThresholds().SKILL_SIMILARITY_THRESHOLD,
      qualThreshold: getThresholds().QUAL_SIMILARITY_THRESHOLD,
      engineVersion: ENGINE_VERSION,
      scoredAt: "2026-09-10T12:00:00.000Z",
    });
  });

  it("routes verifyTerm()'s embedding fallback through the real Workers AI call shape (env.AI.run) — matching.js's own layer 3 was removed, 5.4", async () => {
    const { env, calls } = fakeAiEnv({
      Kubernetes: REF,
      "Deployed workloads using a fully orchestrated container platform across multiple clusters.": unit(0.95),
    });
    const requirements = { requiredQualification: null, requiredSkills: ["Kubernetes"], minYearsExperience: 2, niceToHave: [] };
    const candidate = {
      skills: ["Kubernetes"], // matches at layer 1 (exact, after normalisation)
      education: [],
      totalYearsExperience: 2,
      // "Kubernetes" is never written literally, only paraphrased — so
      // verifyTerm()'s literal search fails and it falls to embedding (5.6,
      // the one embedding-backed step layer-3 removal deliberately kept).
      extractedText: "Deployed workloads using a fully orchestrated container platform across multiple clusters.",
    };

    const result = await scoreOneApplication({ candidate, requirements, env, now: NOW });

    expect(calls).toHaveLength(1);
    expect(new Set(calls[0])).toEqual(new Set(["Kubernetes", "Deployed workloads using a fully orchestrated container platform across multiple clusters."]));
    expect(result.breakdown.coreSkills.matched[0].status).toBe("inferred");
    expect(result.meta.scoredAt).toBe("2026-09-10T12:00:00.000Z");
  });

  it("propagates ScoringError from the engine when the vacancy has no structured requirements", async () => {
    const { env } = fakeAiEnv({});
    await expect(scoreOneApplication({ candidate: { skills: [] }, requirements: { requiredSkills: [] }, env, now: NOW }))
      .rejects.toBeInstanceOf(ScoringError);
  });
});

describe("scoreVacancyApplications — 5.5 shared embedding cache across candidates", () => {
  it("embeds each unique string exactly once across the whole batch, not once per candidate", async () => {
    // 5.5's caching claim, now proven through verifyTerm()'s (5.6) embedding
    // fallback rather than the removed matching-layer one: both candidates
    // match "Kubernetes" at layer 1, and both need it verified by embedding
    // (neither's extractedText states it literally) — the shared TERM
    // "Kubernetes" must still be embedded exactly once across the batch,
    // even though each candidate's own sentence is unique to them.
    const { env, calls } = fakeAiEnv({
      Kubernetes: REF,
      "Deployed workloads on a fully managed container orchestration platform.": unit(0.95),
      "Ran production services on an automated container scheduling system.": unit(0.9),
    });
    const requirements = { requiredQualification: null, requiredSkills: ["Kubernetes"], minYearsExperience: 0, niceToHave: [] };
    const candidates = [
      { candidateId: "CAND-0001", skills: ["Kubernetes"], education: [], totalYearsExperience: 0, extractedText: "Deployed workloads on a fully managed container orchestration platform." },
      { candidateId: "CAND-0002", skills: ["Kubernetes"], education: [], totalYearsExperience: 0, extractedText: "Ran production services on an automated container scheduling system." },
    ];

    const results = await scoreVacancyApplications({ candidates, requirements, env, now: NOW });

    const allEmbedded = calls.flat();
    expect(allEmbedded.filter((s) => s === "Kubernetes")).toHaveLength(1);
    expect(results.every((r) => r.status === "scored")).toBe(true);
    expect(results.every((r) => r.result.instrumentation.verification.embedding === 1)).toBe(true);
    expect(results.every((r) => r.result.meta.engineVersion === ENGINE_VERSION)).toBe(true);
  });

  it("a malformed candidate fails that entry only, and never carries a meta object", async () => {
    const { env } = fakeAiEnv({});
    const requirements = { requiredQualification: null, requiredSkills: ["React"], minYearsExperience: 0, niceToHave: [] };
    const candidates = [
      { candidateId: "CAND-0001", skills: ["React"], education: [], totalYearsExperience: 0, extractedText: "React developer." },
      null,
    ];

    const results = await scoreVacancyApplications({ candidates, requirements, env, now: NOW });

    expect(results[0].status).toBe("scored");
    expect(results[0].result.meta).toBeTruthy();
    expect(results[1].status).toBe("failed");
    expect(results[1].result).toBeUndefined();
  });
});
