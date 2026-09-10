import { describe, it, expect } from "vitest";
import { verifyTerm } from "./verification.js";

function mockEmbed(table) {
  return async (texts) => texts.map((t) => {
    if (!(t in table)) throw new Error(`mockEmbed: no vector configured for "${t}"`);
    return table[t];
  });
}
const unit = (cosineValue) => [cosineValue, Math.sqrt(1 - cosineValue * cosineValue)];
const REF = [1, 0];

describe("verifyTerm — verified (word-boundary text match)", () => {
  it("finds a plain word and reports its offset, without calling embedTexts", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const text = "Built dashboards with React and Redux.";
    const result = await verifyTerm("React", text, { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("verified");
    expect(result.evidence).toBe("React");
    expect(result.offset).toBe(text.indexOf("React"));
  });

  it("never verifies a multi-word term by scattered single words", async () => {
    const embedTexts = mockEmbed({
      "Machine Learning": REF,
      "I have experience learning to use the machine for automation.": unit(0),
    });
    const text = "I have experience learning to use the machine for automation.";
    const result = await verifyTerm("Machine Learning", text, { embedTexts, threshold: 0.8 });
    expect(result.status).not.toBe("verified");
  });

  it("handles symbol-heavy names (C++) where \\b would fail", async () => {
    const text = "Proficient in C++ and Python.";
    const embedTexts = async () => { throw new Error("should not be called"); };
    const result = await verifyTerm("C++", text, { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("verified");
    expect(result.evidence).toBe("C++");
  });

  it("normalises the Node.js/NodeJS/node js family when searching text", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const result = await verifyTerm("Node.js", "Backend built on NodeJS with Express.", { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("verified");
  });
});

describe("verifyTerm — inferred (embedding-supported, not literal)", () => {
  it("credits a term semantically supported by nearby text", async () => {
    const text = "Built REST APIs in Express and deployed to production servers.";
    const embedTexts = mockEmbed({ "Node.js": REF, [text]: unit(0.9) });
    const result = await verifyTerm("Node.js", text, { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("inferred");
    expect(result.evidence).toBe(text);
    expect(result.confidence).toBeCloseTo(0.9, 5);
  });
});

describe("verifyTerm — unverifiable", () => {
  it("drops a term with no textual or semantic support, without inventing evidence", async () => {
    const text = "Led a small design team and ran user research sessions.";
    const embedTexts = mockEmbed({ Kubernetes: REF, [text]: unit(0) });
    const result = await verifyTerm("Kubernetes", text, { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("unverifiable");
    expect(result.evidence).toBeNull();
    expect(result.offset).toBeNull();
  });

  it("is unverifiable against empty text", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const result = await verifyTerm("Kubernetes", "", { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("unverifiable");
  });
});
