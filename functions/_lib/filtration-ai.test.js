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

  it("routes layer-3 matches through the real Workers AI call shape (env.AI.run)", async () => {
    const { env, calls } = fakeAiEnv({ "Container orchestration": REF, Kubernetes: unit(0.95) });
    const requirements = { requiredQualification: null, requiredSkills: ["Container orchestration"], minYearsExperience: 2, niceToHave: [] };
    const candidate = {
      skills: ["Kubernetes"],
      education: [],
      totalYearsExperience: 2,
      extractedText: "Deployed workloads using Kubernetes across multiple clusters.",
    };

    const result = await scoreOneApplication({ candidate, requirements, env, now: NOW });

    expect(calls).toHaveLength(1);
    expect(new Set(calls[0])).toEqual(new Set(["Container orchestration", "Kubernetes"]));
    expect(result.breakdown.coreSkills.matched[0].layer).toBe("embedding");
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
    const { env, calls } = fakeAiEnv({ "Container orchestration": REF, Kubernetes: unit(0.95), Docker: unit(0.9) });
    const requirements = { requiredQualification: null, requiredSkills: ["Container orchestration"], minYearsExperience: 0, niceToHave: [] };
    const candidates = [
      { candidateId: "CAND-0001", skills: ["Kubernetes"], education: [], totalYearsExperience: 0, extractedText: "Kubernetes deployments." },
      { candidateId: "CAND-0002", skills: ["Docker"], education: [], totalYearsExperience: 0, extractedText: "Docker containers." },
    ];

    const results = await scoreVacancyApplications({ candidates, requirements, env, now: NOW });

    // The shared cache (built into engine.js's scoreApplications) is lazy, not
    // a pre-batched fetch — calls happen incrementally as each candidate is
    // scored, so there can be more than one call. What 5.5 actually promises
    // is that no string is EMBEDDED TWICE: "Container orchestration" is needed
    // by both candidates but must appear in exactly one call, total.
    const allEmbedded = calls.flat();
    expect(allEmbedded.filter((s) => s === "Container orchestration")).toHaveLength(1);
    expect(new Set(allEmbedded)).toEqual(new Set(["Container orchestration", "Kubernetes", "Docker"]));
    expect(results.every((r) => r.status === "scored")).toBe(true);
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
