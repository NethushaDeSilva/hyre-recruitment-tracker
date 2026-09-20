import { describe, expect, it } from "vitest";
import { bookingConflict, bookingDescription, parseStageSlot, selectedFirst } from "./interviewSchedule";
import { rankEligibleInterviewers } from "./interviewAssignment";

const at = (time, day = "2026-09-19") => new Date(`${day}T${time}:00`).getTime();
const existing = { id: "one", interviewerId: "dilani", positionId: "BD-01", positionTitle: "Backend Developer", stageId: "final", stageLabel: "Final Interview", scheduledAt: at("10:00"), durationMs: 7200000, status: "confirmed" };
const proposed = (start, end, date) => ({ interviewerId: "dilani", positionId: "RM-02", ...parseStageSlot({ date: date || "2026-09-19", start, end }) });

describe("cross-position booking conflicts", () => {
  it.each([["09:00", "11:00"], ["10:00", "11:00"], ["10:30", "11:30"], ["11:00", "13:00"], ["10:00", "12:00"]])("rejects %s to %s", (start, end) => {
    expect(bookingConflict([existing], proposed(start, end))).toBe(existing);
  });
  it.each([["08:00", "10:00"], ["12:00", "14:00"]])("allows back-to-back %s to %s", (start, end) => {
    expect(bookingConflict([existing], proposed(start, end))).toBeUndefined();
  });
  it("allows another date, another person, completed bookings and resaving the same record", () => {
    expect(bookingConflict([existing], proposed("10:00", "12:00", "2026-09-18"))).toBeUndefined();
    expect(bookingConflict([existing], { ...proposed("10:00", "12:00"), interviewerId: "amara" })).toBeUndefined();
    expect(bookingConflict([{ ...existing, status: "completed" }], proposed("10:00", "12:00"))).toBeUndefined();
    expect(bookingConflict([existing], { ...existing })).toBeUndefined();
  });
  it("pending requests occupy time and explanations name the other position and stage", () => {
    expect(bookingConflict([{ ...existing, status: "pending_confirmation" }], proposed("10:00", "12:00"))).toBeTruthy();
    expect(bookingDescription(existing)).toContain("Backend Developer · Final Interview");
  });
  it("automatic ranking also excludes a real overlap", () => {
    const result = rankEligibleInterviewers({ interviewers: [{ uid: "dilani", name: "Dilani" }], targetMs: at("09:00"), durationMs: 7200000, bookings: [existing] });
    expect(result.ranked).toEqual([]);
    expect(result.excluded[0].reason).toContain("Backend Developer");
  });
});

it("supports optional slots and rejects incomplete or reversed windows", () => {
  expect(parseStageSlot({})).toBeNull();
  expect(() => parseStageSlot({ date: "2026-09-19" })).toThrow();
  expect(() => parseStageSlot({ date: "2026-09-19", start: "12:00", end: "10:00" })).toThrow();
});

it("selects first with stable alphabetical ties, including after deselection", () => {
  const people = ["Amara", "Dilani", "Chamara"].map((name) => ({ uid: name, name }));
  expect(selectedFirst(people, [people[2]]).map((p) => p.name)).toEqual(["Chamara", "Amara", "Dilani"]);
  expect(selectedFirst(people, [people[2], people[1]]).map((p) => p.name)).toEqual(["Chamara", "Dilani", "Amara"]);
  expect(selectedFirst(people, []).map((p) => p.name)).toEqual(["Amara", "Chamara", "Dilani"]);
});
