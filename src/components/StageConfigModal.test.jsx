import React from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, expect, it, vi } from "vitest";
import StageConfigModal from "./StageConfigModal";
import StageAssignmentStep from "./StageAssignmentStep";

const mocks = vi.hoisted(() => ({ save: vi.fn(), positions: [], bookings: [], availability: {} }));
vi.mock("@/firebase/config", () => ({ firebaseReady: false, db: null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "hr", role: "HR", name: "HR" } }) }));
vi.mock("@/data/store", () => ({
  useHyreData: () => ({ positions: mocks.positions, candidates: [] }),
  savePipeline: (...args) => mocks.save(...args),
  subscribeInterviewBookings: (callback) => { callback(mocks.bookings); return () => {}; },
  getAvailabilityRecords: async () => mocks.availability,
}));
vi.mock("@/components/ui/Modal", () => ({ Modal: ({ open, children, footer }) => open ? <div>{children}{footer}</div> : null }));
const position = { id: "RM-02", title: "Regional Manager", stages: ["applied", "screening", "dept", "interview", "final", "hired"], stageAssignees: {} };
const text = (node) => typeof node === "string" ? node : (node.children || []).map(text).join("");
const button = (tree, label) => tree.root.findAllByType("button").find((b) => text(b).trim() === label);
beforeEach(() => { mocks.save.mockReset().mockResolvedValue(); mocks.positions = [position]; mocks.bookings = []; mocks.availability = {}; });

it("saves without closing or changing stage, clears unsaved status and keeps edits on failure", async () => {
  const close = vi.fn();
  let tree;
  await act(async () => { tree = create(<StageConfigModal open position={position} onClose={close} />); });
  await act(async () => { button(tree, "Assign people").props.onClick(); });
  const picker = () => tree.root.findByType(StageAssignmentStep);
  const person = picker().props.staff[0];
  await act(async () => { picker().props.onToggle(person); });
  expect(picker().props.selected).toHaveLength(1);
  expect(text(tree.toJSON())).toContain("Selected · Unsaved change");
  await act(async () => { await button(tree, "Save now").props.onClick(); });
  expect(mocks.save.mock.calls[0][0]).toBe("RM-02");
  expect(close).not.toHaveBeenCalled();
  expect(picker().props.stage.id).toBe("screening");
  expect(text(tree.toJSON())).toContain("Assigned to this position · Saved");
  expect(text(tree.toJSON())).not.toContain("Unsaved change");
  await act(async () => { picker().props.onToggle(person); });
  expect(text(tree.toJSON())).toContain("Deselected · Unsaved change");
  mocks.save.mockRejectedValueOnce(new Error("Network unavailable"));
  await act(async () => { await button(tree, "Save now").props.onClick(); });
  expect(text(tree.toJSON())).toContain("Network unavailable");
  expect(picker().props.selected).toHaveLength(0);
  expect(tree.root.findByType("fieldset").props.disabled).toBe(false);
  tree.unmount();
});

it("all stage steps share selection behaviour and allow one person in multiple stages", async () => {
  let tree;
  await act(async () => { tree = create(<StageConfigModal open position={position} onClose={vi.fn()} />); });
  await act(async () => { button(tree, "Assign people").props.onClick(); });
  for (let i = 0; i < 4; i++) {
    const picker = tree.root.findByType(StageAssignmentStep);
    await act(async () => { picker.props.onToggle({ uid: "same", name: "Same person", role: picker.props.stage.owner }); });
    await act(async () => { await button(tree, "Save now").props.onClick(); });
    expect(tree.root.findByType(StageAssignmentStep).props.selected[0].uid).toBe("same");
    if (i < 3) await act(async () => { button(tree, "Proceed").props.onClick(); });
  }
  expect(Object.keys(mocks.save.mock.calls.at(-1)[1].stageAssignees)).toHaveLength(4);
  tree.unmount();
});

it("roster puts selected users first, scrolls them into view, and shows cross-position conflicts — no time-slot picker anymore", async () => {
  const staff = ["Amara", "Dilani", "Chamara"].map((name) => ({ uid: name, name }));
  const scroll = { scrollTop: 200 };
  const props = { stage: { id: "final", label: "Final Interview", owner: "Management" }, staff, selected: [], savedSelected: [], assignments: {}, positions: [{ id: "BD-01", title: "Backend Developer", stageAssignees: { final: [staff[1]] } }], positionId: "RM-02", bookings: [], availabilityByUid: {}, pendingSlots: {}, q: "", setQ: vi.fn(), onToggle: vi.fn(), onSetMany: vi.fn(), onSetPersonSlot: vi.fn(), onClearPersonSlot: vi.fn() };
  let tree;
  await act(async () => { tree = create(<StageAssignmentStep {...props} />, { createNodeMock: (el) => el.type === "ul" ? scroll : null }); });
  const rows = () => tree.root.findAllByType("button").filter((b) => b.props["aria-label"]?.startsWith("Select "));
  expect(rows().map((b) => b.props["aria-label"])).toEqual(["Select Amara", "Select Chamara", "Select Dilani"]);
  expect(text(tree.toJSON())).toContain("Assigned elsewhere · Backend Developer");
  // The old typed-slot conflict lock is gone — rows are never disabled anymore.
  expect(rows().every((b) => b.props.disabled === undefined)).toBe(true);
  scroll.scrollTop = 200;
  await act(async () => { tree.update(<StageAssignmentStep {...props} selected={[staff[2], staff[1]]} />); });
  expect(rows().map((b) => b.props["aria-label"])).toEqual(["Select Chamara", "Select Dilani", "Select Amara"]);
  expect(scroll.scrollTop).toBe(0);
  expect(text(tree.toJSON())).not.toContain("Book a time slot");
  tree.unmount();
});

