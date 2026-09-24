import { scoringRequirements } from "./scoringRequirements";
import { useEffect, useRef, useState } from "react";
import { rescoreVacancy } from "@/data/store";
import { needsAutomaticScore } from "@/lib/automaticScoring";
import { snapshotKey } from "@/lib/rescoreBatch";

// A transient failure (rate limit, network blip, a flaky provider call) used
// to leave a candidate permanently stuck on "Not scored" — attempted.current
// marks an id as tried the moment the batch is SENT, not once it succeeds, so
// a failed run never got picked up again on its own. Someone had to notice
// the "Automatic scoring could not finish" message and click Retry by hand.
// That's a real risk live (a demo, a viva) where nobody's watching for it.
// AUTO_RETRY_LIMIT gives a failed batch a few unattended shots at healing
// itself before it falls back to the manual Retry button — bounded so a
// genuinely broken call (bad CV, missing API key) doesn't hammer the
// provider forever.
const AUTO_RETRY_LIMIT = 3;
const AUTO_RETRY_DELAY_MS = 4000;

export function useAutomaticScoring(position, candidates, scores, enabled) {
  const attempted = useRef(new Set());
  const running = useRef(false);
  const current = useRef("");
  const autoRetries = useRef(0);
  const [status, setStatus] = useState({ busy: false, message: "" });
  const [revision, setRevision] = useState(0);
  const scope = `${position?.id}:${snapshotKey(scoringRequirements(position))}`;
  const pending = candidates.filter(c => needsAutomaticScore(c, position, scores.get(c.id))).map(c => c.id).sort();
  const key = JSON.stringify(pending);
  useEffect(() => {
    current.current = scope;
    attempted.current.clear();
    autoRetries.current = 0;
    setStatus({ busy: false, message: "" });
    return () => { current.current = ""; };
  }, [scope]);
  useEffect(() => {
    if (!enabled || !position?.requirements || running.current) return;
    const pendingIds = JSON.parse(key);
    for (const token of attempted.current) {
      if (!pendingIds.some(id => token === `${scope}:${id}`)) attempted.current.delete(token);
    }
    const ids = pendingIds.filter(id => !attempted.current.has(`${scope}:${id}`));
    if (!ids.length) return;
    const timer = setTimeout(async () => {
      if (running.current) return;
      ids.forEach(id => attempted.current.add(`${scope}:${id}`));
      running.current = true;
      setStatus({ busy: true, message: "Scoring Applied candidates automatically…" });
      // On failure, either schedule an unattended retry (clearing just this
      // batch's ids so the next effect pass picks them up again) or, once
      // AUTO_RETRY_LIMIT is spent, fall back to the message + manual Retry
      // button (PositionDetail.jsx) exactly as before.
      const scheduleAutoRetry = (message) => {
        autoRetries.current += 1;
        setStatus({ busy: false, message: `${message} Retrying automatically… (attempt ${autoRetries.current + 1} of ${AUTO_RETRY_LIMIT + 1})` });
        setTimeout(() => {
          if (current.current !== scope) return;
          ids.forEach(id => attempted.current.delete(`${scope}:${id}`));
          setRevision(r => r + 1);
        }, AUTO_RETRY_DELAY_MS);
      };
      try {
        const result = await rescoreVacancy(position.id, { applicationIds: ids });
        if (current.current !== scope) return;
        if (result.ok) {
          autoRetries.current = 0;
          setStatus({ busy: false, message: "Applied candidate scores are up to date." });
        } else if (autoRetries.current < AUTO_RETRY_LIMIT) {
          scheduleAutoRetry(`Automatic scoring could not finish: ${result.error || "Some candidates could not be scored."}`);
        } else {
          setStatus({ busy: false, message: `Automatic scoring could not finish: ${result.error || "Some candidates could not be scored."}` });
        }
      } catch (error) {
        if (current.current !== scope) return;
        if (autoRetries.current < AUTO_RETRY_LIMIT) {
          scheduleAutoRetry(`Automatic scoring could not finish: ${error.message}`);
        } else {
          setStatus({ busy: false, message: `Automatic scoring could not finish: ${error.message}` });
        }
      } finally {
        running.current = false;
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [scope, key, enabled, revision]);
  const retry = () => { attempted.current.clear(); autoRetries.current = 0; setRevision(r => r + 1); };
  return { ...status, retry };
}
