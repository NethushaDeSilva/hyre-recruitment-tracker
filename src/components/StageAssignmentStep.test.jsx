process.env.TZ = "UTC"; // so browserTimeZone() and Date's local methods agree with the fixture below

import React from "react";
import { create, act } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import StageAssignmentStep from "./StageAssignmentStep";

const text = (node) => (typeof node === "string" ? node : (node.children || []).map(text).join(""));
const buttons = (tree) => tree.root.findAllByType("button");
const chevron = (tree) => buttons(tree).find((b) => b.props["aria-expanded"] !== undefined);

const PRIYA = { uid: "priya", name: "Priya Fernando", role: "HR", title: "Recruiter" };
// Monday 09:00-10:00, declared in UTC so the test is deterministic regardless of host TZ.
const MON_9AM_UTC = Date.UTC(2026, 8, 21, 9, 0, 0);
// "Now" pinned to the Sunday just before it — AvailabilityDropdown materializes
// against upcomingWeekBoundsMs() (tomorrow through +7 days, real Date.now()),
// so the fixture's Monday has to actually fall inside that real-time window.
const SUNDAY_NOON_UTC = Date.UTC(2026, 8, 20, 12, 0, 0);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(SUNDAY_NOON_UTC); });
afterEach(() => { vi.useRealTimers(); });
const record = {
  timeZone: "UTC",
  declaredAt: 1,
  validUntil: MON_9AM_UTC + 30 * 24 * 3600 * 1000,
  slots: [{ dayOfWeek: 1, startTime: "09:00", endTime: "10:00" }],
  exceptions: [],
};

const baseProps = {
  stage: { id: "screening", label: "HR Screening", owner: "HR" },
  staff: [PRIYA],
  selected: [],
  savedSelected: [],
  assignments: {},
  positions: [],
  positionId: "RM-02",
  bookings: [],
  bookingsLoading: false,
  bookingError: "",
  availabilityByUid: { priya: record },
  pendingSlots: {},
  onSetPersonSlot: vi.fn(),
  onClearPersonSlot: vi.fn(),
  q: "", setQ: vi.fn(),
  loading: false, error: "",
  onToggle: vi.fn(), onSetMany: vi.fn(),
  stepInfo: "Step 1 of 4",
};

it("offers Set Interview for a real declared free window when nothing else is booked", async () => {
  let tree;
  await act(async () => { tree = create(<StageAssignmentStep {...baseProps} />); });
  await act(async () => { chevron(tree).props.onClick(); });
  expect(text(tree.toJSON())).toContain("Set Interview");
  expect(text(tree.toJSON())).not.toContain("Busy");
  tree.unmount();
});

it("blocks the same time slot as busy/red when it's already booked for a DIFFERENT position", async () => {
  // Priya was already booked Mon 09:00-10:00 for the Regional Manager position —
  // opening this same window from Front-end Developer's assignment step must
  // show it as busy, not offer Set Interview, regardless of position/stage.
  const crossPositionBooking = {
    id: "existing-booking",
    interviewerId: "priya",
    positionId: "RM-02", // a DIFFERENT position than the one being configured below
    positionTitle: "Regional Manager",
    stageId: "screening",
    stageLabel: "HR Screening",
    scheduledAt: MON_9AM_UTC,
    durationMs: 3600000,
    status: "confirmed",
  };
  const props = { ...baseProps, positionId: "FE-01", bookings: [crossPositionBooking] };
  let tree;
  await act(async () => { tree = create(<StageAssignmentStep {...props} />); });
  await act(async () => { chevron(tree).props.onClick(); });
  const rendered = text(tree.toJSON());
  expect(rendered).toContain("Busy");
  expect(rendered).not.toContain("Set Interview");
  tree.unmount();
});

it("locks the row once THIS position's own interview is saved — no Unselect, no re-clicking", async () => {
  const ownBooking = {
    id: "own-booking",
    interviewerId: "priya",
    positionId: "RM-02",
    stageId: "screening",
    scheduledAt: MON_9AM_UTC,
    durationMs: 3600000,
    status: "confirmed",
  };
  const props = { ...baseProps, bookings: [ownBooking], pendingSlots: { priya: { scheduledAt: MON_9AM_UTC, durationMs: 3600000 } } };
  let tree;
  await act(async () => { tree = create(<StageAssignmentStep {...props} />); });
  await act(async () => { chevron(tree).props.onClick(); });
  const rendered = text(tree.toJSON());
  expect(rendered).toContain("Interview set · Saved");
  expect(rendered).not.toContain("Unselect");
  tree.unmount();
});
