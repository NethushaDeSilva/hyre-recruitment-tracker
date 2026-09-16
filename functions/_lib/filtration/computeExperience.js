// WS4/5.10 — total years of experience, computed in JS from the date ranges
// the model extracted, never estimated by the model itself. Extraction models
// fail quietly at exactly this kind of arithmetic (overlapping roles, gaps,
// "present"), so it does not run inside the prompt.
//
// Pure function: no Date.now(), no environment reads. "Present" needs to
// resolve against *some* concept of "now" — the caller supplies it as
// `referenceDate`, deliberately, rather than this module reading the clock
// itself. That keeps everything under filtration/ reproducible from its
// arguments alone, which is the whole point of the WS6.4 determinism proof.

const MONTH_NAMES = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};
const ONGOING_WORDS = new Set(["present", "current", "currently", "now", "ongoing", "date", "todate", "to date"]);

/** "2019-03" | "03/2019" | "March 2019" | "Mar 2019" | "2019" -> {year, month} (month 0-11), or null. */
export function parseMonthYear(raw) {
  const s = String(raw || "").trim().toLowerCase().replace(/[.,]/g, "");
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})$/); // 2019-03
  if (m) return normalize(+m[1], +m[2] - 1);

  m = s.match(/^(\d{1,2})\/(\d{4})$/); // 03/2019
  if (m) return normalize(+m[2], +m[1] - 1);

  m = s.match(/^([a-z]+)\s+(\d{4})$/); // March 2019 / Mar 2019
  if (m && m[1] in MONTH_NAMES) return normalize(+m[2], MONTH_NAMES[m[1]]);

  m = s.match(/^(\d{4})\s+([a-z]+)$/); // 2019 March
  if (m && m[2] in MONTH_NAMES) return normalize(+m[1], MONTH_NAMES[m[2]]);

  m = s.match(/^(\d{4})$/); // bare year — unknown month
  if (m) return { year: +m[1], month: null };

  return null;
}

function normalize(year, month) {
  if (!Number.isFinite(year) || year < 1900 || year > 2200) return null;
  if (!Number.isFinite(month) || month < 0 || month > 11) return null;
  return { year, month };
}

/** {year, month|null} -> an absolute month index. Bare-year entries assume
 * January for a start date and December for an end date — the conservative
 * choice at each end, since we don't know which month within the year. */
function toMonthIndex(parsed, boundary) {
  const month = parsed.month != null ? parsed.month : boundary === "start" ? 0 : 11;
  return parsed.year * 12 + month;
}

function resolveEndpoint(raw, referenceDate, boundary) {
  const s = String(raw || "").trim().toLowerCase();
  if (boundary === "end" && (!s || ONGOING_WORDS.has(s))) {
    return referenceDate.getUTCFullYear() * 12 + referenceDate.getUTCMonth();
  }
  const parsed = parseMonthYear(raw);
  if (!parsed) return null;
  return toMonthIndex(parsed, boundary);
}

/**
 * @param {Array<{startDate: string|null, endDate: string|null}>} experience
 * @param {Date} referenceDate - what "present" / "current" resolves to. Required,
 *   never defaulted, so this stays a pure function of its arguments.
 * @returns {number} total years, rounded to 1 decimal place. 0 if nothing usable.
 */
export function computeTotalYearsExperience(experience, referenceDate) {
  if (!(referenceDate instanceof Date) || Number.isNaN(referenceDate.getTime())) {
    throw new Error("computeTotalYearsExperience: referenceDate is required and must be a valid Date");
  }
  const entries = Array.isArray(experience) ? experience : [];

  const intervals = [];
  for (const entry of entries) {
    const start = resolveEndpoint(entry?.startDate, referenceDate, "start");
    const end = resolveEndpoint(entry?.endDate, referenceDate, "end");
    if (start == null || end == null || end < start) continue; // unparseable or nonsensical — skip, don't throw
    intervals.push([start, end]);
  }
  if (!intervals.length) return 0;

  // Merge overlapping/concurrent roles so simultaneous jobs (a full-time role
  // plus a concurrent internship or freelance gig) aren't double-counted, and
  // gaps between roles are never counted as experience.
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [intervals[0].slice()];
  for (const [start, end] of intervals.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const totalMonths = merged.reduce((sum, [start, end]) => sum + (end - start), 0);
  return Math.round((totalMonths / 12) * 10) / 10;
}
