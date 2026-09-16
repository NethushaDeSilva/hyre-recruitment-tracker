// WS8 §8.2 — declared availability, never inferred. A person is available
// only where they said so; silence (never declared, or a lapsed declaration)
// is `unknown`, and `unknown` is never treated as `available`.
//
// A record's state is ALWAYS computed at read time, never stored — there are
// no background jobs anywhere in this feature (§16), so a lapsed declaration
// can never linger as stale truth because a cron job failed to run. It just
// can't have lingered in the first place.
import { wallTimeToUTC, utcToWallTime, browserTimeZone } from "@/lib/wallClock";

export const AVAILABILITY_VALIDITY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days — CLAUDE.md WS8 §8.3

export function availabilityState(record, now = Date.now()) {
  if (!record || !record.declaredAt) return "unknown";
  if (now > record.validUntil) return "unknown"; // lapsed, not available — NEVER reverts to available
  if (record.onLeave) return "unavailable";
  return "available";
}

const pad = (n) => String(n).padStart(2, "0");
const dateStrOf = ({ year, month, day }) => `${year}-${pad(month)}-${pad(day)}`;
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return h * 60 + (m || 0);
};
function nextCalendarDay({ year, month, day, dayOfWeek }) {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), dayOfWeek: (dayOfWeek + 1) % 7 };
}
const afterOrEqual = (a, b) => a.year !== b.year ? a.year > b.year : a.month !== b.month ? a.month > b.month : a.day >= b.day;

// Expand a person's RECURRING weekly windows into concrete [startMs, endMs)
// instants that fall inside [fromMs, toMs) — walking calendar dates in the
// record's OWN declared time zone (a "day" is a wall-clock concept; walking
// in UTC days would drift a date by one near a zone's midnight). Exceptioned
// dates are dropped entirely, not just left unmatched. Bounded to ~13 months
// of walking so a bad range can never spin.
export function materializeSlots(record, fromMs, toMs) {
  if (!record || availabilityState(record) !== "available") return [];
  const tz = record.timeZone || browserTimeZone();
  const endDay = utcToWallTime(toMs, tz);
  let cursor = utcToWallTime(fromMs, tz);
  const out = [];
  for (let guard = 0; guard < 400 && !afterOrEqual(cursor, endDay); guard++) {
    const dateStr = dateStrOf(cursor);
    const exceptioned = (record.exceptions || []).some((e) => e.date === dateStr);
    if (!exceptioned) {
      for (const s of record.slots || []) {
        if (s.dayOfWeek !== cursor.dayOfWeek) continue;
        const [sh, sm] = String(s.startTime).split(":").map(Number);
        const [eh, em] = String(s.endTime).split(":").map(Number);
        const startMs = wallTimeToUTC({ ...cursor, hour: sh, minute: sm });
        const endMs = wallTimeToUTC({ ...cursor, hour: eh, minute: em });
        if (endMs > fromMs && startMs < toMs) out.push({ startMs, endMs });
      }
    }
    cursor = nextCalendarDay(cursor);
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

// True if the instant `targetMs` falls inside one of the person's declared
// windows and isn't cancelled by a same-day exception. Used by the
// assignment ranking (Part C) to check "is this person free for this slot" —
// deliberately re-derives from `slots`/`exceptions` rather than calling
// materializeSlots for a single point, so it stays O(1) in the number of
// declared windows regardless of how far `targetMs` is from today.
export function slotIsDeclaredFree(record, targetMs) {
  if (!record || availabilityState(record) !== "available") return false;
  const tz = record.timeZone || browserTimeZone();
  const wall = utcToWallTime(targetMs, tz);
  if ((record.exceptions || []).some((e) => e.date === dateStrOf(wall))) return false;
  const minutesOfDay = wall.hour * 60 + wall.minute;
  return (record.slots || []).some(
    (s) => s.dayOfWeek === wall.dayOfWeek && minutesOfDay >= toMinutes(s.startTime) && minutesOfDay < toMinutes(s.endTime)
  );
}

// --- DeclaredAvailabilityProvider -------------------------------------------
// The one interface every consumer (calendar view, assignment ranking) goes
// through to ask "what does this person's schedule look like". A real
// calendar source (GoogleCalendarProvider — CLAUDE.md WS8 §8.8, deferred, not
// built) can replace this later by implementing the same `getAvailability`
// shape; nothing that calls it would change. Firestore access is injected
// (fetchAvailabilityDocs / fetchCommitments) so this module itself has no
// Firestore dependency and can be unit-tested in isolation.
//
//   getAvailability(staffIds, { fromMs, toMs }) => Promise<{
//     [staffId]: {
//       state: 'available' | 'unavailable' | 'unknown',
//       timeZone: string | null,
//       declaredAt: number, validUntil: number,
//       freeSlots: [{ startMs, endMs }],          // materialized recurring windows
//       exceptions: [{ date, type, reason }],      // whole-day leave/blocked, for display
//       commitments: [{ startMs, endMs, source }], // booked interviews + other blocks
//     }
//   }>
export function createDeclaredAvailabilityProvider({ fetchAvailabilityDocs, fetchCommitments }) {
  return {
    async getAvailability(staffIds, { fromMs, toMs }) {
      if (!staffIds || !staffIds.length) return {};
      const [docs, commitmentsByStaff] = await Promise.all([
        fetchAvailabilityDocs(staffIds),
        fetchCommitments(staffIds, { fromMs, toMs }),
      ]);
      const out = {};
      for (const id of staffIds) {
        const record = docs[id] || null;
        out[id] = {
          state: availabilityState(record),
          timeZone: record?.timeZone || null,
          declaredAt: record?.declaredAt || 0,
          validUntil: record?.validUntil || 0,
          freeSlots: materializeSlots(record, fromMs, toMs),
          exceptions: record?.exceptions || [],
          commitments: (commitmentsByStaff[id] || []).filter((c) => c.endMs > fromMs && c.startMs < toMs),
        };
      }
      return out;
    },
  };
}
