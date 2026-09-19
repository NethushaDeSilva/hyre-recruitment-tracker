// Fix 2 — these three tests are repointed from the deleted standalone
// src/pages/AvailabilityDirectory.jsx (same scenarios, same assertions)
// onto the folded-in /schedule page. A fourth test is new here: it proves
// the pre-existing "Request availability" booking affordance survived the
// fold-in, which AvailabilityDirectory (read-only, no such affordance)
// never had reason to test.
import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";
import InterviewCalendar from "./InterviewCalendar";
import InterviewCalendarGrid from "./InterviewCalendarGrid";

const HR_MEMBERS = [
  { uid: "dilani", name: "Dilani Liyanage", role: "HR", avatarColor: "#2563EB" },
  { uid: "amara", name: "Amara Perera", role: "HR", avatarColor: "#4F46E5" },
  { uid: "nimal", name: "Nimal Ekanayake", role: "HR", avatarColor: "#E0A422" },
  { uid: "priyaf", name: "Priya Fernando", role: "HR", avatarColor: "#16A34A" },
  { uid: "priyash", name: "Priya Seneviratne Herath", role: "HR", avatarColor: "#DC2626" },
];

const mocks = vi.hoisted(() => ({ staff: [], states: {}, availability: {}, notify: vi.fn() }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "hr-session", name: "HR" } }) }));
vi.mock("@/data/store", () => ({
  listStaff: async () => mocks.staff,
  getAvailabilityStates: async (uids) => Object.fromEntries(uids.map((id) => [id, mocks.states[id] || "unknown"])),
  getStaffAvailability: async () => mocks.availability,
  notifyUser: (...args) => mocks.notify(...args),
  subscribeInterviewBookings: () => () => {},
}));

const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
const buttons = (tree) => tree.root.findAllByType("button");
const button = (tree, label) => buttons(tree).find((b) => text(b).trim() === label);

beforeEach(() => {
  mocks.staff = HR_MEMBERS;
  mocks.states = { priyaf: "available" }; // only Priya has declared
  mocks.availability = { priyaf: { state: "available", freeSlots: [], commitments: [], exceptions: [] } };
  mocks.notify.mockReset();
});

it("lands on exactly three role tabs, zero names in the DOM, and the select-a-category prompt", async () => {
  let tree;
  await act(async () => { tree = create(<InterviewCalendar />); });
  expect(["HR", "Interviewer", "Management"].every((l) => button(tree, l))).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain("Select a category to view interviewers.");
  for (const m of HR_MEMBERS) expect(JSON.stringify(tree.toJSON())).not.toContain(m.name);
  tree.unmount();
});

it("clicking HR lists exactly the five HR members with a declared/no-availability chip each", async () => {
  let tree;
  await act(async () => { tree = create(<InterviewCalendar />); });
  await act(async () => { button(tree, "HR").props.onClick(); });
  for (const m of HR_MEMBERS) expect(JSON.stringify(tree.toJSON())).toContain(m.name);
  const rendered = JSON.stringify(tree.toJSON());
  expect(rendered).toContain("Availability declared"); // priyaf
  expect(rendered).toContain("No availability"); // the other four
  tree.unmount();
});

it("clicking a user opens their calendar via the REUSED booking grid; Back returns to the list", async () => {
  let tree;
  await act(async () => { tree = create(<InterviewCalendar />); });
  await act(async () => { button(tree, "HR").props.onClick(); });
  await act(async () => { buttons(tree).find((b) => text(b).includes("Priya Fernando")).props.onClick(); });

  const grid = tree.root.findByType(InterviewCalendarGrid);
  expect(grid.props.people).toEqual([HR_MEMBERS.find((m) => m.uid === "priyaf")]);
  expect(button(tree, "Back to HR")).toBeTruthy();

  await act(async () => { button(tree, "Back to HR").props.onClick(); });
  expect(() => tree.root.findByType(InterviewCalendarGrid)).toThrow();
  for (const m of HR_MEMBERS) expect(JSON.stringify(tree.toJSON())).toContain(m.name);
  tree.unmount();
});

it("the existing Request-availability booking affordance survives the fold-in for an undeclared person", async () => {
  let tree;
  await act(async () => { tree = create(<InterviewCalendar />); });
  await act(async () => { button(tree, "HR").props.onClick(); });
  await act(async () => { buttons(tree).find((b) => text(b).includes("Amara Perera")).props.onClick(); }); // undeclared
  expect(tree.root.findAllByType("p").map(text)).toContain("Amara Perera has not declared availability yet.");
  const request = button(tree, "Request availability");
  expect(request).toBeTruthy();
  await act(async () => { request.props.onClick(); });
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ uid: "amara", type: "availability_request" }));
  tree.unmount();
});