it("the per-person availability dropdown shows real free windows and locks a slot once it's set", async () => {
  const staff = [{ uid: "amara", name: "Amara Perera" }];
  const record = {
    declaredAt: Date.now() - 1000, validUntil: Date.now() + 14 * 24 * 60 * 60 * 1000, timeZone: "UTC",
    // Every weekday, so the test is robust to whatever local timezone CI/the dev machine runs in.
    slots: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, startTime: "08:00", endTime: "12:00" })),
  };
  const onSetPersonSlot = vi.fn();
  const props = {
    stage: { id: "screening", label: "HR Screening", owner: "HR" }, staff, selected: [], savedSelected: [],
    assignments: {}, positions: [], positionId: "RM-02", bookings: [], availabilityByUid: { amara: record }, pendingSlots: {},
    q: "", setQ: vi.fn(), onToggle: vi.fn(), onSetMany: vi.fn(), onSetPersonSlot, onClearPersonSlot: vi.fn(),
  };
  let tree;
  await act(async () => { tree = create(<StageAssignmentStep {...props} />); });
  await act(async () => { button(tree, "Available times").props.onClick(); });
  expect(text(tree.toJSON())).toContain("Set Interview");
  const setBtn = tree.root.findAllByType("button").find((b) => text(b) === "Set Interview");
  await act(async () => { setBtn.props.onClick(); });
  expect(onSetPersonSlot).toHaveBeenCalledTimes(1);
  const [person, window] = onSetPersonSlot.mock.calls[0];
  expect(person.uid).toBe("amara");
  expect(window.durationMs).toBe(4 * 3600 * 1000); // 08:00-12:00

  // Once a slot is pending for this person, that window shows it as set (not a
  // checkbox tick), and every OTHER window's Set Interview button disables —
  // only one active pick per person per stage until it's unselected.
  await act(async () => { tree.update(<StageAssignmentStep {...props} pendingSlots={{ amara: window }} />); });
  expect(text(tree.toJSON())).toContain("Interview set · Unselect");
  const otherSetButtons = tree.root.findAllByType("button").filter((b) => text(b) === "Set Interview");
  expect(otherSetButtons.length).toBeGreaterThan(0);
  expect(otherSetButtons.every((b) => b.props.disabled)).toBe(true);

  // Once it's a real persisted booking, it's fully locked — no more Unselect.
  const bookings = [{ id: "b1", positionId: "RM-02", stageId: "screening", interviewerId: "amara", scheduledAt: window.scheduledAt, status: "confirmed" }];
  await act(async () => { tree.update(<StageAssignmentStep {...props} pendingSlots={{ amara: window }} bookings={bookings} />); });
  expect(text(tree.toJSON())).toContain("Interview set · Saved");
  expect(text(tree.toJSON())).not.toContain("Unselect");
  tree.unmount();
});

it("Save now is Word-doc-style: disabled with nothing to save, enabled the moment something changes, disabled again once saved", async () => {
  let tree;
  await act(async () => { tree = create(<StageConfigModal open position={position} onClose={vi.fn()} />); });
  await act(async () => { button(tree, "Assign people").props.onClick(); });
  // Nothing changed yet — disabled.
  expect(button(tree, "Save now").props.disabled).toBe(true);

  const picker = () => tree.root.findByType(StageAssignmentStep);
  const person = picker().props.staff[0];
  await act(async () => { picker().props.onToggle(person); });
  // A change was made — enabled.
  expect(button(tree, "Save now").props.disabled).toBe(false);

  await act(async () => { await button(tree, "Save now").props.onClick(); });
  // Saved — nothing left to save, disabled again.
  expect(button(tree, "Save now").props.disabled).toBe(true);

  await act(async () => { picker().props.onToggle(person); });
  // Deselecting is itself a new unsaved change — enabled again.
  expect(button(tree, "Save now").props.disabled).toBe(false);
  tree.unmount();
});

it("shows 'No available times' when a person has no declared availability", async () => {
  const staff = [{ uid: "amara", name: "Amara Perera" }];
  const props = {
    stage: { id: "screening", label: "HR Screening", owner: "HR" }, staff, selected: [], savedSelected: [],
    assignments: {}, positions: [], positionId: "RM-02", bookings: [], availabilityByUid: {}, pendingSlots: {},
    q: "", setQ: vi.fn(), onToggle: vi.fn(), onSetMany: vi.fn(), onSetPersonSlot: vi.fn(), onClearPersonSlot: vi.fn(),
  };
  let tree;
  await act(async () => { tree = create(<StageAssignmentStep {...props} />); });
  await act(async () => { button(tree, "Available times").props.onClick(); });
  expect(text(tree.toJSON())).toContain("No available times.");
  tree.unmount();
});
