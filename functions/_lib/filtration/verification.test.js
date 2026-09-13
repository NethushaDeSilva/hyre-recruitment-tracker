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
    // 5.4 instrumentation (relabeled to track this layer since matching.js's
    // own layer 3 was removed): a literal match never fires the embedding call.
    expect(result.firedEmbedding).toBe(false);
    expect(result.borderline).toBe(false);
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
    expect(result.firedEmbedding).toBe(true);
    expect(result.borderline).toBe(false); // 0.9 vs 0.8 threshold — well clear, not within BORDERLINE_BAND (0.01)
  });

  it("flags borderline when the winning similarity sits within BORDERLINE_BAND of the threshold", async () => {
    const text = "Some nearby sentence.";
    const embedTexts = mockEmbed({ Term: REF, [text]: unit(0.805) }); // threshold 0.8, within 0.01
    const result = await verifyTerm("Term", text, { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("inferred"); // 0.805 > 0.8, strictly above, still credited
    expect(result.borderline).toBe(true);
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
    // The embedding call DID fire here (there was text to compare against) —
    // it just didn't clear the threshold. Distinct from the empty-text case
    // below, where it never fires at all.
    expect(result.firedEmbedding).toBe(true);
  });

  it("is unverifiable against empty text, and never calls embedTexts — nothing to compare against", async () => {
    const embedTexts = async () => { throw new Error("should not be called"); };
    const result = await verifyTerm("Kubernetes", "", { embedTexts, threshold: 0.8 });
    expect(result.status).toBe("unverifiable");
    expect(result.firedEmbedding).toBe(false);
    expect(result.borderline).toBe(false);
  });
});
