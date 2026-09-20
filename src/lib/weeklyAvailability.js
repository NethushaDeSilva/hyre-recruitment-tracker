// A person's own recurring weekly availability TEMPLATE — "what does my week
// normally look like" (enabled/disabled per weekday, any number of recurring
// available ranges per day). There is no separate "blocked" list — anything
// not listed as available is already busy by construction: nothing outside
// `available` is ever written to the derived `slots`, and every reader of
// `slots` treats absence as unavailable (src/lib/availability.js). Deliberately
// separate in shape and storage from src/lib/availability.js's declared-slots-
// with-14-day-expiry model (WS8 Part C's booking/ranking feature — see the
// collection-split note in src/data/store.js for why). Pure, stateless
// helpers only; no Firestore here so this stays trivially unit-testable.
import { utcToWallTime, wallTimeToUTC, browserTimeZone } from "@/lib/wallClock";

// Sunday-first — the calendar week starts on Sunday and ends on Saturday.
export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
export const DAY_LABELS = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday",
  thu: "Thursday", fri: "Friday", sat: "Saturday",
};
// Only Saturday and Sunday ever get the "Remove this day" affordance (Part A
// spec) — a weekday expresses "not working" the ordinary way, zero rows.
export const WEEKEND_KEYS = ["sat", "sun"];

// --- Real-time upcoming week window (the date banner + per-tab dates on the
// Availability page) --------------------------------------------------------
// The weekly template's day tabs (Sunday..Saturday) are a timeless recurring
// PATTERN — this section answers "what are the actual calendar dates for
// that pattern, right now," so nobody has to work it out by hand. Always
// starts TOMORROW (today's remaining hours are never schedulable — there is
// no such thing as declaring availability in the past) and always spans
// exactly 7 days, so it rolls forward by one day every day, never showing a
// date that has already passed. Purely presentational: never stored, never
// changes what gets saved. `now`/`timeZone` are injectable for testing;
// real callers pass real values (the caller's own browser clock/zone — this
// is "what does my week look like from here," not tied to any one IANA zone).
const WEEKDAY_TO_DAY_KEY = { 0: "sun", 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat" };
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The next 7 calendar dates starting TOMORROW in `timeZone` — never today, never the past. */
export function upcomingWeekDates(now = Date.now(), timeZone = browserTimeZone()) {
  const today = utcToWallTime(now, timeZone);
  const start = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dayOfWeek: d.getUTCDay() });
  }
  return out;
}

/** DAY_KEYS ("mon".."sun") mapped to that weekday's actual date within the upcoming 7-day window. */
export function upcomingWeekByDayKey(now = Date.now(), timeZone = browserTimeZone()) {
  const out = {};
  for (const d of upcomingWeekDates(now, timeZone)) out[WEEKDAY_TO_DAY_KEY[d.dayOfWeek]] = d;
  return out;
}

/**
 * THIS calendar week — Sunday through Saturday, in Sri Lanka time
 * (Asia/Colombo, UTC+05:30) by default — for the Availability page's date
 * banner and per-tab dates. Unlike upcomingWeekDates() above (which is a
 * future-only "tomorrow onward" booking window, still used by the stage-
 * assignment interview picker), this shows the ACTUAL current week: it can
 * include days already past if today isn't Sunday. `now`/`timeZone` are
 * injectable for testing; real callers get the real current week.
 */
export function currentWeekDates(now = Date.now(), timeZone = "Asia/Colombo") {
  const today = utcToWallTime(now, timeZone);
  const start = new Date(Date.UTC(today.year, today.month - 1, today.day - today.dayOfWeek));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i));
    out.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dayOfWeek: d.getUTCDay() });
  }
  return out;
}

/** DAY_KEYS ("sun".."sat") mapped to that weekday's actual date within THIS current week. */
export function currentWeekByDayKey(now = Date.now(), timeZone = "Asia/Colombo") {
  const out = {};
  for (const d of currentWeekDates(now, timeZone)) out[WEEKDAY_TO_DAY_KEY[d.dayOfWeek]] = d;
  return out;
}

export const formatShortDate = ({ day, month }) => `${day} ${MONTH_SHORT[month - 1]}`;
export const formatFullDate = ({ day, month, year, dayOfWeek }) => `${WEEKDAY_SHORT[dayOfWeek]}, ${day} ${MONTH_SHORT[month - 1]} ${year}`;
/** "Sun, 20 Sep 2026 – Sat, 26 Sep 2026" — the banner text for the whole window. */
export const weekRangeLabel = (dates) => `${formatFullDate(dates[0])} – ${formatFullDate(dates[dates.length - 1])}`;

/**
 * The same "tomorrow through +7 days" window as epoch-ms bounds, for feeding
 * src/lib/availability.js's `materializeSlots(record, fromMs, toMs)` — used
 * by the stage-assignment picker to show a real person's actual upcoming
 * free windows, not just the weekday pattern.
 */
