import { describe, expect, it, vi } from "vitest";
import { hiredPositionSnapshot, positionIdFor, removePositionTree } from "./positionLifecycle";
import { isActiveCandidate } from "./candidateCounts";
import { computeKpis, byDepartment } from "./analytics";

describe("candidate counts", () => {
  it("excludes both terminal outcomes while retaining configured intermediate stages", () => {
    const rows = ["applied", "screening", "dept", "interview", "interview2", "final", "custom_review", "hired", "rejected"].map(stage => ({ stage, positionId: "p" }));
    expect(rows.filter(isActiveCandidate)).toHaveLength(7);
    expect(computeKpis([], rows)).toMatchObject({ totalCandidates: 7, inPipeline: 7, hired: 1, rejected: 1 });
    expect(byDepartment([{ id: "p", department: "Sales" }], rows)).toEqual([{ department: "Sales", count: 7 }]);
  });
});

describe("position lifecycle", () => {
  it("uses a disjoint legacy namespace and rejects invalid counters", () => {
    expect(positionIdFor(1)).toBe("vacancy-v2-1");
    expect(positionIdFor(2)).not.toBe(positionIdFor(1));
    for (const n of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(() => positionIdFor(n)).toThrow();
  });

  it("retains employee display and access information independently of the position", () => {
    const snapshot = hiredPositionSnapshot({ title: "Regional Manager", department: "Sales", createdByUid: "manager", stageAssignees: { final: [{ uid: "reviewer" }] } });
    expect(snapshot).toEqual({ title: "Regional Manager", department: "Sales", createdByUid: "manager", stageAssignees: { final: [{ uid: "reviewer" }] } });
  });

  it("keeps the locked position after failure and safely resumes cleanup", async () => {
    const events = [];
    const repository = {
      lock: vi.fn(async () => { events.push("lock"); return { title: "Regional Manager" }; }),
      preserveEmployees: vi.fn(async () => events.push("preserve")),
      removeChildren: vi.fn(async name => { events.push(name); if (name === "applicationScores") throw Error("offline"); }),
      removePosition: vi.fn(async () => events.push("position")),
    };
    await expect(removePositionTree(repository, "p")).rejects.toThrow("offline");
    expect(repository.removePosition).not.toHaveBeenCalled();
    expect(events).toEqual(["lock", "preserve", "applications", "applicationScores"]);
    repository.removeChildren.mockImplementation(async name => events.push(name));
    await removePositionTree(repository, "p");
    expect(events.slice(4)).toEqual(["lock", "preserve", "applications", "applicationScores", "interviews", "notifications", "validation_logs", "position"]);
  });

  it("does not clean existing orphans when the parent position is already absent", async () => {
    const repository = { lock: async () => null, preserveEmployees: vi.fn(), removeChildren: vi.fn(), removePosition: vi.fn() };
    await removePositionTree(repository, "previously-deleted");
    expect(repository.removeChildren).not.toHaveBeenCalled();
    expect(repository.preserveEmployees).not.toHaveBeenCalled();
  });
});
