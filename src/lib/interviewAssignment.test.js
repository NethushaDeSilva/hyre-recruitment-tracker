import { it, expect } from "vitest";
import { rankEligibleInterviewers } from "./interviewAssignment.js";
import { wallTimeToUTC } from "./wallClock.js";
import { AVAILABILITY_VALIDITY_MS } from "./availability.js";

const TZ = "Asia/Colombo";
const record = (overrides = {}) => ({
  timeZone: TZ,
  slots: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }], // Monday
  exceptions: [],
  declaredAt: Date.now(),
  validUntil: Date.now() + AVAILABILITY_VALIDITY_MS,
  onLeave: false,
  ...overrides,
});
// §6 — specialisation/seniority levels removed system-wide; ranking is
// availability + booking load only, so a person is just {uid, name, role}.
const person = (uid, name) => ({ uid, name, role: "Interviewer" });

// A Monday within the record's declared window, and a Monday outside it,
// found by search rather than assumed — self-consistent regardless of the
// real calendar date this test runs on.
function mondayAt(hour) {
  // walk forward from a known date until we land on a Monday, using UTC-wall math via wallTimeToUTC/utcToWallTime indirectly
  for (let day = 1; day <= 14; day++) {
    const ms = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day, hour, minute: 0 });
    const wall = new Date(wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day, hour: 12, minute: 0 }));
    if (wall.getUTCDay() === 1) return ms; // this day IS a Monday in Colombo terms (noon avoids edge issues)
  }
  throw new Error("no Monday found in range");
}
const target = mondayAt(10); // 10am on a real Monday, in-window
const outsideTarget = mondayAt(22); // 10pm same Monday, outside the 9-5 window

it("ranks by fewest bookings first, alphabetical as the deterministic tie-break", () => {
  const interviewers = [person("a", "Zara"), person("b", "Amir"), person("c", "Mo")];
  const availabilityRecords = { a: record(), b: record(), c: record() };
  const bookingCounts = { a: 2, b: 0, c: 0 };
  const { ranked } = rankEligibleInterviewers({ interviewers, targetMs: target, availabilityRecords, bookingCounts });
  expect(ranked.map((r) => r.name)).toEqual(["Amir", "Mo", "Zara"]); // b,c tie at 0 -> alpha; a last (busier)
  expect(ranked[0].rank).toBe(1);
  expect(ranked[0].reasons.some((r) => r.includes("Ranked first"))).toBe(true);
});

it("running the same inputs twice produces byte-identical output (determinism)", () => {
  const interviewers = [person("a", "Zara"), person("b", "Amir")];
  const availabilityRecords = { a: record(), b: record() };
  const bookingCounts = { a: 1, b: 1 };
  const args = { interviewers, targetMs: target, availabilityRecords, bookingCounts };
  expect(rankEligibleInterviewers(args)).toEqual(rankEligibleInterviewers(args));
});

it("no level filtering: every interviewer passed in is eligible on availability alone", () => {
  const interviewers = [person("a", "Zara"), person("b", "Amir")];
  const availabilityRecords = { a: record(), b: record() };
  const { ranked } = rankEligibleInterviewers({ interviewers, targetMs: target, availabilityRecords, bookingCounts: {} });
  expect(ranked.map((r) => r.uid).sort()).toEqual(["a", "b"]);
});

it("excludes an undeclared (unknown-state) interviewer — never ranked last, never ranked at all", () => {
  const interviewers = [person("a", "Zara"), person("b", "Amir")];
  const availabilityRecords = { a: null, b: record() }; // a never declared
  const { ranked, excluded } = rankEligibleInterviewers({ interviewers, targetMs: target, availabilityRecords, bookingCounts: {} });
  expect(ranked.map((r) => r.uid)).toEqual(["b"]);
  expect(excluded.find((e) => e.uid === "a").reason).toBe("Has not declared availability");
});

it("excludes a declared-but-unavailable (onLeave) interviewer", () => {
  const interviewers = [person("a", "Zara")];
  const availabilityRecords = { a: record({ onLeave: true }) };
  const { ranked, excluded } = rankEligibleInterviewers({ interviewers, targetMs: target, availabilityRecords, bookingCounts: {} });
  expect(ranked).toEqual([]);
  expect(excluded[0].reason).toBe("Declared unavailable");
});

it("excludes someone declared, but not free at THIS specific proposed time", () => {
  const interviewers = [person("a", "Zara")];
  const availabilityRecords = { a: record() }; // only Monday 9-5 declared
  const { ranked, excluded } = rankEligibleInterviewers({ interviewers, targetMs: outsideTarget, availabilityRecords, bookingCounts: {} });
  expect(ranked).toEqual([]);
  expect(excluded[0].reason).toBe("Not declared free at the proposed time");
});

it("empty pool: nobody in the stage's owner-role pool at all", () => {
  const { poolReason, ranked, excluded } = rankEligibleInterviewers({ interviewers: [], targetMs: target, availabilityRecords: {}, bookingCounts: {} });
  expect(ranked).toEqual([]);
  expect(excluded).toEqual([]);
  expect(poolReason).toContain("configured");
});

it("empty pool: everyone in the pool but nobody has declared availability", () => {
  const interviewers = [person("a", "Zara"), person("b", "Amir")];
  const availabilityRecords = { a: null, b: null };
  const { poolReason } = rankEligibleInterviewers({ interviewers, targetMs: target, availabilityRecords, bookingCounts: {} });
  expect(poolReason.toLowerCase()).toContain("declared availability");
});
