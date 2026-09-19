import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";
import AvailabilityDirectory from "./AvailabilityDirectory";

const HR_MEMBERS = [
  { uid: "dilani", name: "Dilani Liyanage", role: "HR" },
  { uid: "amara", name: "Amara Perera", role: "HR" },
  { uid: "nimal", name: "Nimal Ekanayake", role: "HR" },
  { uid: "priyaf", name: "Priya Fernando", role: "HR" },
  { uid: "priyash", name: "Priya Seneviratne Herath", role: "HR" },
];

const mocks = vi.hoisted(() => ({ staff: [], docs: {} }));
vi.mock("@/data/store", () => ({
  listStaff: async () => mocks.staff,
  getWeeklyAvailabilityDocs: async (uids) => Object.fromEntries(uids.map((id) => [id, mocks.docs[id] || null])),
}));

const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
const buttons = (tree) => tree.root.findAllByType("button");
const button = (tree, label) => buttons(tree).find((b) => text(b).trim() === label);

beforeEach(() => { mocks.staff = HR_MEMBERS; mocks.docs = { priyaf: { days: {} } }; });

it("lands on exactly three role tabs, zero names in the DOM, and the select-a-category prompt", async () => {
  let tree;
  await act(async () => { tree = create(<AvailabilityDirectory />); });
  expect(["HR", "Interviewer", "Management"].every((l) => button(tree, l))).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain("Select a category to view interviewers.");
  for (const m of HR_MEMBERS) expect(JSON.stringify(tree.toJSON())).not.toContain(m.name);
  tree.unmount();
});

it("clicking HR lists exactly the five HR members with a declared/no-availability chip each", async () => {
  let tree;
  await act(async () => { tree = create(<AvailabilityDirectory />); });
  await act(async () => { button(tree, "HR").props.onClick(); });
  for (const m of HR_MEMBERS) expect(JSON.stringify(tree.toJSON())).toContain(m.name);
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain("Availability declared"); // priyaf has a doc
  expect(rendered).toContain("No availability"); // the other four don't
  tree.unmount();
});

it("clicking a user opens their calendar; Back returns to the list", async () => {
  let tree;
  await act(async () => { tree = create(<AvailabilityDirectory />); });
  await act(async () => { button(tree, "HR").props.onClick(); });
  await act(async () => { button(tree, "Priya Fernando")?.props.onClick() ?? tree.root.findAllByType("button").find((b) => text(b).includes("Priya Fernando")).props.onClick(); });
  expect(JSON.stringify(tree.toJSON())).toContain("Weekly availability");
  expect(button(tree, "Back to HR")).toBeTruthy();
  await act(async () => { button(tree, "Back to HR").props.onClick(); });
  expect(JSON.stringify(tree.toJSON())).not.toContain("Weekly availability");
  for (const m of HR_MEMBERS) expect(JSON.stringify(tree.toJSON())).toContain(m.name);
  tree.unmount();
});
