import { it, expect } from "vitest";
import { createRescoreRun, executeRescoreRun, validateBatch } from "./rescoreBatch.js";

const result = { overallScore: 90, breakdown: {}, meta: {} };
const reply = body => ({ batchId: body.batchId, requested: body.candidates.length, completed: body.candidates.length, failed: 0, outstanding: 0,
  results: body.candidates.map(c => ({ applicationId: c.candidateId, status: "completed", result })) });
const makeRun = n => createRescoreRun(Array.from({ length: n }, (_, i) => ({ candidateId: String(i) })), { requiredSkills: ["React"] }, "test");
it("sends 10 at a time and awaits save acknowledgments before another request", async () => {
  const events = [];
  const run = makeRun(21);
  const summary = await executeRescoreRun(run, {
    send: async body => { events.push(`send:${body.candidates.length}`); return reply(body); },
    persist: async id => { await Promise.resolve(); events.push(`saved:${id}`); },
  });
  expect(events[0]).toBe("send:10");
  expect(events[10]).toBe("saved:9");
  expect(events[11]).toBe("send:10");
  expect(events[22]).toBe("send:1");
  expect(summary).toMatchObject({ ok: true, saved: 21, outstanding: 0 });
});
it("retries a failed write without rescoring and never counts it before ACK", async () => {
  const run = makeRun(2); let sends = 0; let attempts = 0;
  const summary = await executeRescoreRun(run, {
    send: async body => { sends++; return reply(body); },
    persist: async id => { if (id === "0" && attempts++ === 0) throw new Error("offline"); },
    onProgress: progress => { if (attempts === 1) expect(progress.saved).toBe(1); }, wait: async () => {},
  });
  expect(sends).toBe(1);
  expect(summary.saved).toBe(2);
});
it("retains the requirements snapshot when caller data changes", async () => {
  const requirements = { requiredSkills: ["React"] };
  const run = createRescoreRun([{ candidateId: "a" }], requirements, "run");
  requirements.requiredSkills[0] = "Angular";
  let sends = 0;
  const summary = await executeRescoreRun(run, {
    send: async body => { expect(body.requirements.requiredSkills).toEqual(["React"]); if (++sends === 1) throw new Error("lost response"); return reply(body); },
    persist: async () => {}, wait: async () => {},
  });
  expect(summary.ok).toBe(true);
});
it("rejects duplicate results even when totals look correct", () => {
  const body = { batchId: "b", candidates: [{ candidateId: "1" }, { candidateId: "2" }] };
  const data = reply(body); data.results[1] = data.results[0];
  expect(() => validateBatch(data, "b", body.candidates)).toThrow();
});
it("stops before the next batch after exhausted persistence retries", async () => {
  const run = makeRun(11); let sends = 0;
  const summary = await executeRescoreRun(run, { send: async body => { sends++; return reply(body); }, persist: async () => { throw new Error("offline"); }, wait: async () => {} });
  expect(sends).toBe(1);
  expect(summary).toMatchObject({ ok: false, saved: 0, outstanding: 11 });
});
