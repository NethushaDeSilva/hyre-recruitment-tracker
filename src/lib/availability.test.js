import { it, expect } from "vitest";
import {
  availabilityState, materializeSlots, slotIsDeclaredFree,
  createDeclaredAvailabilityProvider, AVAILABILITY_VALIDITY_MS,
} from "./availability.js";
import { wallTimeToUTC, utcToWallTime } from "./wallClock.js";

const TZ = "Asia/Colombo";
const baseRecord = (overrides = {}) => ({
  timeZone: TZ,
  slots: [{ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" }],
  exceptions: [],
  declaredAt: Date.now(),
  validUntil: Date.now() + AVAILABILITY_VALIDITY_MS,
  onLeave: false,
  ...overrides,
});

it("availabilityState: never declared is unknown, not available by default", () => {
  expect(availabilityState(null)).toBe("unknown");
  expect(availabilityState({})).toBe("unknown");
});

it("availabilityState: a lapsed declaration reverts to unknown, never back to available", () => {
  const rec = baseRecord({ declaredAt: Date.now() - 20 * 86400000, validUntil: Date.now() - 6 * 86400000 });
  expect(availabilityState(rec)).toBe("unknown");
});

it("availabilityState: onLeave overrides to unavailable", () => {
  expect(availabilityState(baseRecord({ onLeave: true }))).toBe("unavailable");
});

it("availabilityState: a fresh declaration with no leave is available", () => {
  expect(availabilityState(baseRecord())).toBe("available");
});

it("materializeSlots expands a recurring window into instants correctly offset for the declared zone", () => {
  const from = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 1, hour: 0, minute: 0 });
  const to = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 22, hour: 0, minute: 0 });
  const occurrences = materializeSlots(baseRecord(), from, to);
  expect(occurrences.length).toBeGreaterThan(0);
  for (const o of occurrences) {
    expect(o.endMs - o.startMs).toBe(8 * 3600000); // 09:00-17:00
    expect(new Date(o.startMs).getUTCHours()).toBe(3); // 09:00 Colombo (+5:30) = 03:30 UTC
    expect(new Date(o.startMs).getUTCMinutes()).toBe(30);
  }
});

it("materializeSlots excludes an exceptioned date entirely, not just leaves it unmatched", () => {
  const from = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 1, hour: 0, minute: 0 });
  const to = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 22, hour: 0, minute: 0 });
  const base = materializeSlots(baseRecord(), from, to);
  expect(base.length).toBeGreaterThan(1);
  const first = utcToWallTime(base[0].startMs, TZ);
  const dateStr = `${first.year}-${String(first.month).padStart(2, "0")}-${String(first.day).padStart(2, "0")}`;
  const withException = materializeSlots(baseRecord({ exceptions: [{ date: dateStr, type: "leave", reason: "" }] }), from, to);
  expect(withException.length).toBe(base.length - 1);
});

it("materializeSlots returns nothing for an absent, unknown, or unavailable record", () => {
  expect(materializeSlots(null, 0, Date.now())).toEqual([]);
  expect(materializeSlots(baseRecord({ onLeave: true }), 0, Date.now())).toEqual([]);
});

it("slotIsDeclaredFree matches inside a declared window and rejects just outside it", () => {
  const targetMs = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 9, hour: 10, minute: 0 });
  const dow = utcToWallTime(targetMs, TZ).dayOfWeek;
  const rec = baseRecord({ slots: [{ dayOfWeek: dow, startTime: "09:00", endTime: "17:00" }] });
  expect(slotIsDeclaredFree(rec, targetMs)).toBe(true);
  const before = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 9, hour: 8, minute: 0 });
  expect(slotIsDeclaredFree(rec, before)).toBe(false);
});

it("slotIsDeclaredFree respects a same-date exception even inside the recurring window", () => {
  const targetMs = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 9, hour: 10, minute: 0 });
  const wall = utcToWallTime(targetMs, TZ);
  const dateStr = `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
  const rec = baseRecord({
    slots: [{ dayOfWeek: wall.dayOfWeek, startTime: "09:00", endTime: "17:00" }],
    exceptions: [{ date: dateStr, type: "leave", reason: "" }],
  });
  expect(slotIsDeclaredFree(rec, targetMs)).toBe(false);
});

it("slotIsDeclaredFree is false for unknown/unavailable state regardless of matching slots", () => {
  const targetMs = Date.now();
  expect(slotIsDeclaredFree(null, targetMs)).toBe(false);
  expect(slotIsDeclaredFree(baseRecord({ onLeave: true }), targetMs)).toBe(false);
});

it("DeclaredAvailabilityProvider merges declared availability with commitments and filters commitments to range", async () => {
  const from = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 1, hour: 0, minute: 0 });
  const to = wallTimeToUTC({ timeZone: TZ, year: 2026, month: 3, day: 8, hour: 0, minute: 0 });
  const provider = createDeclaredAvailabilityProvider({
    fetchAvailabilityDocs: async (ids) => ({ [ids[0]]: baseRecord() }),
    fetchCommitments: async (ids) => ({
      [ids[0]]: [
        { startMs: from + 1000, endMs: from + 2000, source: "interview" }, // inside range
        { startMs: to + 1000, endMs: to + 2000, source: "interview" }, // outside range
      ],
    }),
  });
  const result = await provider.getAvailability(["u1"], { fromMs: from, toMs: to });
  expect(result.u1.state).toBe("available");
  expect(result.u1.commitments.length).toBe(1);
  expect(result.u1.freeSlots.length).toBeGreaterThan(0);
});

it("DeclaredAvailabilityProvider reports unknown state for staff with no declared record", async () => {
  const provider = createDeclaredAvailabilityProvider({
    fetchAvailabilityDocs: async () => ({}),
    fetchCommitments: async () => ({}),
  });
  const result = await provider.getAvailability(["u2"], { fromMs: 0, toMs: Date.now() });
  expect(result.u2.state).toBe("unknown");
  expect(result.u2.freeSlots).toEqual([]);
});
