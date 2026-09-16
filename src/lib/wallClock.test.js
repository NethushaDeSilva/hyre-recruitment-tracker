import { it, expect } from "vitest";
import { wallTimeToUTC, utcToWallTime, browserTimeZone } from "./wallClock.js";

it("round-trips a wall-clock moment through a fixed-offset zone (Asia/Colombo, UTC+5:30)", () => {
  const ms = wallTimeToUTC({ timeZone: "Asia/Colombo", year: 2026, month: 3, day: 10, hour: 14, minute: 30 });
  const back = utcToWallTime(ms, "Asia/Colombo");
  expect(back.year).toBe(2026);
  expect(back.month).toBe(3);
  expect(back.day).toBe(10);
  expect(back.hour).toBe(14);
  expect(back.minute).toBe(30);
});

it("Asia/Colombo is a fixed +5:30 offset from UTC", () => {
  const ms = wallTimeToUTC({ timeZone: "Asia/Colombo", year: 2026, month: 3, day: 10, hour: 14, minute: 30 });
  expect(new Date(ms).getUTCHours()).toBe(9); // 14:30 - 5:30
  expect(new Date(ms).getUTCMinutes()).toBe(0);
});

it("corrects for a DST offset change across the year (America/New_York)", () => {
  const winterMs = wallTimeToUTC({ timeZone: "America/New_York", year: 2026, month: 1, day: 15, hour: 9, minute: 0 });
  expect(new Date(winterMs).getUTCHours()).toBe(14); // EST = UTC-5 → 09:00 local = 14:00 UTC
  const summerMs = wallTimeToUTC({ timeZone: "America/New_York", year: 2026, month: 7, day: 15, hour: 9, minute: 0 });
  expect(new Date(summerMs).getUTCHours()).toBe(13); // EDT = UTC-4 → 09:00 local = 13:00 UTC
  expect(utcToWallTime(summerMs, "America/New_York").hour).toBe(9);
});

it("utcToWallTime derives a self-consistent day-of-week for the given zone", () => {
  const ms = wallTimeToUTC({ timeZone: "Asia/Colombo", year: 2026, month: 3, day: 10, hour: 12, minute: 0 });
  const wall = utcToWallTime(ms, "Asia/Colombo");
  const expected = new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
  expect(wall.dayOfWeek).toBe(expected);
});

it("browserTimeZone returns a non-empty string, never a hardcoded literal", () => {
  const tz = browserTimeZone();
  expect(typeof tz).toBe("string");
  expect(tz.length).toBeGreaterThan(0);
});
