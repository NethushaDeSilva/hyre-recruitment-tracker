import { scoringRequirements } from "./scoringRequirements";
import { useEffect, useRef, useState } from "react";
import { rescoreVacancy } from "@/data/store";
import { needsAutomaticScore } from "@/lib/automaticScoring";
import { snapshotKey } from "@/lib/rescoreBatch";

export function useAutomaticScoring(position, candidates, scores, enabled) {
  const attempted = useRef(new Set());
  const running = useRef(false);
  const current = useRef("");
  const [status, setStatus] = useState({ busy: false, message: "" });
  const [revision, setRevision] = useState(0);
  const scope = `${position?.id}:${snapshotKey(scoringRequirements(position))}`;
  const pending = candidates.filter(c => needsAutomaticScore(c, position, scores.get(c.id))).map(c => c.id).sort();
  const key = JSON.stringify(pending);
  useEffect(() => {
    current.current = scope;
    attempted.current.clear();
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
      try {
        const result = await rescoreVacancy(position.id, { applicationIds: ids });
        if (current.current === scope) setStatus({ busy: false, message: result.ok ? "Applied candidate scores are up to date." : `Automatic scoring could not finish: ${result.error || "Some candidates could not be scored."}` });
      } catch (error) {
        if (current.current === scope) setStatus({ busy: false, message: `Automatic scoring could not finish: ${error.message}` });
      } finally {
        running.current = false;
        if (current.current) setRevision(r => r + 1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [scope, key, enabled, revision]);
  const retry = () => { attempted.current.clear(); setRevision(r => r + 1); };
  return { ...status, retry };
}
