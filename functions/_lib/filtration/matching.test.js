import { describe, it, expect } from "vitest";
import { normalizeTerm, matchTermSet, cosine, BORDERLINE_BAND } from "./matching.js";

describe("normalizeTerm", () => {
  it("lowercases and trims", () => {
    expect(normalizeTerm("  React  ")).toBe("react");
  });

  it("strips a trailing .js/JS/js-with-space suffix (Node.js/NodeJS/node js)", () => {
    expect(normalizeTerm("React.js")).toBe("react");
    expect(normalizeTerm("NodeJS")).toBe("node");
    expect(normalizeTerm("node js")).toBe("node");
    expect(normalizeTerm("Node.js")).toBe("node");
  });

  it("never strips a bare 'JS' down to nothing", () => {
    expect(normalizeTerm("JS")).toBe("js");
  });

  it("strips a trailing space-separated version number", () => {
    expect(normalizeTerm("Python 3")).toBe("python");
  });

  it("leaves protected symbol-heavy terms untouched", () => {
    expect(normalizeTerm("C++")).toBe("c++");
    expect(normalizeTerm("C#")).toBe("c#");
    expect(normalizeTerm(".NET")).toBe(".net");
    expect(normalizeTerm("F#")).toBe("f#");
  });
});

// A mock that only knows the vectors a given test sets up — throws on any
// unexpected string so a test can never silently pass on the wrong input.
function mockEmbed(table) {
  return async (texts) => texts.map((t) => {
    if (!(t in table)) throw new Error(`mockEmbed: no vector configured for "${t}"`);
    return table[t];
  });
}
const unit = (cosineValue) => [cosineValue, Math.sqrt(1 - cosineValue * cosineValue)];
const REF = [1, 0];

describe("matchTermSet", () => {
  it("matches via normalisation alone and never calls embedTexts (5.5 economics)", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const result = await matchTermSet(["React"], ["React.js"], { embedTexts, threshold: 0.8 });
    expect(result.matched).toEqual([{ required: "React", found: "React.js", layer: "normalisation", similarity: 1 }]);
    expect(result.missing).toEqual([]);
    expect(result.counters).toEqual({ normalisation: 1, embedding: 0, none: 0, borderline: 0 });
  });

  it("falls through to embedding when no normalised match exists, credits strictly above threshold", async () => {
    const embedTexts = mockEmbed({ "Container orchestration": REF, "Kubernetes": unit(0.9) });
    const result = await matchTermSet(["Container orchestration"], ["Kubernetes"], { embedTexts, threshold: 0.85 });
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].layer).toBe("embedding");
    expect(result.matched[0].similarity).toBeCloseTo(0.9, 5);
    expect(result.counters).toEqual({ normalisation: 0, embedding: 1, none: 0, borderline: 0 });
  });

  it("does not credit a similarity at or below threshold", async () => {
    const embedTexts = mockEmbed({ "Unrelated Term": REF, "Something Else": unit(0) });
    const result = await matchTermSet(["Unrelated Term"], ["Something Else"], { embedTexts, threshold: 0.5 });
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual(["Unrelated Term"]);
    expect(result.counters.none).toBe(1);
  });

  // The exact-boundary case (similarity === threshold) is covered precisely
  // in thresholds.test.js via clearsThreshold() with clean decimal values —
  // testing it here too would mean deriving a cosine of exactly 0.5 from
  // sqrt(0.75), which floating point cannot represent exactly and makes the
  // test flaky rather than meaningful. matchTermSet delegates to the same
  // clearsThreshold() (see import above), so that coverage applies here too.

  it("flags BORDERLINE on both sides of the threshold, independent of match outcome", async () => {
    const above = mockEmbed({ Required: REF, Candidate: unit(0.505) });
    const resultAbove = await matchTermSet(["Required"], ["Candidate"], { embedTexts: above, threshold: 0.5 });
    expect(resultAbove.matched).toHaveLength(1);
    expect(resultAbove.counters.borderline).toBe(1);

    const below = mockEmbed({ Required: REF, Candidate: unit(0.495) });
    const resultBelow = await matchTermSet(["Required"], ["Candidate"], { embedTexts: below, threshold: 0.5 });
    expect(resultBelow.matched).toEqual([]);
    expect(resultBelow.counters.borderline).toBe(1);

    const far = mockEmbed({ Required: REF, Candidate: unit(0.9) });
    const resultFar = await matchTermSet(["Required"], ["Candidate"], { embedTexts: far, threshold: 0.5 });
    expect(resultFar.counters.borderline).toBe(0);
  });

  it("BORDERLINE_BAND is 0.01, sized from the observed 6.4 threshold shift", () => {
    expect(BORDERLINE_BAND).toBe(0.01);
  });
});

describe("cosine", () => {
  it("computes standard cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });
});
