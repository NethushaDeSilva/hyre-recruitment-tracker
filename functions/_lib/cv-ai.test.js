import { describe, it, expect } from "vitest";
import { cheapTextChecks, truncateForModel, parseCvProfile, MIN_CHARS, TRUNCATION_BUDGET, TRUNCATION_HALF } from "./cv-ai.js";

it("keeps capped extraction usable and reports every capped field", async () => {
  const env = { AI: { run: async () => ({ response: { skills: Array(41).fill("React"), education: Array(21).fill({ awardType: "BSc" }) } }) } };
  const profile = await parseCvProfile(env, "CV content");
  expect(profile.skills).toHaveLength(40);
  expect(profile.education).toHaveLength(20);
  expect(profile.outputCapped).toBe(true);
  expect(profile.outputCappedFields).toEqual(["education", "skills"]);
});

describe("cheapTextChecks", () => {
  it("rejects text under MIN_CHARS as too-short", () => {
    expect(cheapTextChecks("x".repeat(MIN_CHARS - 1))).toEqual({
      ok: false, stage: "too-short", reason: "This file has very little text to check.",
    });
  });

  it("never rejects a long CV for length (5.9: truncated, never rejected)", () => {
    expect(cheapTextChecks("x".repeat(MIN_CHARS))).toEqual({ ok: true });
    expect(cheapTextChecks("x".repeat(50000))).toEqual({ ok: true });
    expect(cheapTextChecks("x".repeat(1_000_000))).toEqual({ ok: true });
  });
});

describe("truncateForModel", () => {
  it("leaves text at or under the budget untouched", () => {
    const atBudget = "a".repeat(TRUNCATION_BUDGET);
    expect(truncateForModel(atBudget)).toEqual({ text: atBudget, truncationApplied: false, truncationStrategy: null });

    const short = "hello world";
    expect(truncateForModel(short)).toEqual({ text: short, truncationApplied: false, truncationStrategy: null });
  });

  it("applies HEAD_TAIL_FALLBACK and excises the middle when over budget", () => {
    // distinct head/middle/tail so we can prove the middle specifically was dropped
    const head = "H".repeat(TRUNCATION_HALF);
    const middle = "M".repeat(1000);
    const tail = "T".repeat(TRUNCATION_HALF);
    const result = truncateForModel(head + middle + tail);

    expect(result.truncationApplied).toBe(true);
    expect(result.truncationStrategy).toBe("HEAD_TAIL_FALLBACK");
    expect(result.text).toBe(head + tail);
    expect(result.text.length).toBe(TRUNCATION_HALF * 2);
    expect(result.text.includes("M")).toBe(false); // the middle is genuinely gone, not just uncounted
  });

  it("is deterministic — same length truncates the same way every time", () => {
    const text = "a".repeat(TRUNCATION_BUDGET + 500);
    expect(truncateForModel(text)).toEqual(truncateForModel(text));
  });

  it("respects a custom budget/half pair", () => {
    const result = truncateForModel("x".repeat(100), 50, 20);
    expect(result.truncationApplied).toBe(true);
    expect(result.text.length).toBe(40);
  });
});
