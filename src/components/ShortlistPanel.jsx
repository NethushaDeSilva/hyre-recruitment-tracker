// WS5 5.5/5.8 — "HR sees applications for a vacancy ranked by score, with a
// threshold control cutting 100 CVs to a workable shortlist... it is the
// product." Scoped to the Applied stage (scores are computed once, at apply
// time, before any human review moves someone on).
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, RefreshCw, AlertCircle, ExternalLink, SlidersHorizontal, Settings2 } from "lucide-react";
import { sortApplications } from "../../functions/_lib/filtration/engine.js";
import { isScoreStale, staleReason, notScoredReason, scorePillClass } from "@/lib/scoreStaleness";
import { rescoreVacancy } from "@/data/store";
import { displayName } from "@/lib/format";
import { openDataUrl } from "@/lib/file";
import { Avatar } from "@/components/ui/Avatar";
import ScoreBreakdown from "@/components/ScoreBreakdown";

function NotScoredRow({ c, scoreDoc, position, onRetry }) {
  const reason = notScoredReason(scoreDoc, position);
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-background px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={displayName(c)} color={c.avatarColor} size={32} />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{displayName(c)}</div>
          <div className="flex items-center gap-1 text-[11px] text-[#DC2626]">
            <AlertCircle size={11} /> Not scored — {reason}
          </div>
        </div>
      </div>
      <button onClick={onRetry} className="shrink-0 text-xs font-semibold text-primary hover:underline">Retry</button>
    </div>
  );
}

export default function ShortlistPanel({ position, applications, scores, onOpenCandidate, onEditPosition }) {
  const [threshold, setThreshold] = useState(0);
  const [expanded, setExpanded] = useState(null); // application id
  const [rescoring, setRescoring] = useState(false);
  const [rescoreMsg, setRescoreMsg] = useState("");

  const scoreFor = (id) => scores.get(id) || null;

  const { rankedScored, notScored, staleCount } = useMemo(() => {
    const entries = applications.map((c) => {
      const s = scoreFor(c.id);
      return { candidateId: c.id, status: s?.status === "scored" ? "scored" : "unscored", result: s?.status === "scored" ? s : undefined, c, scoreDoc: s };
    });
    const sorted = sortApplications(entries);
    const scored = sorted.filter((e) => e.status === "scored");
    const unscored = sorted.filter((e) => e.status !== "scored");
    return {
      rankedScored: scored,
      notScored: unscored,
      staleCount: scored.filter((e) => isScoreStale(e.scoreDoc)).length,
    };
  }, [applications, scores]);

  // 5.8: genuinely-tied candidates (same overallScore AND same core-skills
  // score) share a rank number rather than an invented ordinal.
  const ranks = useMemo(() => {
    const map = new Map();
    let rank = 0;
    let lastKey = null;
    rankedScored.forEach((e, i) => {
      const key = `${e.result.overallScore}:${e.result.breakdown.coreSkills.score}`;
      if (key !== lastKey) rank = i + 1;
      map.set(e.candidateId, rank);
      lastKey = key;
    });
    return map;
  }, [rankedScored]);

  const visible = rankedScored.filter((e) => e.result.overallScore >= threshold);
  const hiddenByThreshold = rankedScored.length - visible.length;

  const runRescore = async () => {
    setRescoring(true);
    setRescoreMsg("");
    const res = await rescoreVacancy(position.id);
    setRescoring(false);
    setRescoreMsg(res.ok ? `Re-scored ${res.scored} application${res.scored === 1 ? "" : "s"}${res.failed ? `, ${res.failed} failed` : ""}.` : res.error);
  };

  if (!position.requirements) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-[#F0DFA6] bg-[#FBF1DC] p-4 text-[13px] text-[#8A6314] dark:border-[#5a4a1a] dark:bg-[#3a2f0f] dark:text-[#F5D77E]">
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p className="font-semibold">Not scored — this vacancy has no requirements set.</p>
          <p>Filtration compares the vacancy's stated requirements against each CV. Add required skills to enable scoring for these {applications.length} application{applications.length === 1 ? "" : "s"}.</p>
          <button onClick={onEditPosition} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
            <Settings2 size={13} /> Edit position
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={14} className="text-muted-foreground" />
          <label className="text-xs font-semibold text-foreground">Shortlist threshold</label>
          <input
            type="range" min={0} max={100} step={5} value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-32 accent-primary"
          />
          <span className="w-10 text-xs font-bold tabular-nums text-foreground">{threshold}+</span>
          {hiddenByThreshold > 0 && <span className="text-[11px] text-muted-foreground">({hiddenByThreshold} below cut)</span>}
        </div>
        <div className="flex items-center gap-2">
          {staleCount > 0 && (
            <span className="rounded bg-[#FBF1DC] px-1.5 py-0.5 text-[10px] font-bold text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]">
              {staleCount} stale
            </span>
          )}
          <button
            onClick={runRescore}
            disabled={rescoring}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/[0.06] px-2.5 py-1 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <RefreshCw size={12} className={rescoring ? "animate-spin" : ""} /> {rescoring ? "Re-scoring…" : "Re-score all"}
          </button>
        </div>
      </div>
      {rescoreMsg && <p className="text-xs text-muted-foreground">{rescoreMsg}</p>}

      <div className="space-y-2">
        {visible.map((e) => {
          const isOpen = expanded === e.candidateId;
          const stale = isScoreStale(e.scoreDoc);
          return (
            <div key={e.candidateId} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center text-sm font-extrabold text-muted-foreground">#{ranks.get(e.candidateId)}</span>
                <Avatar name={displayName(e.c)} color={e.c.avatarColor} size={36} />
                <button onClick={() => onOpenCandidate(e.c)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground hover:text-primary">{displayName(e.c)}</span>
                    {stale && (
                      <span title={staleReason(e.scoreDoc)} className="rounded bg-[#FBF1DC] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]">
                        Stale
                      </span>
                    )}
                  </div>
                </button>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${scorePillClass(e.result.overallScore)}`}>{e.result.overallScore}</span>
                {e.c.cvDataUrl && (
                  <button onClick={() => openDataUrl(e.c.cvDataUrl)} title="View source CV" className="shrink-0 text-muted-foreground hover:text-primary">
                    <ExternalLink size={15} />
                  </button>
                )}
                <button onClick={() => setExpanded(isOpen ? null : e.candidateId)} className="shrink-0 text-muted-foreground hover:text-foreground">
                  {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>
              {isOpen && <div className="mt-3"><ScoreBreakdown score={e.result} /></div>}
            </div>
          );
        })}
        {visible.length === 0 && rankedScored.length === 0 && notScored.length === 0 && (
          <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">No applications yet.</div>
        )}
      </div>

      {notScored.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Not scored ({notScored.length})</div>
          {notScored.map((e) => (
            <NotScoredRow key={e.candidateId} c={e.c} scoreDoc={e.scoreDoc} position={position} onRetry={runRescore} />
          ))}
        </div>
      )}
    </div>
  );
}
