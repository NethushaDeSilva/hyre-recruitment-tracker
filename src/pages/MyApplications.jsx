// Candidate portal — the applications this candidate has submitted, with the
// live stage each one is at plus a simple progress tracker. Read-only:
// candidates can't move themselves along, but they can SEE where they stand and
// get a heads-up when a recruiter moves them.
import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Download, Search, CheckCircle2, PartyPopper, XCircle, ArrowRight } from "lucide-react";
import { useHyreData } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { stageInfo, stageLabelOf } from "@/lib/stages";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StageBadge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/format";
import { downloadDataUrl } from "@/lib/file";
import { cn } from "@/lib/utils";

const seenKey = (id) => `hyre-seen-${id}`;

export default function MyApplications() {
  const { user } = useAuth();
  const { positions, candidates, loading } = useHyreData();

  const mine = useMemo(() => {
    const all = candidates
      .filter((c) => (c.submittedByUid && c.submittedByUid === user?.uid) || c.email === user?.email)
      .sort((a, b) => b.appliedAt - a.appliedAt);
    // Being hired is TERMINAL: once someone is hired, drop any leftover in-progress
    // rows so they only ever see their hire plus any genuine past rejections — an
    // "Applied / in review" row can no longer coexist with a hire.
    const hired = all.some((c) => c.stage === "hired");
    return hired ? all.filter((c) => c.stage === "hired" || c.stage === "rejected") : all;
  }, [candidates, user]);

  // What stage did we last show this candidate? If it changed since, we flag an
  // update. Read happens during render (old value); the effect below stores the
  // new value, so each change is announced once — and live if it happens now.
  const prevStage = useMemo(() => {
    const map = {};
    for (const c of mine) {
      try { map[c.id] = localStorage.getItem(seenKey(c.id)); } catch { /* ignore */ }
    }
    return map;
  }, [mine]);

  useEffect(() => {
    for (const c of mine) {
      try { localStorage.setItem(seenKey(c.id), c.stage); } catch { /* ignore */ }
    }
  }, [mine]);

  const titleFor = (positionId) => positions.find((p) => p.id === positionId)?.title || "Position";
  const posFor = (positionId) => positions.find((p) => p.id === positionId);

  return (
    <div className="p-4 sm:p-7">
      <div className="space-y-1.5">
        <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">My applications</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {loading ? "Loading…" : `${mine.length} ${mine.length === 1 ? "application" : "applications"} submitted`}
        </p>
      </div>

      {loading ? (
        <div className="mt-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : mine.length === 0 ? (
        <Card className="mt-6 flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
            <Search size={24} />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">
            You haven't applied to anything yet. Browse the{" "}
            <Link to="/jobs" className="font-semibold text-primary underline">open roles</Link> to get started.
          </p>
        </Card>
      ) : (
        <div className="mt-6 space-y-3">
          {mine.map((c) => {
            const pos = posFor(c.positionId);
            const moved = prevStage[c.id] && prevStage[c.id] !== c.stage;
            return (
              <Card key={c.id} className="space-y-4 p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <div className="text-[16px] font-bold text-foreground">{titleFor(c.positionId)}</div>
                    <div className="text-[13px] font-medium text-muted-foreground">
                      Applied {formatDate(c.appliedAt)}
                      {c.cvFileName && <> · CV attached</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.cvDataUrl && (
                      <Button variant="ghost" onClick={() => downloadDataUrl(c.cvDataUrl, c.cvFileName)}>
                        <Download size={15} /> CV
                      </Button>
                    )}
                    <StageBadge stageId={c.stage} />
                  </div>
                </div>

                {/* heads-up when the recruiter has just moved this application */}
                {moved && <UpdateNotice stage={c.stage} />}

                {/* progress tracker */}
                {c.stage === "rejected" ? (
                  <p className="text-[13px] font-medium text-muted-foreground">
                    This application wasn't successful this time — but you're kept in our talent pool for future roles.
                  </p>
                ) : (
                  <ProgressTrack stages={pos?.stages || []} current={c.stage} />
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// A small horizontal stepper across the position's stages, current one filled.
function ProgressTrack({ stages, current }) {
  if (!stages.length) return null;
  const curIdx = stages.indexOf(current);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {stages.map((s, i) => {
        const stage = stageInfo(s);
        if (!stage) return null;
        const done = curIdx >= 0 && i < curIdx;
        const isCurrent = i === curIdx;
        return (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : done
                  ? "bg-[#E7F6EC] text-[#16A34A] dark:bg-[#16A34A]/15"
                  : "bg-secondary text-muted-foreground"
              )}
            >
              {done && <CheckCircle2 size={11} strokeWidth={2.5} />}
              {stage.label}
            </span>
            {i < stages.length - 1 && <ArrowRight size={12} className="text-[#94A3B8]" />}
          </span>
        );
      })}
    </div>
  );
}

// The "you've moved" banner — tone depends on where they landed.
function UpdateNotice({ stage }) {
  if (stage === "hired") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[#E7F6EC] px-3 py-2.5 text-[13px] font-semibold text-[#16A34A] dark:bg-[#16A34A]/15">
        <PartyPopper size={16} /> Great news — you've been hired! The team will be in touch.
      </div>
    );
  }
  if (stage === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-[#FBE9E9] px-3 py-2.5 text-[13px] font-semibold text-[#DC2626]">
        <XCircle size={16} /> Update — there's been a change to this application.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2.5 text-[13px] font-semibold text-foreground">
      <CheckCircle2 size={16} className="text-primary" /> Update — you've moved to {stageLabelOf(stage) || "the next stage"}.
    </div>
  );
}
