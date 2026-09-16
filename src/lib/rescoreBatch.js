export const RESCORE_BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;

export function snapshotKey(value) {
  if (Array.isArray(value)) return `[${value.map(snapshotKey).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${snapshotKey(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function validateBatch(data, batchId, candidates) {
  const ids = new Set(candidates.map(c => c.candidateId));
  if (!data || data.batchId !== batchId || data.requested !== ids.size || !Array.isArray(data.results) || data.results.length !== ids.size) throw new Error("Invalid batch reconciliation.");
  const counts = { completed: 0, failed: 0, outstanding: 0 };
  for (const r of data.results) {
    if (!ids.delete(r.applicationId) || !(r.status in counts)) throw new Error("Invalid batch application IDs or status.");
    if (r.status === "completed" && (!Number.isFinite(r.result?.overallScore) || !r.result?.breakdown || !r.result?.meta)) throw new Error("Incomplete score result.");
    if (r.status === "failed" && !r.error || r.status === "outstanding" && !r.reason) throw new Error("Missing batch failure reason.");
    counts[r.status]++;
  }
  if (ids.size || Object.keys(counts).some(k => data[k] !== counts[k]) || data.requested !== counts.completed + counts.failed + counts.outstanding) throw new Error("Batch counts do not reconcile.");
  return data.results;
}

// The same run object is retained for retries, including computed-but-unsaved
// results. Snapshot data never changes underneath retry-by-application-ID.
export function createRescoreRun(candidates, requirements, runId = crypto.randomUUID()) {
  const snapshot = JSON.parse(JSON.stringify({ candidates, requirements }));
  return { ...snapshot, runId, records: new Map(), saved: new Set() };
}

export async function executeRescoreRun(run, { send, persist, onProgress = () => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let error = "";
  for (let start = 0; start < run.candidates.length; start += RESCORE_BATCH_SIZE) {
    const chunk = run.candidates.slice(start, start + RESCORE_BATCH_SIZE);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const pending = chunk.filter(c => !run.saved.has(c.candidateId) && run.records.get(c.candidateId)?.status !== "completed");
      if (pending.length) {
        const batchId = `${run.runId}:${start}:${attempt}`;
        try {
          const data = await send({ batchId, candidates: pending, requirements: run.requirements });
          const records = validateBatch(data, batchId, pending);
          records.forEach(r => run.records.set(r.applicationId, r));
        } catch (e) {
          error = e.message;
          if (e.fatal) return summarize(run, error);
        }
      }
      // All writes settle before the next request. Counts advance only on ACK.
      for (const c of chunk) {
        const record = run.records.get(c.candidateId);
        if (run.saved.has(c.candidateId) || record?.status !== "completed") continue;
        try {
          await persist(record.applicationId, record.result, run.requirements);
          run.saved.add(record.applicationId);
          onProgress(summarize(run));
        } catch (e) {
          error = e.message;
          if (e.fatal) return summarize(run, error);
        }
      }
      if (chunk.every(c => run.saved.has(c.candidateId))) break;
      if (attempt < MAX_ATTEMPTS - 1) await wait(500 * 2 ** attempt);
    }
    // Do not send the next batch until this batch is durably saved.
    if (chunk.some(c => !run.saved.has(c.candidateId))) break;
  }
  return summarize(run, error);
}

function summarize(run, error = "") {
  const failed = run.candidates.filter(c => !run.saved.has(c.candidateId) && run.records.get(c.candidateId)?.status === "failed").length;
  const outstanding = run.candidates.length - run.saved.size - failed;
  const ok = failed === 0 && outstanding === 0;
  return { ok, requested: run.candidates.length, completed: run.saved.size, scored: run.saved.size, saved: run.saved.size, failed, outstanding,
    error: ok ? "" : `Saved ${run.saved.size}/${run.candidates.length}; ${failed} failed, ${outstanding} outstanding.${error ? ` ${error}` : " Retry to resume this snapshot."}` };
}
