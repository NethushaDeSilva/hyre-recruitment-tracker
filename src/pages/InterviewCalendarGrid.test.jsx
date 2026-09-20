import React from "react";
import { create } from "react-test-renderer";
import { expect, it } from "vitest";
import InterviewCalendarGrid from "./InterviewCalendarGrid";
import { Tooltip } from "@/components/ui/Tooltip";
import { weekStart } from "@/lib/scheduleGrid";

it("shows the person, stage, position and occupied time even without a declaration", () => {
  const startMs = new Date("2026-09-19T10:00").getTime();
  const tree = create(<InterviewCalendarGrid weekStartMs={weekStart(startMs)} startHour={8} endHour={18}
    people={[{ uid: "dilani", name: "Dilani Perera", avatarColor: "#2563EB" }]}
    availability={{ dilani: { state: "unknown", commitments: [{ startMs, endMs: startMs + 7200000, source: "interview", stageLabel: "Final Interview", positionTitle: "Backend Developer", status: "confirmed" }] } }} />);
  const booking = tree.root.findByType(Tooltip);
  expect(booking.props.label).toContain("Dilani Perera — Final Interview - Backend Developer");
  expect(booking.props.label).toContain("10AM–12PM");
  expect(booking.props.label).toContain("Booked");
  const visibleText = JSON.stringify(tree.toJSON());
  expect(visibleText).toContain("Final Interview");
  expect(visibleText).toContain("Backend Developer");
  tree.unmount();
});
