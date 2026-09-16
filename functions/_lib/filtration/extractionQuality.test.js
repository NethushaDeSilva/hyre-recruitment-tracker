import { it, expect } from "vitest";
import { extractionQuality } from "./extractionQuality.js";
it("distinguishes precise dates from missing, reversed and year-only dates without changing arithmetic", () => {
  expect(extractionQuality({ experience: [{ startDate: "2020-01", endDate: "2024-01" }] }).experienceReliable).toBe(true);
  for (const e of [{ startDate: "2020", endDate: "2024" }, { startDate: null, endDate: "Present" }, { startDate: "2024-01", endDate: "2020-01" }, { startDate: "2020-01", endDate: null }]) {
    expect(extractionQuality({ experience: [e] }).experienceReliable).toBe(false);
  }
});
it("propagates nonfatal extraction truncation and caps", () => {
  expect(extractionQuality({ outputCapped: true, outputCappedFields: ["skills"] }, true)).toMatchObject({ complete: false, inputTruncated: true, outputCapped: true, outputCappedFields: ["skills"] });
});
