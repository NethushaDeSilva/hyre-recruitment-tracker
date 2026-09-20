import { expect, it } from "vitest";
import {
  validateDay, validateWeek, weekHasErrors, daySummaryChip, normalizeWeek, emptyWeek, DAY_KEYS,
  toLegacyAvailabilitySlots, buildLegacyAvailabilityDoc,
  upcomingWeekDates, upcomingWeekByDayKey, formatShortDate, formatFullDate, weekRangeLabel, upcomingWeekBoundsMs,
  currentWeekDates, currentWeekByDayKey,
} from "./weeklyAvailability.js";
import { availabilityState, materializeSlots } from "./availability.js";

it("flags end-before-start as an error", () => {
  const day = { enabled: true, available: [{ start: "10:00", end: "09:00" }] };
  const { errors } = validateDay(day);
  expect(errors).toEqual([{ list: "available", index: 0, message: "End time must be after start time." }]);
});

it("flags a non-15-minute time as an error", () => {
  const day = { enabled: true, available: [{ start: "09:07", end: "17:00" }] };
  const { errors } = validateDay(day);
  expect(errors[0].message).toMatch(/15-minute/);
});

it("flags overlapping available rows", () => {
  const day = { enabled: true, available: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "14:00" }] };
  const { errors } = validateDay(day);
  expect(errors).toHaveLength(2); // both available rows overlap each other
  expect(errors.every((e) => e.list === "available")).toBe(true);
});

it("weekHasErrors is true only when at least one day has a real error", () => {
  const week = validateWeek({ ...emptyWeek(), mon: { enabled: true, available: [{ start: "10:00", end: "09:00" }] } });
  expect(weekHasErrors(week)).toBe(true);
  expect(weekHasErrors(validateWeek(emptyWeek()))).toBe(false);
});

it("daySummaryChip: Not working / None / N slots", () => {
  expect(daySummaryChip({ enabled: false, available: [] })).toBe("Not working");
  expect(daySummaryChip({ enabled: true, available: [] })).toBe("None");
  expect(daySummaryChip({ enabled: true, available: [{ start: "09:00", end: "17:00" }] })).toBe("1 slot");
  expect(daySummaryChip({ enabled: true, available: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }] })).toBe("2 slots");
});

it("normalizeWeek fills in every day and drops malformed rows, never throws on garbage", () => {
  const out = normalizeWeek({ days: { mon: { enabled: true, available: [{ start: "09:00", end: "17:00" }, "garbage", { start: 5 }] } } });
  expect(DAY_KEYS.every((k) => k in out)).toBe(true);
  expect(out.mon.available).toEqual([{ start: "09:00", end: "17:00" }]);
  expect(out.tue).toEqual({ enabled: true, available: [] }); // day absent from the doc — defaults
  expect(normalizeWeek(null)).toEqual(emptyWeek());
});

// --- toLegacyAvailabilitySlots / buildLegacyAvailabilityDoc (FIX 1) --------
// There is no "blocked" list anymore — anything not listed as available is
// already busy by construction, so the legacy `slots` array is just the
// available ranges, mapped onto the old model's numeric Sunday-first dayOfWeek.

