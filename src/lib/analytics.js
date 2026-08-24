// Pure aggregation helpers for the Management dashboard. No React, no side
// effects — just turn the raw positions/candidates arrays into chart-ready data.
const TERMINAL = ["hired", "rejected"];

export function computeKpis(positions, candidates) {
  const openPositions = positions.filter((p) => p.status === "Open").length;
  const hired = candidates.filter((c) => c.stage === "hired").length;
  const rejected = candidates.filter((c) => c.stage === "rejected").length;
  const inPipeline = candidates.filter((c) => !TERMINAL.includes(c.stage)).length;
  const decided = hired + rejected;
  const hireRate = decided ? Math.round((hired / decided) * 100) : 0;
  return { openPositions, totalCandidates: candidates.length, inPipeline, hired, rejected, hireRate };
}

/** Count candidates in each stage, in the order given. */
export function stageCounts(candidates, order) {
  return order.map((id) => ({ id, count: candidates.filter((c) => c.stage === id).length }));
}

/** Weekly application volume for the last `weeks` weeks ending now. */
export function weeklyApplications(candidates, weeks, now) {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const end = now;
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = end - (i + 1) * WEEK;
    const stop = end - i * WEEK;
    const count = candidates.filter((c) => c.appliedAt > start && c.appliedAt <= stop).length;
    buckets.push({ count, weeksAgo: i });
  }
  return buckets;
}

/** Candidate volume per department, busiest first. */
export function byDepartment(positions, candidates) {
  const map = new Map();
  for (const p of positions) map.set(p.id, p.department || "Other");
  const counts = new Map();
  for (const c of candidates) {
    const dept = map.get(c.positionId) || "Other";
    counts.set(dept, (counts.get(dept) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);
}
