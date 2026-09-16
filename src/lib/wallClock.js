// Wall-clock <-> absolute-instant conversion for a specific IANA time zone,
// with no date library (none is in this project's dependency tree — see
// CLAUDE.md WS8 §8.3). A declared availability window is a WALL-CLOCK
// intention ("Tuesdays 2-4pm my time"), tied to the zone it was declared in —
// never the viewer's own zone, and never reinterpreted just because the
// browser reading it later sits somewhere else. A booked commitment
// (interviews.scheduledAt) is the opposite: a genuine absolute instant,
// stored and compared as epoch ms with no zone attached at all. These two
// helpers are the only bridge between the two kinds of value.

function zonedParts(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

// Epoch ms for a wall-clock moment (year/month/day/hour/minute) AS OBSERVED
// in `timeZone`. Standard round-trip technique: an initial UTC guess, then a
// single correction for that zone's offset AT the guessed instant. One pass
// is enough because the true answer can only differ from the guess by that
// zone's own UTC offset, which the correction fully absorbs — the guess and
// the true instant are always within the same DST regime, so the offset read
// from the guess is the right one to correct with.
export function wallTimeToUTC({ timeZone, year, month, day, hour = 0, minute = 0 }) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const seenAsUTC = zonedParts(guess, timeZone);
  const guessReadBackAsUTCms = Date.UTC(seenAsUTC.year, seenAsUTC.month - 1, seenAsUTC.day, seenAsUTC.hour, seenAsUTC.minute);
  return guess - (guessReadBackAsUTCms - guess);
}

// The wall-clock date/time that an absolute instant reads as inside `timeZone`.
export function utcToWallTime(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const dayOfWeek = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { ...p, dayOfWeek };
}

// The zone this browser is currently set to — captured at declare-time and
// stored on the availability record, never assumed later. Never hardcode an
// IANA literal (e.g. "Asia/Colombo") in place of this — CLAUDE.md WS8 §8.3.
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
