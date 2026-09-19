// A person's own recurring weekly availability TEMPLATE — "what does my week
// normally look like" (enabled/disabled per weekday, any number of recurring
// available AND blocked ranges per day). Deliberately separate in shape and
// storage from src/lib/availability.js's declared-slots-with-14-day-expiry
// model (WS8 Part C's booking/ranking feature — see the collection-split note
// in src/data/store.js for why). Pure, stateless helpers only; no Firestore
// here so this stays trivially unit-testable.

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DAY_LABELS = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};
// Only Saturday and Sunday ever get the "Remove this day" affordance (Part A
// spec) — a weekday expresses "not working" the ordinary way, zero rows.
export const WEEKEND_KEYS = ["sat", "sun"];

export const emptyDay = () => ({ enabled: true, available: [], blocked: [] });
export const emptyWeek = () => Object.fromEntries(DAY_KEYS.map((k) => [k, emptyDay()]));
export const emptyAvailableRow = () => ({ start: "09:00", end: "17:00" });
export const emptyBlockedRow = () => ({ start: "12:00", end: "13:00" });

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const rangesOverlap = (a, b) => toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);

export const isQuarterHour = (hhmm) => Number.isFinite(toMinutes(hhmm)) && toMinutes(hhmm) % 15 === 0;

/**
 * Validate one day's rows.
 * @returns {{ errors: Array<{list,index,message}>, warnings: Array<{list,index,message}> }}
 * Errors block save (bad time, end<=start, overlap within the same list).
 * Warnings never block save — a blocked range with zero overlap against
 * every available range on that day (spec: "entirely outside").
 */
export function validateDay(day) {
  const errors = [];
  const warnings = [];
  for (const list of ["available", "blocked"]) {
    const rows = day?.[list] || [];
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
        errors.push({ list, index: i, message: `Overlaps another ${list} range on this day.` });
      }
    });
  }
  (day?.blocked || []).forEach((b, i) => {
    if (errors.some((e) => e.list === "blocked" && e.index === i)) return; // already invalid — skip the warning
    const overlapsAnyAvailable = (day?.available || []).some((a) => rangesOverlap(a, b));
    if (!overlapsAnyAvailable) {
      warnings.push({ list: "blocked", index: i, message: "This blocked time is outside your available hours" });
    }
  });
  return { errors, warnings };
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
      blocked: Array.isArray(d?.blocked) ? d.blocked.filter(isRow) : [],
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

const toHHMM = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * `range` minus every overlapping interval in `blockedRanges` — standard
 * interval difference. Returns 0+ non-overlapping net intervals, sorted.
 */
export function subtractBlockedFromRange(range, blockedRanges) {
  let intervals = [{ start: toMinutes(range.start), end: toMinutes(range.end) }];
  for (const b of blockedRanges || []) {
    const bStart = toMinutes(b.start);
    const bEnd = toMinutes(b.end);
    const next = [];
    for (const iv of intervals) {
      if (bEnd <= iv.start || bStart >= iv.end) { next.push(iv); continue; } // no overlap
      if (bStart <= iv.start && bEnd >= iv.end) continue; // fully covers — drop
      if (bStart > iv.start && bEnd < iv.end) { // fully inside — splits into two
        next.push({ start: iv.start, end: bStart }, { start: bEnd, end: iv.end });
        continue;
      }
      if (bStart <= iv.start) { next.push({ start: bEnd, end: iv.end }); continue; } // overlaps the start
      next.push({ start: iv.start, end: bStart }); // overlaps the end
    }
    intervals = next;
  }
  return intervals.filter((iv) => iv.end > iv.start).map((iv) => ({ start: toHHMM(iv.start), end: toHHMM(iv.end) }));
}

// The old model's dayOfWeek is numeric, Sunday-first (src/pages/Availability.jsx's
// former DAYS array / src/lib/availability.js's materializeSlots) — distinct
// from this file's own mon..sun DAY_KEYS, which is Part A's tab order.
const LEGACY_DAY_OF_WEEK = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

/** The weekly template's net free time, as the old model's flat `slots` array. */
export function toLegacyAvailabilitySlots(days) {
  const slots = [];
  for (const key of DAY_KEYS) {
    const day = days?.[key];
    if (!day || day.enabled === false) continue; // contributes nothing
    for (const range of day.available || []) {
      for (const net of subtractBlockedFromRange(range, day.blocked)) {
        slots.push({ dayOfWeek: LEGACY_DAY_OF_WEEK[key], startTime: net.start, endTime: net.end });
      }
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
