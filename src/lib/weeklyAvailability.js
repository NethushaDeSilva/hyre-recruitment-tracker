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
