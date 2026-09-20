export const BOOKED_STATUSES = ["pending_confirmation", "confirmed"];
export const timeMs = (value) => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : Number(value);
export const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && end > otherStart;

export function bookingConflict(bookings, { interviewerId, scheduledAt, durationMs, id }) {
  const start = timeMs(scheduledAt);
  return bookings.find((b) => b.id !== id && b.interviewerId === interviewerId && BOOKED_STATUSES.includes(b.status)
    && overlaps(start, start + durationMs, timeMs(b.scheduledAt), timeMs(b.scheduledAt) + (b.durationMs || 3600000)));
}

export function bookingDescription(booking) {
  const start = timeMs(booking.scheduledAt);
  const format = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return `Busy ${format(start)}–${format(start + (booking.durationMs || 3600000))} — ${booking.positionTitle || booking.positionId} · ${booking.stageLabel || booking.stageId}`;
}

export function parseStageSlot({ date = "", start = "", end = "" } = {}) {
  if (!date && !start && !end) return null;
  const scheduledAt = new Date(`${date}T${start}`).getTime();
  const endMs = new Date(`${date}T${end}`).getTime();
  if (!date || !start || !end || !Number.isFinite(scheduledAt) || !Number.isFinite(endMs) || endMs <= scheduledAt) {
    throw new Error("Choose a date and an end time later than the start time.");
  }
  return { scheduledAt, durationMs: endMs - scheduledAt };
}

export function selectedFirst(people, selected) {
  const ids = new Set(selected.map((p) => p.uid));
  return [...people].sort((a, b) => Number(ids.has(b.uid)) - Number(ids.has(a.uid)) || a.name.localeCompare(b.name));
}
