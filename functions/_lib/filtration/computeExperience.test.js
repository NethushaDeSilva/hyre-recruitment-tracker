import { describe, it, expect } from "vitest";
import { computeTotalYearsExperience } from "./computeExperience.js";

// A fixed reference date, injected explicitly everywhere — this suite must
// never depend on the real clock, matching the no-Date.now() rule for
// everything under filtration/.
const REF = new Date("2024-06-15T00:00:00Z");

describe("computeTotalYearsExperience", () => {
  it("returns 0 for no experience", () => {
    expect(computeTotalYearsExperience([], REF)).toBe(0);
    expect(computeTotalYearsExperience(undefined, REF)).toBe(0);
  });

  it("sums a single non-overlapping role", () => {
    const years = computeTotalYearsExperience(
      [{ startDate: "2020-01", endDate: "2022-01" }],
      REF
    );
    expect(years).toBe(2);
  });

  it("sums two sequential roles with no gap", () => {
    const years = computeTotalYearsExperience(
      [
        { startDate: "2018-01", endDate: "2020-01" },
        { startDate: "2020-01", endDate: "2022-01" },
      ],
      REF
    );
    expect(years).toBe(4);
  });

  it("does NOT count a gap between roles as experience", () => {
    // 2015-01 to 2017-01 (2y), gap of a year, 2018-01 to 2020-01 (2y) = 4y total,
    // NOT the 5y you'd get from naively spanning earliest-to-latest.
    const years = computeTotalYearsExperience(
      [
        { startDate: "2015-01", endDate: "2017-01" },
        { startDate: "2018-01", endDate: "2020-01" },
      ],
      REF
    );
    expect(years).toBe(4);
  });

  it("does NOT double-count overlapping concurrent roles", () => {
    // Full-time role Jan 2018 - Jan 2020, plus a concurrent freelance gig
    // Jun 2018 - Dec 2018 entirely inside it. Total must still be 2y, not 2.5y.
    const years = computeTotalYearsExperience(
      [
        { startDate: "2018-01", endDate: "2020-01" },
        { startDate: "2018-06", endDate: "2018-12" },
      ],
      REF
    );
    expect(years).toBe(2);
  });

  it("merges partially-overlapping roles correctly", () => {
    // Jan 2018 - Jan 2019, and Jul 2018 - Jul 2019 (overlap Jul 2018-Jan 2019).
    // Union is Jan 2018 - Jul 2019 = 18 months = 1.5y.
    const years = computeTotalYearsExperience(
      [
        { startDate: "2018-01", endDate: "2019-01" },
        { startDate: "2018-07", endDate: "2019-07" },
      ],
      REF
    );
    expect(years).toBe(1.5);
  });

  it('resolves "Present" / "Current" against the injected reference date', () => {
    const years = computeTotalYearsExperience(
      [{ startDate: "2022-06", endDate: "Present" }],
      REF // 2024-06
    );
    expect(years).toBe(2);
  });

  it("resolves an empty/missing endDate as ongoing", () => {
    const years = computeTotalYearsExperience(
      [{ startDate: "2023-06", endDate: null }],
      REF // 2024-06
    );
    expect(years).toBe(1);
  });

  it("includes internships like any other role, merging if concurrent", () => {
    const years = computeTotalYearsExperience(
      [
        { title: "Software Engineering Intern", startDate: "2019-06", endDate: "2019-09" },
        { title: "Software Engineer", startDate: "2020-01", endDate: "2022-01" },
      ],
      REF
    );
    // 3 months (intern) + 24 months (role) = 27 months = 2.25 -> rounds to 2.3
    expect(years).toBe(2.3);
  });

  it("accepts bare years, treating start-of-year for start and end-of-year for end", () => {
    // 2018 (no month) -> Jan 2018; 2020 (no month) -> Dec 2020. 35 months = 2.9y.
    const years = computeTotalYearsExperience([{ startDate: "2018", endDate: "2020" }], REF);
    expect(years).toBe(2.9);
  });

  it("skips an entry with an unparseable date rather than throwing", () => {
    const years = computeTotalYearsExperience(
      [
        { startDate: "sometime in the past", endDate: "2020-01" },
        { startDate: "2021-01", endDate: "2022-01" },
      ],
      REF
    );
    expect(years).toBe(1);
  });

  it("skips an entry where the end precedes the start rather than throwing", () => {
    const years = computeTotalYearsExperience(
      [
        { startDate: "2022-01", endDate: "2020-01" },
        { startDate: "2021-01", endDate: "2022-01" },
      ],
      REF
    );
    expect(years).toBe(1);
  });

  it("throws if referenceDate is not supplied — never silently reads the clock", () => {
    expect(() => computeTotalYearsExperience([{ startDate: "2020-01", endDate: "present" }])).toThrow();
  });

  it("is a pure function: identical input produces identical output across many runs", () => {
    const input = [
      { startDate: "2018-01", endDate: "2020-06" },
      { startDate: "2020-01", endDate: "present" },
    ];
    const results = new Set();
    for (let i = 0; i < 100; i++) results.add(computeTotalYearsExperience(input, REF));
    expect(results.size).toBe(1);
  });
});
