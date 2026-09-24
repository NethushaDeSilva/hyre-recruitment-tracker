import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Availability from "./Availability";
import { emptyWeek } from "@/lib/weeklyAvailability";

const mocks = vi.hoisted(() => ({ save: vi.fn(), week: null, confirmResult: true }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "priya-uid", name: "Priya Fernando" } }) }));
vi.mock("@/components/ui/ConfirmProvider", () => ({ useConfirm: () => () => Promise.resolve(mocks.confirmResult) }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
vi.mock("@/data/store", () => ({
  getWeeklyAvailability: async () => mocks.week,
  saveWeeklyAvailability: (...args) => mocks.save(...args),
}));

const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
const buttons = (tree) => tree.root.findAllByType("button");
const tab = (tree, label) => buttons(tree).find((b) => text(b).startsWith(label));
const button = (tree, label) => buttons(tree).find((b) => text(b).trim() === label);

// Pinned to Sunday 20 Sep 2026, 08:00 Colombo. These cases are about the
// editor's mechanics (tab order, dirty/Save, Remove this day), not the
// date/time gate added later — and on a Sunday nothing is in the past, so
// every day stays selectable and a default 09:00–17:00 row is still valid.
// Without a pin this file silently depended on which weekday the suite ran
// on: from Monday onward the gate disables earlier tabs, which is the
// intended new behaviour (see Availability.gate.test.jsx) but would make
// these assertions fail for the wrong reason.
beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue();
  mocks.week = emptyWeek();
  mocks.confirmResult = true;
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 20, 2, 30));
});
afterEach(() => { vi.useRealTimers(); });

it("shows a real-date range banner (this calendar week, Sri Lanka time) and a per-tab date", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toMatch(/\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/); // the banner range
  expect(text(tab(tree, "Monday"))).toMatch(/\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
  tree.unmount();
});

it("lands on Sunday (the first day of the week), tabs are in Sun→Sat order, and Save starts disabled", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  const labels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  expect(labels.every((l) => tab(tree, l))).toBe(true);
  const order = buttons(tree).filter((b) => labels.includes(text(b).split(/\d/)[0].trim())).map((b) => text(b).split(/\d/)[0].trim());
  expect(order).toEqual(labels); // Sunday first, Saturday last — not Monday first
  expect(button(tree, "Save availability").props.disabled).toBe(true);
  tree.unmount();
});

it("adding a row on Sunday dirties the form and enables Save; saving writes the WHOLE week once", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  await act(async () => { button(tree, "Add available time").props.onClick(); });
  expect(button(tree, "Save availability").props.disabled).toBe(false);
  await act(async () => { button(tree, "Save availability").props.onClick(); });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const [uid, days] = mocks.save.mock.calls[0];
  expect(uid).toBe("priya-uid");
  expect(days.sun.available).toHaveLength(1);
  expect(button(tree, "Save availability").props.disabled).toBe(true); // dirty clears after a successful save
  tree.unmount();
});

it("a validation error on the active day disables Save even though the form is dirty", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  await act(async () => { button(tree, "Add available time").props.onClick(); });
  const setEnd = tree.root.findAllByType("input").filter((i) => i.props.type === "time")[1];
  await act(async () => { setEnd.props.onChange({ target: { value: "08:00" } }); }); // end before start → error
  expect(button(tree, "Save availability").props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain("Fix the highlighted times before saving.");
  tree.unmount();
});

it("switching to Saturday shows Remove this day; switching to Wednesday does not", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  await act(async () => { tab(tree, "Saturday").props.onClick(); });
  expect(button(tree, "Remove this day")).toBeTruthy();
  await act(async () => { tab(tree, "Wednesday").props.onClick(); });
  expect(button(tree, "Remove this day")).toBeFalsy();
  tree.unmount();
});

it("removing Saturday (after confirm) flips its tab chip to Not working and clears its rows", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  await act(async () => { tab(tree, "Saturday").props.onClick(); });
  await act(async () => { button(tree, "Add available time").props.onClick(); });
  await act(async () => { button(tree, "Remove this day").props.onClick(); });
  expect(text(tab(tree, "Saturday"))).toContain("Not working"); // date prefix varies with real today's date
  const paragraphs = tree.root.findAllByType("p").map(text);
  expect(paragraphs).toContain("You are not working on Saturdays.");
  tree.unmount();
});

it("declining the confirm dialog leaves Saturday untouched", async () => {
  mocks.confirmResult = false;
  let tree;
  await act(async () => { tree = create(<Availability />); });
  await act(async () => { tab(tree, "Saturday").props.onClick(); });
  await act(async () => { button(tree, "Remove this day").props.onClick(); });
  expect(button(tree, "Remove this day")).toBeTruthy(); // still the editable panel, not the removed-day state
  tree.unmount();
});
