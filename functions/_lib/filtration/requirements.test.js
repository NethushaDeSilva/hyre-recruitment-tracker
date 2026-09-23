import { expect, it } from "vitest";
import { requirementEntries } from "./requirements.js";

const names = (requirements, preferred = false) => requirementEntries(requirements, preferred).map(e => e.name);

// The exact real-posting scenario from the bug report: HR pasted messy
// multi-line text (copied from another AI's chat output) straight into the
// Nice to Have box, including a section heading and mid-sentence line-wraps.
const REAL_PASTE = `Nice-to-Haves / Edge Factors
Hands-on experience securing AI/ML models, LLM pipelines,
and AI product integrations (such as Altrium's Sentiva platform).
Familiarity with Infrastructure as Code (IaC) security auditing tools like Checkov, Tfsec, or AWS Config.`;

it("strips a section heading/label instead of keeping it as its own chip", () => {
  const result = names({ niceToHaveDisplay: REAL_PASTE }, true);
  expect(result).not.toContain("Nice-to-Haves / Edge Factors");
  expect(result.some(n => /nice-to-haves/i.test(n))).toBe(false);
});

it("never leaves an orphaned chip starting with a bare conjunction", () => {
  const result = names({ niceToHaveDisplay: REAL_PASTE }, true);
  expect(result.some(n => /^(and|or|but|with)\b/i.test(n))).toBe(false);
  // The vague, non-standalone "and AI product integrations (...)" fragment
  // is dropped from the visible chip list entirely (folded into the
  // preceding entry's context) rather than shown as a broken half-sentence.
  expect(result.some(n => n.includes("Sentiva"))).toBe(false);
});

it("keeps a genuine standalone tool named after a conjunction as its own clean chip", () => {
  const result = names({ niceToHaveDisplay: REAL_PASTE }, true);
  expect(result).toContain("AWS Config");
  expect(result).toContain("Tfsec");
});

it("keeps a short 'X and Y' compound pair as ONE chip, not split into three", () => {
  const result = names({ requiredSkillsDisplay: "HTML and CSS, SAST / DAST / SCA" });
  expect(result).toEqual(["HTML and CSS", "SAST / DAST / SCA"]);
  expect(result).not.toContain("and");
  expect(result).not.toContain("HTML");
  expect(result).not.toContain("CSS");
});

it("recognises common heading vocabulary beyond the literal words 'skills'/'requirements'", () => {
  for (const heading of ["Nice to Have", "Nice to Haves:", "Must-Haves", "Edge Factors", "Core Skills / Requirements", "Bonus Points"]) {
    const result = names({ requiredSkillsDisplay: `${heading}\nReact, TypeScript` });
    expect(result).toEqual(["React", "TypeScript"]);
  }
});

it("a bare conjunction fragment with no previous entry on the same call falls back to the stripped remainder", () => {
  // No entry exists yet to fold "and X" into — the stripped word is
  // still returned rather than silently vanishing content HR typed.
  const result = names({ requiredSkillsDisplay: "and React" });
  expect(result).toEqual(["React"]);
});