export function upcomingWeekBoundsMs(now = Date.now(), timeZone = browserTimeZone()) {
  const dates = upcomingWeekDates(now, timeZone);
  const first = dates[0], last = dates[dates.length - 1];
  const fromMs = wallTimeToUTC({ timeZone, year: first.year, month: first.month, day: first.day, hour: 0, minute: 0 });
  const toMs = wallTimeToUTC({ timeZone, year: last.year, month: last.month, day: last.day, hour: 23, minute: 59 }) + 60_000;
  return { fromMs, toMs };
}

export const emptyDay = () => ({ enabled: true, available: [] });
export const emptyWeek = () => Object.fromEntries(DAY_KEYS.map((k) => [k, emptyDay()]));
export const emptyAvailableRow = () => ({ start: "09:00", end: "17:00" });

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const rangesOverlap = (a, b) => toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

export const isQuarterHour = (hhmm) => Number.isFinite(toMinutes(hhmm)) && toMinutes(hhmm) % 15 === 0;

/**
 * Validate one day's available-time rows.
 * @returns {{ errors: Array<{list,index,message}>, warnings: Array<{list,index,message}> }}
 * Errors block save (bad time, end<=start, overlap with another available range).
 * `warnings` stays for shape-compatibility with callers (DayPanel) — always empty now
 * that there's nothing left to warn about.
 */
export function validateDay(day) {
  const errors = [];
  const list = "available";
  const rows = day?.available || [];
  rows.forEach((row, i) => {
    if (!isQuarterHour(row.start) || !isQuarterHour(row.end)) {
      errors.push({ list, index: i, message: "Times must be on a 15-minute increment." });
      return;
    }
    if (toMinutes(row.end) <= toMinutes(row.start)) {
      errors.push({ list, index: i, message: "End time must be after start time." });
      return;
    }
    const overlapsSibling = rows.some((other, j) => j !== i && rangesOverlap(row, other));
    if (overlapsSibling) {
      errors.push({ list, index: i, message: "Overlaps another available range on this day." });
    }
  });
  return { errors, warnings: [] };
}

export function validateWeek(days) {
  return Object.fromEntries(DAY_KEYS.map((k) => [k, validateDay(days?.[k])]));
}

export const weekHasErrors = (validation) => DAY_KEYS.some((k) => validation[k].errors.length > 0);

/** Tab-chip text (Part A layout spec: "3 slots" / "None" / "Not working"). */
export function daySummaryChip(day) {
  if (!day || day.enabled === false) return "Not working";
  const n = (day.available || []).length;
  return n === 0 ? "None" : `${n} slot${n === 1 ? "" : "s"}`;
}

const isRow = (r) => r && typeof r.start === "string" && typeof r.end === "string";

/** Coerce a raw Firestore doc (or null) into a complete, well-shaped 7-day week — never trusts partial/legacy/garbage data. */
export function normalizeWeek(raw) {
  const days = raw?.days || {};
  const out = {};
  for (const key of DAY_KEYS) {
    const d = days[key];
    out[key] = {
      enabled: d?.enabled !== false,
      available: Array.isArray(d?.available) ? d.available.filter(isRow) : [],
    };
  }
  return out;
}

// --- FIX 1: legacy-shape derivation (src/data/store.js dual-write) --------
// The new weekly template is the source of truth; `availability/{uid}` (the
// old declared-slots-with-expiry model — src/lib/availability.js,
// src/lib/interviewAssignment.js's WS8 Part C ranking, InterviewCalendar.jsx/
// InterviewCalendarGrid.jsx's /schedule booking calendar, and
// StageAssignmentStep.jsx's chip) is now DERIVED from it on every save, so
// those four readers keep working without being migrated. Pure functions
// only — src/data/store.js is what actually writes it.

// The old model's dayOfWeek is numeric, Sunday-first (src/pages/Availability.jsx's
// former DAYS array / src/lib/availability.js's materializeSlots) — distinct
// from this file's own mon..sun DAY_KEYS, which is Part A's tab order.
const LEGACY_DAY_OF_WEEK = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/**
 * The weekly template's available time, as the old model's flat `slots`
 * array. There is no "blocked" list to subtract — anything not listed as
 * available never appears here, and the old model already treats absence
 * from `slots` as unavailable.
 */
export function toLegacyAvailabilitySlots(days) {
  const slots = [];
  for (const key of DAY_KEYS) {
    const day = days?.[key];
    if (!day || day.enabled === false) continue; // contributes nothing
    for (const range of day.available || []) {
      slots.push({ dayOfWeek: LEGACY_DAY_OF_WEEK[key], startTime: range.start, endTime: range.end });
    }
  }
  return slots;
}

/**
 * The full `availability/{uid}` payload derived from a weekly template —
 * everything except `declaredAt`, which the caller (store.js) sets with a
 * real `serverTimestamp()`, not something this pure module can produce.
 * @param {object} days - a normalized week (see normalizeWeek)
 * @param {{exceptions?: Array, now?: number, timeZone?: string, validityMs: number}} opts
 */
export function buildLegacyAvailabilityDoc(days, { exceptions = [], now = Date.now(), timeZone = "Asia/Colombo", validityMs } = {}) {
  return {
    timeZone,
    slots: toLegacyAvailabilitySlots(days),
    exceptions,
    validUntil: new Date(now + validityMs),
  };
}
