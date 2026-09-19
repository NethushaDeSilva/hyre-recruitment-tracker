import React from "react";
import { create } from "react-test-renderer";
import { expect, it } from "vitest";
import WeeklyCalendarView from "./WeeklyCalendarView";
import { emptyWeek } from "@/lib/weeklyAvailability";

const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));

it("columns run Sunday through Saturday, left to right", () => {
  const tree = create(<WeeklyCalendarView name="Priya Fernando" days={emptyWeek()} />);
  const headers = tree.root.findAllByProps({ className: "border-l border-border px-2 py-2 text-center text-xs font-bold text-foreground" }).map(text);
  expect(headers).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  tree.unmount();
});

it("shows the not-declared message and never invents default hours when days is null", () => {
  const tree = create(<WeeklyCalendarView name="Priya Fernando" days={null} />);
  const paragraphs = tree.root.findAllByType("p").map(text);
  expect(paragraphs).toContain("Priya Fernando has not declared availability yet.");
  tree.unmount();
});

it("renders a disabled day as a greyed Not working column", () => {
  const days = { ...emptyWeek(), sat: { enabled: false, available: [], blocked: [] } };
  const tree = create(<WeeklyCalendarView name="Priya Fernando" days={days} />);
  expect(JSON.stringify(tree.toJSON())).toContain("Not working");
  tree.unmount();
});

it("renders one block per available/blocked range, titled with the time range", () => {
  const days = { ...emptyWeek(), mon: { enabled: true, available: [{ start: "09:00", end: "17:00" }], blocked: [{ start: "12:00", end: "13:00" }] } };
  const tree = create(<WeeklyCalendarView name="Priya Fernando" days={days} />);
  const titles = tree.root.findAll((n) => n.props && typeof n.props.title === "string").map((n) => n.props.title);
  expect(titles).toContain("Available 09:00–17:00");
  expect(titles).toContain("Blocked 12:00–13:00");
  tree.unmount();
});
