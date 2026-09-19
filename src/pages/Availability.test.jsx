import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";
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

beforeEach(() => { mocks.save.mockReset().mockResolvedValue(); mocks.week = emptyWeek(); mocks.confirmResult = true; });

it("lands on Monday, has all 7 tabs in order, and Save starts disabled", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  const labels = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  expect(labels.every((l) => tab(tree, l))).toBe(true);
  expect(button(tree, "Save availability").props.disabled).toBe(true);
  tree.unmount();
});

it("adding a row on Monday dirties the form and enables Save; saving writes the WHOLE week once", async () => {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  await act(async () => { button(tree, "Add available time").props.onClick(); });
  expect(button(tree, "Save availability").props.disabled).toBe(false);
  await act(async () => { button(tree, "Save availability").props.onClick(); });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  const [uid, days] = mocks.save.mock.calls[0];
  expect(uid).toBe("priya-uid");
  expect(days.mon.available).toHaveLength(1);
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
  expect(text(tab(tree, "Saturday"))).toBe("SaturdayNot working");
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
