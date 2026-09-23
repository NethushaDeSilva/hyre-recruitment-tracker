import { describe, expect, it } from "vitest";
import { hireNotification, interviewNotifications, notificationPath, notificationTime, reminderDue, teamNotifications } from "./notifications";

const booking = { id: "booking", positionId: "BD-02", positionTitle: "Backend Developer", stageId: "dept", stageLabel: "Department Review", interviewerId: "dilani", interviewerName: "Dilani", createdByUid: "hr", status: "confirmed", scheduledAt: new Date("2026-09-21T10:00:00Z"), durationMs: 7200000 };
it("notifies the selected person and coordinator with position, stage and full slot context", () => {
  const notes = interviewNotifications(booking);
  expect(notes.map((n) => n.toUid)).toEqual(["dilani", "hr"]);
  expect(notes[0].message).toContain("Backend Developer — Department Review");
  expect(notes[0].durationMs).toBe(7200000);
  expect(notificationTime(notes[0])).toContain("2026");
  expect(notes[0].interviewId).toBe("booking");
});
it("uses requests only for the assignee and avoids duplicates on unchanged saves", () => {
  const notes = interviewNotifications({ ...booking, status: "pending_confirmation" });
  expect(notes.map((n) => n.type)).toEqual(["interview_request", "interview_assignment"]);
  expect(interviewNotifications(booking, booking)).toEqual([]);
  expect(interviewNotifications({ ...booking, createdByUid: "dilani" })).toHaveLength(1);
});
it("notifies on confirmation, rescheduling and reassignment", () => {
  expect(interviewNotifications(booking, { ...booking, status: "pending_confirmation" })).toHaveLength(2);
  expect(interviewNotifications(booking, { ...booking, durationMs: 3600000 })).toHaveLength(2);
  expect(interviewNotifications(booking, { ...booking, interviewerId: "someone-else" })).toHaveLength(2);
});
it("alerts the coordinator if no interviewer is available", () => {
  const notes = interviewNotifications({ ...booking, status: "needs_attention", interviewerId: "" });
  expect(notes).toHaveLength(1);
  expect(notes[0].toUid).toBe("hr");
  expect(notes[0].title).toBe("Interview needs attention");
});
it("keeps stage assignments distinct and avoids a duplicate untimed notice for a booked person", () => {
  const position = { id: "BD-02", title: "Backend Developer", stageAssignees: { dept: [{ uid: "dilani" }] } };
  const teams = { dept: [{ uid: "dilani" }, { uid: "amara" }], interview: [{ uid: "dilani" }] };
  const labels = { dept: { label: "Department Review" }, interview: { label: "Initial Interview" } };
  const notes = teamNotifications(position, teams, labels, [{ stageId: "dept", interviewerId: "amara" }]);
  expect(notes).toHaveLength(1);
  expect(notes[0].message).toContain("Initial Interview");
  expect(notificationTime(notes[0])).toBe("Time not scheduled yet");
});
it("hire notices preserve job/company text without depending on a live position", () => {
  const note = hireNotification({ uid: "candidate", employeeId: "EMP-1", title: "Regional Manager", company: "Hyre" });
  expect(note.message).toContain("successfully hired as Regional Manager at Hyre");
  expect(note.positionId).toBeUndefined();
  expect(notificationPath(note, "Candidate")).toBe("/profile");
});
describe("availability reminders", () => {
  const now = new Date("2026-09-20T12:00:00").getTime();
  it("reminds missing or expired declarations only once per day", () => {
    expect(reminderDue(null, "", now)).toBe("2026-09-20");
    expect(reminderDue(null, "2026-09-20", now)).toBeNull();
    expect(reminderDue({ declaredAt: now, validUntil: now - 1 }, "", now)).toBe("2026-09-20");
  });
  it("stops after a weekly update, including an explicitly unavailable week", () => {
    expect(reminderDue({ declaredAt: now - 86400000, validUntil: now + 86400000, slots: [] }, "", now)).toBeNull();
  });
  it("resumes when the declaration is a week old", () => {
    expect(reminderDue({ declaredAt: now - 7 * 86400000, validUntil: now + 86400000 }, "", now)).toBe("2026-09-20");
  });
});
it("routes reminders and applicant notifications to accessible destinations", () => {
  expect(notificationPath({ type: "availability_reminder" }, "HR")).toBe("/availability");
  expect(notificationPath({ type: "rejection", positionId: "closed" }, "Candidate")).toBe("/applications");
  expect(notificationPath({ type: "stage_assignment", positionId: "RM-02" }, "Management")).toBe("/positions/RM-02");
});
