// Pure time/layout math for the interview-availability calendar (WS8 Part B).
// Rendering is always in the VIEWER's own local time — like any calendar app,
// a person reads a shared calendar in their own wall-clock. This is a
// different concern from wallClock.js, which anchors a DECLARED window to the
// zone the declarer was in when they saved it (src/lib/wallClock.js,
// src/lib/availability.js) — that correctness already lives entirely at the
// data layer (materializeSlots returns absolute ms), so this file stays
// simple: plain local Date arithmetic, no IANA zone handling needed here.

import { wallTimeToUTC } from "@/lib/wallClock";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localMidnight(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The Sunday-start midnight (local) of the week containing `refMs`. */
export function weekStart(refMs) {
  const mid = localMidnight(refMs);
  return mid - new Date(mid).getDay() * DAY_MS;
}

/** The 7 days (Sun..Sat, local) of the week containing `refMs`. */
export function weekDays(refMs, now = Date.now()) {
  const start = weekStart(refMs);
  const todayMid = localMidnight(now);
  return Array.from({ length: 7 }, (_, i) => {
    const dateMs = start + i * DAY_MS;
    return { dateMs, label: DAY_LABELS[i], dayOfMonth: new Date(dateMs).getDate(), isToday: dateMs === todayMid };
  });
}

/** Working hours (8am-6pm) by default, or the full day — an [startHour, endHour) pair. */
export function hourRange(showFullDay) {
  return showFullDay ? { startHour: 0, endHour: 24 } : { startHour: 8, endHour: 18 };
}

/**
 * Vertical position of an event within one day-column, as percentages of the
 * visible hour range. Returns null if the event doesn't overlap the visible
 * window at all; otherwise clamps to [0, 100] so a commitment that starts
 * before, or ends after, the visible hours still shows a cropped bar rather
 * than silently disappearing or overflowing the column.
 */
export function eventPosition({ startMs, endMs }, dayStartMs, startHour, endHour) {
  const rangeStart = dayStartMs + startHour * HOUR_MS;
  const rangeEnd = dayStartMs + endHour * HOUR_MS;
  if (endMs <= rangeStart || startMs >= rangeEnd) return null;
  const rangeMs = rangeEnd - rangeStart;
  const topPct = Math.max(0, ((startMs - rangeStart) / rangeMs) * 100);
  const bottomPct = Math.min(100, ((endMs - rangeStart) / rangeMs) * 100);
  return { topPct, heightPct: Math.max(bottomPct - topPct, 0.5) };
}

export const addWeeks = (ms, n) => ms + n * 7 * DAY_MS;

/**
 * A one-off exception (`{date: "YYYY-MM-DD", type, reason}`) as an absolute
 * [startMs, endMs) full-day span, in the zone the person declared it in —
 * NOT the viewer's zone. A leave day is "my Tuesday," not whichever UTC day
 * happens to contain 09:00 in some other browser's clock.
 */
export function exceptionRange(exception, timeZone) {
  const [year, month, day] = exception.date.split("-").map(Number);
  const startMs = wallTimeToUTC({ timeZone, year, month, day, hour: 0, minute: 0 });
  const endMs = wallTimeToUTC({ timeZone, year, month, day: day + 1, hour: 0, minute: 0 });
  return { startMs, endMs };
}
