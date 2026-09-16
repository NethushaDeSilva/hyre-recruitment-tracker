import { it, expect } from "vitest";
import { weekStart, weekDays, hourRange, eventPosition, addWeeks, exceptionRange } from "./scheduleGrid.js";

it("weekStart returns a Sunday midnight", () => {
  const ref = new Date(2026, 2, 12, 14, 30).getTime(); // some Thursday afternoon
  const start = weekStart(ref);
  const d = new Date(start);
  expect(d.getDay()).toBe(0);
  expect(d.getHours()).toBe(0);
  expect(d.getMinutes()).toBe(0);
  expect(start).toBeLessThanOrEqual(ref);
});

it("weekDays returns 7 consecutive local days starting Sunday, with today flagged", () => {
  const now = new Date(2026, 2, 12, 9, 0).getTime();
  const days = weekDays(now, now);
  expect(days.length).toBe(7);
  expect(days[0].label).toBe("Sun");
  expect(days[6].label).toBe("Sat");
  for (let i = 1; i < 7; i++) expect(days[i].dateMs - days[i - 1].dateMs).toBe(86400000);
  const todayCount = days.filter((d) => d.isToday).length;
  expect(todayCount).toBe(1);
});

it("hourRange: working hours by default, full day on request", () => {
  expect(hourRange(false)).toEqual({ startHour: 8, endHour: 18 });
  expect(hourRange(true)).toEqual({ startHour: 0, endHour: 24 });
});

it("eventPosition: an event fully inside the visible window is positioned proportionally", () => {
  const dayStart = new Date(2026, 2, 12, 0, 0).getTime();
  const startMs = new Date(2026, 2, 12, 9, 0).getTime();
  const endMs = new Date(2026, 2, 12, 10, 0).getTime();
  const pos = eventPosition({ startMs, endMs }, dayStart, 8, 18); // 10h visible window
  expect(pos.topPct).toBeCloseTo(10, 5); // 1h into a 10h window
  expect(pos.heightPct).toBeCloseTo(10, 5); // 1h / 10h
});

it("eventPosition: an event entirely outside the visible window returns null", () => {
  const dayStart = new Date(2026, 2, 12, 0, 0).getTime();
  const startMs = new Date(2026, 2, 12, 19, 0).getTime();
  const endMs = new Date(2026, 2, 12, 20, 0).getTime();
  expect(eventPosition({ startMs, endMs }, dayStart, 8, 18)).toBeNull();
});

it("eventPosition: an event crossing the window edge is clamped, not dropped", () => {
  const dayStart = new Date(2026, 2, 12, 0, 0).getTime();
  const startMs = new Date(2026, 2, 12, 7, 0).getTime(); // starts before 8am
  const endMs = new Date(2026, 2, 12, 9, 0).getTime(); // ends inside the window
  const pos = eventPosition({ startMs, endMs }, dayStart, 8, 18);
  expect(pos.topPct).toBe(0); // clamped, not negative
  expect(pos.heightPct).toBeCloseTo(10, 5); // 8am-9am / 10h window
});

it("exceptionRange spans exactly one full local day in the declared zone, month rollover included", () => {
  const r = exceptionRange({ date: "2026-03-31", type: "leave" }, "Asia/Colombo");
  expect(r.endMs - r.startMs).toBe(24 * 3600000);
  // 00:00 Colombo (+5:30) on 2026-03-31 = 2026-03-30 18:30 UTC
  const d = new Date(r.startMs);
  expect(d.getUTCDate()).toBe(30);
  expect(d.getUTCHours()).toBe(18);
  expect(d.getUTCMinutes()).toBe(30);
});

it("addWeeks shifts by exactly N*7 days", () => {
  const start = weekStart(Date.now());
  expect(addWeeks(start, 1) - start).toBe(7 * 86400000);
  expect(addWeeks(start, -2) - start).toBe(-14 * 86400000);
});
