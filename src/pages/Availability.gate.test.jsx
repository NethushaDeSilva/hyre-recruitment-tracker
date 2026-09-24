// UI half of the availability date/time gate: past day tabs are not
// clickable, today opens by default, and past days' saved times stay visible
// read-only (historical availability is frozen, never hidden).
//
// Clock is pinned to Thursday 24 Sep 2026, 14:30 Colombo — Thursday makes
// Sun/Mon/Tue AND Wednesday past, which is the case the spec calls out.
import React from "react";
import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { wallTimeToUTC } from "@/lib/wallClock";

const mocks = vi.hoisted(() => ({ saved: null, save: vi.fn() }));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "iv-1", role: "Interviewer", name: "Priya" } }) }));
vi.mock("@/components/ui/ConfirmProvider", () => ({ useConfirm: () => async () => true }));
vi.mock("@/components/ui/ToastProvider", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("@/data/store", () => ({
  getWeeklyAvailability: async () => mocks.saved,
  saveWeeklyAvailability: (...a) => mocks.save(...a),
}));

const Availability = (await import("./Availability")).default;
const { emptyWeek, DAY_LABELS } = await import("@/lib/weeklyAvailability");

const COLOMBO = "Asia/Colombo";
const colombo = (hour, minute = 0) => wallTimeToUTC({ timeZone: COLOMBO, year: 2026, month: 9, day: 24, hour, minute });
const text = (node) => (typeof node === "string" ? node : (node?.children || []).map(text).join(""));
const dayTab = (tree, label) =>
  tree.root.findAllByType("button").find((b) => text(b).startsWith(label));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(colombo(14, 30));
  mocks.saved = { ...emptyWeek(), wed: { enabled: true, available: [{ start: "09:00", end: "12:00" }] } };
  mocks.save.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); });

async function render() {
  let tree;
  await act(async () => { tree = create(<Availability />); });
  await act(async () => {}); // flush the availability fetch
  return tree;
}

it("disables every day tab before today — including Wednesday when today is Thursday", async () => {
  const tree = await render();
  for (const label of ["Sunday", "Monday", "Tuesday", "Wednesday"]) {
    expect(dayTab(tree, label).props.disabled).toBe(true);
  }
  tree.unmount();
});

it("leaves today and future days clickable", async () => {
  const tree = await render();
  for (const label of ["Thursday", "Friday", "Saturday"]) {
    expect(dayTab(tree, label).props.disabled).toBe(false);
  }
  tree.unmount();
});

it("opens on today rather than on Sunday, which would be a disabled tab by midweek", async () => {
  const tree = await render();
  // The active tab is the one carrying the primary border colour.
  const active = tree.root.findAllByType("button").filter((b) => String(b.props.className).includes("border-primary"));
  expect(active).toHaveLength(1);
  expect(text(active[0])).toContain(DAY_LABELS.thu);
  tree.unmount();
});

it("keeps a past day's saved times visible read-only instead of hiding them", async () => {
  const tree = await render();
  const rendered = text(tree.toJSON());
  expect(rendered).toContain("Earlier this week (read-only)");
  expect(rendered).toContain("09:00–12:00"); // Wednesday's stored slot, still readable
  tree.unmount();
});

it("shows the current Colombo time alongside today's editor so the cutoff is explicit", async () => {
  const tree = await render();
  expect(text(tree.toJSON())).toContain("It's 14:30 — times earlier than this today can't be added.");
  tree.unmount();
});
