// Date/time gating for Schedule availability: the past is never schedulable.
// Everything is evaluated in Sri Lanka time (Asia/Colombo), matching the
// existing currentWeekDates() convention — never the browser zone, never UTC.
//
// Reference moment throughout: Thursday 24 Sep 2026, 14:30 Colombo. Thursday
// is deliberate — it makes Sun/Mon/Tue AND Wednesday past days, which is the
// case a naive "only the weekend is past" implementation gets wrong.
import { describe, expect, it } from "vitest";
import { wallTimeToUTC } from "./wallClock";
import {
  dayTimeState, colomboTodayIndex, colomboNowHHMM, colomboNowMinutes,
  validateWeekTiming, mergeValidation, weekHasErrors, validateWeek,
  emptyWeek, PAST_DAY_MESSAGE, PAST_TIME_MESSAGE, DAY_KEYS,
} from "./weeklyAvailability";

const COLOMBO = "Asia/Colombo";
const at = (hour, minute = 0, day = 24) =>
  wallTimeToUTC({ timeZone: COLOMBO, year: 2026, month: 9, day, hour, minute });
const THURSDAY_1430 = at(14, 30);

const week = (overrides = {}) => ({ ...emptyWeek(), ...overrides });
const day = (...rows) => ({ enabled: true, available: rows });
const row = (start, end) => ({ start, end });

describe("day classification (Asia/Colombo)", () => {
  it("treats Thursday 14:30 Colombo as Thursday, not whatever the runner's zone says", () => {
    expect(colomboTodayIndex(THURSDAY_1430)).toBe(4); // DAY_KEYS: 0=sun .. 4=thu
    expect(colomboNowHHMM(THURSDAY_1430)).toBe("14:30");
    expect(colomboNowMinutes(THURSDAY_1430)).toBe(14 * 60 + 30);
  });

  it("marks every day before today past — INCLUDING Wednesday — today as today, and the rest future", () => {
    expect(DAY_KEYS.map((k) => dayTimeState(k, THURSDAY_1430))).toEqual([
      "past",   // sun
      "past",   // mon
      "past",   // tue
      "past",   // wed  <- the one a "weekend only" implementation misses
      "today",  // thu
      "future", // fri
      "future", // sat
    ]);
  });

  it("is computed in Colombo time, not UTC: 00:30 Colombo Thursday is still Wednesday in UTC", () => {
    // 00:30 Colombo on Thu 24th == 19:00 UTC on Wed 23rd.
    const justAfterColomboMidnight = at(0, 30);
    expect(new Date(justAfterColomboMidnight).getUTCDay()).toBe(3); // UTC still says Wednesday
    expect(colomboTodayIndex(justAfterColomboMidnight)).toBe(4);    // Colombo correctly says Thursday
    expect(dayTimeState("wed", justAfterColomboMidnight)).toBe("past");
  });
});

describe("past days are frozen", () => {
  const saved = week({ wed: day(row("09:00", "12:00")) });

  it("accepts an unchanged past day", () => {
    const timing = validateWeekTiming(saved, saved, THURSDAY_1430);
    expect(timing.wed.errors).toEqual([]);
  });

  it("rejects editing a past day's times", () => {
    const edited = week({ wed: day(row("09:00", "17:00")) });
    const timing = validateWeekTiming(edited, saved, THURSDAY_1430);
    expect(timing.wed.errors).toEqual([{ list: "day", index: -1, message: PAST_DAY_MESSAGE }]);
  });

  it("rejects ADDING to a past day and rejects DELETING from one — history can't be rewritten either way", () => {
    const added = week({ wed: day(row("09:00", "12:00"), row("14:00", "16:00")) });
    const removed = week({ wed: day() });
    expect(validateWeekTiming(added, saved, THURSDAY_1430).wed.errors).toHaveLength(1);
    expect(validateWeekTiming(removed, saved, THURSDAY_1430).wed.errors).toHaveLength(1);
  });

  it("rejects toggling a past day's enabled flag", () => {
    const disabled = week({ wed: { enabled: false, available: [] } });
    expect(validateWeekTiming(disabled, saved, THURSDAY_1430).wed.errors).toHaveLength(1);
  });
});

