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

// matchTermSet — layer 3 (embedding) was REMOVED 2026-09-12 (5.4, see
// test-fixtures/ws6-results.md). Normalisation-or-nothing: a required term
// either matches some candidate term after normalizeTerm(), or it's missing.
// No embedTexts dependency at all any more — the function is synchronous.
describe("matchTermSet", () => {
  it.each(["AngularJS", "Angular.js", "Angular JS", "AngularJS 1.8.3", "Angular.js v1.8", "Angular JS v1"])("keeps %s distinct from Angular in both directions", (legacy) => {
    expect(normalizeTerm(legacy)).toBe("angularjs");
    expect(matchTermSet(["Angular"], [legacy]).matched).toEqual([]);
    expect(matchTermSet([legacy], ["Angular"]).matched).toEqual([]);
    expect(matchTermSet(["AngularJS"], [legacy]).matched).toHaveLength(1);
  });

  it.each([["Node.js", "NodeJS"], ["React", "React.js"]])("preserves %s / %s equivalence", (a, b) => {
    expect(matchTermSet([a], [b]).matched).toHaveLength(1);
    expect(matchTermSet([b], [a]).matched).toHaveLength(1);
  });

  it("matches via normalisation", () => {
    const result = matchTermSet(["React"], ["React.js"]);
    expect(result.matched).toEqual([{ required: "React", found: "React.js" }]);
    expect(result.missing).toEqual([]);
  });

  it("is synchronous and takes no embedding dependency — there is nothing left to fall through to", () => {
    // matchTermSet no longer accepts (or needs) an embedTexts/threshold arg.
    // A genuine semantic equivalence with no shared normalized form (the
    // exact case layer 3 used to handle) now stays missing, full stop —
    // that's the point of the removal, not an oversight.
    const result = matchTermSet(["Container orchestration"], ["Kubernetes"]);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual(["Container orchestration"]);
  });

  it("does not credit a lexically/semantically related but non-identical term", () => {
    const result = matchTermSet(["MySQL"], ["PostgreSQL"]);
    expect(result.matched).toEqual([]);
    expect(result.missing).toEqual(["MySQL"]);
  });

  it("matches multiple required terms independently, case/whitespace-insensitively", () => {
    const result = matchTermSet(["React", "Node.js", "Docker"], ["  react  ", "NodeJS"]);
    expect(result.matched).toEqual([
      { required: "React", found: "  react  " },
      { required: "Node.js", found: "NodeJS" },
    ]);
    expect(result.missing).toEqual(["Docker"]);
  });

  it("handles empty inputs without throwing", () => {
    expect(matchTermSet([], ["React"])).toEqual({ matched: [], missing: [] });
    expect(matchTermSet(["React"], [])).toEqual({ matched: [], missing: ["React"] });
  });
});

// BORDERLINE_BAND now serves verification.js's verifyTerm() (5.6) — the only
// remaining embedding-threshold comparison in the scoring path. Its own
// tests live in verification.test.js; this just confirms the constant
// itself is still here and unchanged, since matching.js is where it's
// defined and exported from.
describe("BORDERLINE_BAND", () => {
  it("is 0.01, sized from the observed 6.4 threshold shift", () => {
    expect(BORDERLINE_BAND).toBe(0.01);
  });
});

describe("cosine", () => {
  it("computes standard cosine similarity", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 10);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });
});
