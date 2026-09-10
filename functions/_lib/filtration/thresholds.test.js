import { describe, it, expect } from "vitest";
import { getThresholds, clearsThreshold } from "./thresholds.js";

describe("getThresholds", () => {
  it("returns the calibrated thresholds with their provenance", () => {
    const t = getThresholds();
    expect(t.SKILL_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(t.SKILL_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
    expect(t.QUAL_SIMILARITY_THRESHOLD).toBeGreaterThan(0);
    expect(t.QUAL_SIMILARITY_THRESHOLD).toBeLessThanOrEqual(1);
    expect(t.model).toBe("@cf/baai/bge-base-en-v1.5");
    expect(t.calibratedAt).toBeTruthy();
  });
});

describe("clearsThreshold", () => {
  it("is strictly above, never at-or-above", () => {
    expect(clearsThreshold(0.88, 0.88)).toBe(false); // the exact hard negative that sets the threshold must not credit itself
    expect(clearsThreshold(0.8801, 0.88)).toBe(true);
    expect(clearsThreshold(0.8799, 0.88)).toBe(false);
  });
});