describe("today is editable, but only forward", () => {
  const saved = week({ thu: day(row("09:00", "10:00")) }); // saved this morning

  it("rejects a NEW slot starting before the current time", () => {
    const edited = week({ thu: day(row("09:00", "10:00"), row("11:00", "12:00")) });
    const timing = validateWeekTiming(edited, saved, THURSDAY_1430);
    expect(timing.thu.errors).toEqual([{ list: "available", index: 1, message: PAST_TIME_MESSAGE }]);
  });

  it("accepts a new slot starting at or after the current time", () => {
    const atNow = week({ thu: day(row("09:00", "10:00"), row("14:30", "16:00")) });
    const later = week({ thu: day(row("09:00", "10:00"), row("16:00", "17:00")) });
    expect(validateWeekTiming(atNow, saved, THURSDAY_1430).thu.errors).toEqual([]);
    expect(validateWeekTiming(later, saved, THURSDAY_1430).thu.errors).toEqual([]);
  });

  it("grandfathers a slot saved earlier today — it is not retroactively invalid at 14:30", () => {
    // 09:00–10:00 is long past, but it's already stored and untouched.
    expect(validateWeekTiming(saved, saved, THURSDAY_1430).thu.errors).toEqual([]);
  });

  it("still grandfathers that morning slot when an unrelated LATER slot is added alongside it", () => {
    const edited = week({ thu: day(row("09:00", "10:00"), row("15:00", "16:00")) });
    expect(validateWeekTiming(edited, saved, THURSDAY_1430).thu.errors).toEqual([]);
  });

  it("rejects EDITING an existing morning slot, even though the original was grandfathered", () => {
    const edited = week({ thu: day(row("08:00", "10:00")) }); // start moved earlier
    expect(validateWeekTiming(edited, saved, THURSDAY_1430).thu.errors).toHaveLength(1);
  });

  it("rejects a slot that ends exactly now (nothing usable is left of it)", () => {
    const edited = week({ thu: day(row("09:00", "10:00"), row("13:00", "14:30")) });
    expect(validateWeekTiming(edited, saved, THURSDAY_1430).thu.errors).toHaveLength(1);
  });
});

describe("future days are unrestricted", () => {
  it("accepts any time on a future day, including early-morning times", () => {
    const edited = week({ fri: day(row("00:15", "23:45")), sat: day(row("06:00", "07:00")) });
    const timing = validateWeekTiming(edited, emptyWeek(), THURSDAY_1430);
    expect(timing.fri.errors).toEqual([]);
    expect(timing.sat.errors).toEqual([]);
  });
});

describe("merging with the existing shape validation", () => {
  it("keeps both kinds of error and drives weekHasErrors", () => {
    const edited = week({
      thu: day(row("11:00", "12:00")),      // past time today
      fri: day(row("17:00", "09:00")),      // end before start — shape error
    });
    const merged = mergeValidation(validateWeek(edited), validateWeekTiming(edited, emptyWeek(), THURSDAY_1430));
    expect(merged.thu.errors.map((e) => e.message)).toContain(PAST_TIME_MESSAGE);
    expect(merged.fri.errors.map((e) => e.message)).toContain("End time must be after start time.");
    expect(weekHasErrors(merged)).toBe(true);
  });

  it("a clean future-only edit has no errors at all", () => {
    const edited = week({ fri: day(row("09:00", "17:00")) });
    const merged = mergeValidation(validateWeek(edited), validateWeekTiming(edited, emptyWeek(), THURSDAY_1430));
    expect(weekHasErrors(merged)).toBe(false);
  });
});
