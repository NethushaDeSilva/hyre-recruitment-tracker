import { expect, it } from "vitest";
import {
  validateDay, validateWeek, weekHasErrors, daySummaryChip, normalizeWeek, emptyWeek, DAY_KEYS,
  subtractBlockedFromRange, toLegacyAvailabilitySlots, buildLegacyAvailabilityDoc,
} from "./weeklyAvailability.js";
import { availabilityState, materializeSlots } from "./availability.js";

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

// --- subtractBlockedFromRange (FIX 1) --------------------------------------

const RANGE = { start: "09:00", end: "17:00" };

it("subtractBlockedFromRange: no blocked ranges returns the available range unchanged", () => {
  expect(subtractBlockedFromRange(RANGE, [])).toEqual([{ start: "09:00", end: "17:00" }]);
});

it("subtractBlockedFromRange: blocked fully inside available splits into two", () => {
  expect(subtractBlockedFromRange(RANGE, [{ start: "12:00", end: "13:00" }])).toEqual([
    { start: "09:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ]);
});

it("subtractBlockedFromRange: blocked overlapping the start clips the start", () => {
  expect(subtractBlockedFromRange(RANGE, [{ start: "08:00", end: "10:00" }])).toEqual([{ start: "10:00", end: "17:00" }]);
});

it("subtractBlockedFromRange: blocked overlapping the end clips the end", () => {
  expect(subtractBlockedFromRange(RANGE, [{ start: "16:00", end: "18:00" }])).toEqual([{ start: "09:00", end: "16:00" }]);
});

it("subtractBlockedFromRange: blocked covering the whole range leaves nothing", () => {
  expect(subtractBlockedFromRange(RANGE, [{ start: "08:00", end: "18:00" }])).toEqual([]);
});

it("subtractBlockedFromRange: blocked entirely outside the range leaves it unchanged", () => {
  expect(subtractBlockedFromRange(RANGE, [{ start: "18:00", end: "19:00" }])).toEqual([{ start: "09:00", end: "17:00" }]);
});

it("subtractBlockedFromRange: multiple blocked ranges reduce it correctly", () => {
  expect(subtractBlockedFromRange(RANGE, [{ start: "10:00", end: "11:00" }, { start: "14:00", end: "15:00" }])).toEqual([
    { start: "09:00", end: "10:00" },
    { start: "11:00", end: "14:00" },
    { start: "15:00", end: "17:00" },
  ]);
});

// --- toLegacyAvailabilitySlots / buildLegacyAvailabilityDoc (FIX 1) --------

it("toLegacyAvailabilitySlots: a disabled day contributes nothing, an enabled day maps to numeric Sunday-first dayOfWeek", () => {
  const days = {
    ...emptyWeek(),
    mon: { enabled: true, available: [{ start: "09:00", end: "17:00" }], blocked: [{ start: "12:00", end: "13:00" }] },
    sat: { enabled: false, available: [{ start: "09:00", end: "17:00" }], blocked: [] }, // disabled — must not appear
  };
  expect(toLegacyAvailabilitySlots(days)).toEqual([
    { dayOfWeek: 1, startTime: "09:00", endTime: "12:00" },
    { dayOfWeek: 1, startTime: "13:00", endTime: "17:00" },
  ]);
});

it("toLegacyAvailabilitySlots: an available range fully covered by a blocked range contributes nothing", () => {
  const days = { ...emptyWeek(), tue: { enabled: true, available: [{ start: "09:00", end: "17:00" }], blocked: [{ start: "08:00", end: "18:00" }] } };
  expect(toLegacyAvailabilitySlots(days)).toEqual([]);
});

it("buildLegacyAvailabilityDoc: preserves passed-in exceptions untouched and derives validUntil from the given validityMs", () => {
  const exceptions = [{ date: "2026-01-01", type: "leave", reason: "" }];
  const now = 1_000_000;
  const validityMs = 14 * 24 * 60 * 60 * 1000;
  const doc = buildLegacyAvailabilityDoc(emptyWeek(), { exceptions, now, validityMs });
  expect(doc.exceptions).toBe(exceptions); // same reference — never invented, never dropped
  expect(doc.timeZone).toBe("Asia/Colombo");
  expect(doc.slots).toEqual([]);
  expect(doc.validUntil.getTime()).toBe(now + validityMs);
});

// --- Integration-level: the derived doc must be shaped exactly as
// src/lib/availability.js's real readers expect (not eyeballed) ------------

it("the derived legacy doc round-trips through availability.js's own reader functions correctly", () => {
  const days = { ...emptyWeek(), mon: { enabled: true, available: [{ start: "09:00", end: "17:00" }], blocked: [{ start: "12:00", end: "13:00" }] } };
  const now = Date.now();
  const validityMs = 14 * 24 * 60 * 60 * 1000;
  const legacyDoc = buildLegacyAvailabilityDoc(days, { exceptions: [], now, validityMs });
  // declaredAt is set by store.js with a real serverTimestamp() at write time;
  // here we supply `now` in its place, exactly as it will resolve to.
  const record = { ...legacyDoc, declaredAt: now, validUntil: legacyDoc.validUntil.getTime(), onLeave: false };

  expect(availabilityState(record, now)).toBe("available");

  // An 8-day window guarantees at least one Monday, whichever day `now` is.
  const free = materializeSlots(record, now, now + 8 * 24 * 60 * 60 * 1000);
  expect(free).toHaveLength(2);
  const durationsMs = free.map((s) => s.endMs - s.startMs).sort((a, b) => a - b);
  expect(durationsMs).toEqual([3 * 3600 * 1000, 4 * 3600 * 1000]); // 09-12 and 13-17
});
