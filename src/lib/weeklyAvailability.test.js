import { expect, it } from "vitest";
import { validateDay, validateWeek, weekHasErrors, daySummaryChip, normalizeWeek, emptyWeek, DAY_KEYS } from "./weeklyAvailability.js";

it("flags end-before-start as an error", () => {
  const day = { enabled: true, available: [{ start: "10:00", end: "09:00" }], blocked: [] };
  const { errors } = validateDay(day);
  expect(errors).toEqual([{ list: "available", index: 0, message: "End time must be after start time." }]);
});

it("flags a non-15-minute time as an error", () => {
  const day = { enabled: true, available: [{ start: "09:07", end: "17:00" }], blocked: [] };
  const { errors } = validateDay(day);
  expect(errors[0].message).toMatch(/15-minute/);
});

it("flags overlapping rows within the same list, but not across lists", () => {
  const day = {
    enabled: true,
    available: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "14:00" }],
    blocked: [{ start: "10:00", end: "10:30" }], // inside available — fine, that's the point of "blocked"
  };
  const { errors } = validateDay(day);
  expect(errors).toHaveLength(2); // both available rows overlap each other
  expect(errors.every((e) => e.list === "available")).toBe(true);
});

it("warns (not errors) when a blocked range sits entirely outside every available range", () => {
  const day = { enabled: true, available: [{ start: "09:00", end: "12:00" }], blocked: [{ start: "14:00", end: "15:00" }] };
  const { errors, warnings } = validateDay(day);
  expect(errors).toHaveLength(0);
  expect(warnings).toEqual([{ list: "blocked", index: 0, message: "This blocked time is outside your available hours" }]);
});

it("does not warn when a blocked range overlaps an available range", () => {
  const day = { enabled: true, available: [{ start: "09:00", end: "17:00" }], blocked: [{ start: "12:00", end: "13:00" }] };
  const { warnings } = validateDay(day);
  expect(warnings).toHaveLength(0);
});

it("weekHasErrors is true only when at least one day has a real error", () => {
  const week = validateWeek({ ...emptyWeek(), mon: { enabled: true, available: [{ start: "10:00", end: "09:00" }], blocked: [] } });
  expect(weekHasErrors(week)).toBe(true);
  expect(weekHasErrors(validateWeek(emptyWeek()))).toBe(false);
});

it("daySummaryChip: Not working / None / N slots", () => {
  expect(daySummaryChip({ enabled: false, available: [], blocked: [] })).toBe("Not working");
  expect(daySummaryChip({ enabled: true, available: [], blocked: [] })).toBe("None");
  expect(daySummaryChip({ enabled: true, available: [{ start: "09:00", end: "17:00" }], blocked: [] })).toBe("1 slot");
  expect(daySummaryChip({ enabled: true, available: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }], blocked: [] })).toBe("2 slots");
});

it("normalizeWeek fills in every day and drops malformed rows, never throws on garbage", () => {
  const out = normalizeWeek({ days: { mon: { enabled: true, available: [{ start: "09:00", end: "17:00" }, "garbage", { start: 5 }], blocked: null } } });
  expect(DAY_KEYS.every((k) => k in out)).toBe(true);
  expect(out.mon.available).toEqual([{ start: "09:00", end: "17:00" }]);
  expect(out.mon.blocked).toEqual([]);
  expect(out.tue).toEqual({ enabled: true, available: [], blocked: [] }); // day absent from the doc — defaults
  expect(normalizeWeek(null)).toEqual(emptyWeek());
});
