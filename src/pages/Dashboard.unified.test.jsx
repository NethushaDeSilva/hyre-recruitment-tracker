import { expect, it, vi } from "vitest";
import { act, create } from "react-test-renderer";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import Dashboard, { dashboardMetrics } from "./Dashboard";
const mocks = vi.hoisted(() => ({ respond: vi.fn(async () => ({ ok: true })), bookings: [{ id: "b", status: "pending_confirmation", interviewerId: "u", scheduledAt: Date.now(), positionTitle: "Developer" }] }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "u", role: "HR" } }) }));
vi.mock("@/data/store", () => ({
 useHyreData: () => ({ positions: [], candidates: [], employees: [], loading: false }),
 subscribeInterviewBookings: (cb) => { cb(mocks.bookings); return () => {}; },
 listStaff: async () => [], getAvailabilityStates: async () => ({}), respondToInterviewRequest: (...args) => mocks.respond(...args),
}));
it("uses week boundaries, excludes terminal candidates, and averages dated hires", () => {
 const now = new Date(2026, 8, 21).getTime();
 const result = dashboardMetrics([{ status: "Open" }, { status: "Closed" }], [{ stage: "applied" }, { stage: "hired" }, { stage: "rejected" }], [
 { status: "confirmed", scheduledAt: now }, { status: "confirmed", scheduledAt: now - 14 * 86400000 }, { status: "cancelled", scheduledAt: now }, { status: "pending_confirmation", scheduledAt: now },
 ], [{ appliedAt: now - 10 * 86400000, hiredAt: now }, { hiredAt: now }], now);
 expect(result.open).toHaveLength(1); expect(result.active).toHaveLength(1); expect(result.scheduled).toHaveLength(2); expect(result.pending).toHaveLength(1); expect(result.average).toBe(10);
});
it("renders one view and saves the assigned person's approval", async () => {
 let tree;
 await act(async () => { tree = create(<MemoryRouter><Dashboard /></MemoryRouter>); });
 expect(tree.root.findAllByProps({ role: "tab" })).toHaveLength(0);
 expect(tree.root.findAllByType("h2").map((n) => n.children.join(""))).toEqual(["HR", "Interview Management"]);
 const approve = tree.root.findAllByType("button").find((b) => b.children.includes("Approve"));
 await act(async () => { await approve.props.onClick(); });
 expect(mocks.respond).toHaveBeenCalledWith("b", { accept: true, actor: { uid: "u", role: "HR" } });
 act(() => tree.unmount());
});
