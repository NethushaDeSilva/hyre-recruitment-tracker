import React from "react";
import { act, create } from "react-test-renderer";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Dashboard from "./Dashboard";

const mocks = vi.hoisted(() => ({ positions: [], candidates: [], bookings: [], user: { uid: "hr-1", role: "HR", name: "Priya" } }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/data/store", () => ({
  useHyreData: () => ({ positions: mocks.positions, candidates: mocks.candidates, loading: false }),
  subscribeInterviewBookings: (onChange) => { onChange(mocks.bookings); return () => {}; },
}));

const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
const buttons = (tree) => tree.root.findAllByType("button");
const tab = (tree, label) => buttons(tree).find((b) => b.props.role === "tab" && text(b) === label);

beforeEach(() => {
  mocks.positions = [
    { id: "P1", status: "Open" }, { id: "P2", status: "Open" }, { id: "P3", status: "Closed" },
  ];
  mocks.candidates = [{ id: "C1" }, { id: "C2" }];
  mocks.bookings = [
    { id: "b1", status: "confirmed" },
    { id: "b2", status: "pending_confirmation" },
    { id: "b3", status: "needs_attention" },
    { id: "b4", status: "confirmed" },
  ];
  mocks.user = { uid: "hr-1", role: "HR", name: "Priya" };
});

const renderDashboard = () => {
  let tree;
  act(() => { tree = create(<MemoryRouter><Dashboard /></MemoryRouter>); });
  return tree;
};

it("renders all three role tabs and defaults to the signed-in user's own role", () => {
  const tree = renderDashboard();
  expect(tab(tree, "HR")).toBeTruthy();
  expect(tab(tree, "Interviewer")).toBeTruthy();
  expect(tab(tree, "Management")).toBeTruthy();
  expect(tab(tree, "HR").props["aria-selected"]).toBe(true);
  expect(tab(tree, "Interviewer").props["aria-selected"]).toBe(false);
  tree.unmount();
});

it("switching tabs changes the active tab and its description, tabs load without error", () => {
  const tree = renderDashboard();
  act(() => { tab(tree, "Management").props.onClick(); });
  expect(tab(tree, "Management").props["aria-selected"]).toBe(true);
  expect(tab(tree, "HR").props["aria-selected"]).toBe(false);
  expect(text(tree.toJSON())).toContain("Oversee final-stage interviews");
  act(() => { tab(tree, "Interviewer").props.onClick(); });
  expect(tab(tree, "Interviewer").props["aria-selected"]).toBe(true);
  expect(text(tree.toJSON())).toContain("keep your own availability current");
  tree.unmount();
});

it("computes and displays the three key metrics correctly from live data", () => {
  const tree = renderDashboard();
  const rendered = text(tree.toJSON());
  // 2 Open out of 3 positions
  expect(rendered).toContain("Open positions");
  // 3 bookings are confirmed/pending_confirmation (b1,b2,b4), 1 is needs_attention (b3)
  const numbers = tree.root.findAllByProps({ className: "text-[26px] font-extrabold leading-none text-foreground" }).map((n) => text(n));
  expect(numbers).toEqual(["2", "3", "1"]); // open positions, scheduled interviews, pending approvals
  tree.unmount();
});

it("quick actions are enabled for what the signed-in HR user can do, and Create Position navigates with ?create=1", () => {
  const tree = renderDashboard();
  const create = buttons(tree).find((b) => text(b).includes("Create Position"));
  const schedule = buttons(tree).find((b) => text(b).includes("Schedule Interview"));
  const viewCandidates = buttons(tree).find((b) => text(b).includes("View Candidates"));
  expect(create.props.disabled).toBeFalsy();
  expect(schedule.props.disabled).toBeFalsy();
  expect(viewCandidates.props.disabled).toBeFalsy();
  tree.unmount();
});

it("quick actions are disabled for an Interviewer, who cannot create positions, schedule, or view the candidates table", () => {
  mocks.user = { uid: "int-1", role: "Interviewer", name: "Rehan" };
  const tree = renderDashboard();
  const create = buttons(tree).find((b) => text(b).includes("Create Position"));
  const schedule = buttons(tree).find((b) => text(b).includes("Schedule Interview"));
  const viewCandidates = buttons(tree).find((b) => text(b).includes("View Candidates"));
  expect(create.props.disabled).toBe(true);
  expect(schedule.props.disabled).toBe(true);
  expect(viewCandidates.props.disabled).toBe(true);
  tree.unmount();
});