it("toLegacyAvailabilitySlots: a disabled day contributes nothing, an enabled day maps to numeric Sunday-first dayOfWeek", () => {
  const days = {
    ...emptyWeek(),
    mon: { enabled: true, available: [{ start: "09:00", end: "17:00" }] },
    sat: { enabled: false, available: [{ start: "09:00", end: "17:00" }] }, // disabled — must not appear
  };
  expect(toLegacyAvailabilitySlots(days)).toEqual([
    { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
  ]);
});

it("toLegacyAvailabilitySlots: a day with no available ranges contributes nothing", () => {
  const days = { ...emptyWeek(), tue: { enabled: true, available: [] } };
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

it("the derived legacy doc round-trips through availability.js's own reader functions correctly, and hours outside the declared range are busy", () => {
  const days = { ...emptyWeek(), mon: { enabled: true, available: [{ start: "09:00", end: "10:00" }] } };
  const now = Date.now();
  const validityMs = 14 * 24 * 60 * 60 * 1000;
  const legacyDoc = buildLegacyAvailabilityDoc(days, { exceptions: [], now, validityMs });
  // declaredAt is set by store.js with a real serverTimestamp() at write time;
  // here we supply `now` in its place, exactly as it will resolve to.
  const record = { ...legacyDoc, declaredAt: now, validUntil: legacyDoc.validUntil.getTime(), onLeave: false };

  expect(availabilityState(record, now)).toBe("available");

  // An 8-day window guarantees at least one Monday, whichever day `now` is.
  const free = materializeSlots(record, now, now + 8 * 24 * 60 * 60 * 1000);
  expect(free).toHaveLength(1);
  expect(free[0].endMs - free[0].startMs).toBe(1 * 3600 * 1000); // only 09:00-10:00 is free; every other hour is busy
});

// --- upcomingWeekDates / upcomingWeekByDayKey (real-date header) -----------
// 2026-09-19 12:00 UTC is a Saturday, so "tomorrow onward, 7 days" is
// Sun 20 -> Sat 26 Sep 2026 — the exact example given for this feature.
const SATURDAY_NOON_UTC = Date.UTC(2026, 8, 19, 12, 0, 0);

it("upcomingWeekDates starts tomorrow and never includes today or the past", () => {
  const dates = upcomingWeekDates(SATURDAY_NOON_UTC, "UTC");
  expect(dates).toHaveLength(7);
  expect(dates[0]).toMatchObject({ year: 2026, month: 9, day: 20, dayOfWeek: 0 }); // Sunday
  expect(dates[6]).toMatchObject({ year: 2026, month: 9, day: 26, dayOfWeek: 6 }); // Saturday
  expect(dates.some((d) => d.day === 19)).toBe(false); // today never appears
});

it("upcomingWeekByDayKey maps each DAY_KEYS entry to its real upcoming date", () => {
  const byKey = upcomingWeekByDayKey(SATURDAY_NOON_UTC, "UTC");
  expect(DAY_KEYS.every((k) => k in byKey)).toBe(true);
  expect(byKey.sun).toMatchObject({ day: 20, month: 9 });
  expect(byKey.mon).toMatchObject({ day: 21, month: 9 });
  expect(byKey.sat).toMatchObject({ day: 26, month: 9 });
});

it("formatShortDate / formatFullDate / weekRangeLabel render the expected labels", () => {
  const dates = upcomingWeekDates(SATURDAY_NOON_UTC, "UTC");
  expect(formatShortDate(dates[0])).toBe("20 Sep");
  expect(formatFullDate(dates[0])).toBe("Sun, 20 Sep 2026");
  expect(weekRangeLabel(dates)).toBe("Sun, 20 Sep 2026 – Sat, 26 Sep 2026");
});

it("the window rolls forward by one day when 'now' advances by a day", () => {
  const oneDayLater = SATURDAY_NOON_UTC + 24 * 60 * 60 * 1000;
  const dates = upcomingWeekDates(oneDayLater, "UTC");
  expect(dates[0]).toMatchObject({ day: 21, month: 9 }); // tomorrow is now the 21st
  expect(dates[6]).toMatchObject({ day: 27, month: 9 });
});

it("upcomingWeekBoundsMs spans from the start of tomorrow to the end of the 7th day, in UTC", () => {
  const { fromMs, toMs } = upcomingWeekBoundsMs(SATURDAY_NOON_UTC, "UTC");
  expect(new Date(fromMs).toISOString()).toBe("2026-09-20T00:00:00.000Z");
  expect(toMs).toBeGreaterThan(Date.UTC(2026, 8, 26, 23, 59, 0));
  expect(toMs).toBeLessThanOrEqual(Date.UTC(2026, 8, 27, 0, 0, 0));
});

// --- currentWeekDates / currentWeekByDayKey (Availability page, Sri Lanka week) ---
// 2026-09-20 06:00 UTC = 2026-09-20 11:30 Asia/Colombo (UTC+05:30) — a Sunday.
// Defaults to Asia/Colombo, matching the Availability page's own default.
const SUNDAY_MORNING_COLOMBO = Date.UTC(2026, 8, 20, 6, 0, 0);

it("currentWeekDates on a Sunday (Sri Lanka time) returns that same Sunday through Saturday", () => {
  const dates = currentWeekDates(SUNDAY_MORNING_COLOMBO); // default timeZone = Asia/Colombo
  expect(dates).toHaveLength(7);
  expect(dates[0]).toMatchObject({ year: 2026, month: 9, day: 20, dayOfWeek: 0 }); // Sun 20 Sep — today itself
  expect(dates[6]).toMatchObject({ year: 2026, month: 9, day: 26, dayOfWeek: 6 }); // Sat 26 Sep
  expect(weekRangeLabel(dates)).toBe("Sun, 20 Sep 2026 – Sat, 26 Sep 2026");
});

it("currentWeekDates mid-week still returns THIS week's Sunday-Saturday, including already-past days", () => {
  // Wednesday 23 Sep 2026, 11:30 Colombo — the week should still start on the
  // Sunday that already happened (20th), not roll forward to next Sunday.
  const wednesdayColombo = Date.UTC(2026, 8, 23, 6, 0, 0);
  const dates = currentWeekDates(wednesdayColombo);
  expect(dates[0]).toMatchObject({ day: 20, month: 9 });
  expect(dates[6]).toMatchObject({ day: 26, month: 9 });
});

it("currentWeekDates shifts to the following week once the system date crosses into a new Sunday", () => {
  // The very next Sunday, 27 Sep 2026 — the week must shift forward exactly one week.
  const nextSundayColombo = Date.UTC(2026, 8, 27, 6, 0, 0);
  const dates = currentWeekDates(nextSundayColombo);
  expect(dates[0]).toMatchObject({ day: 27, month: 9 });
  expect(dates[6]).toMatchObject({ day: 3, month: 10 });
});

it("currentWeekByDayKey maps DAY_KEYS (Sun-first) to this week's real dates", () => {
  const byKey = currentWeekByDayKey(SUNDAY_MORNING_COLOMBO);
  expect(DAY_KEYS).toEqual(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
  expect(byKey.sun).toMatchObject({ day: 20, month: 9 });
  expect(byKey.sat).toMatchObject({ day: 26, month: 9 });
});
