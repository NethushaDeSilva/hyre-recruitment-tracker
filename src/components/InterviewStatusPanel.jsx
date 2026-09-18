// WS8 Part C — HR's view of where a scheduled interview stands, and the
// standalone override (§15): works whether or not the ranking ever produced
// anyone, so it's the real fallback when it's exhausted, not a feature that
// depends on automation having run first.
import { useEffect, useState } from "react";
import { AlertTriangle, Clock, CheckCircle2, Send, CalendarPlus } from "lucide-react";
import { getInterviewsForApplication, overrideInterviewRequest, listInterviewers } from "@/data/store";
import { stageOwnerRole, resolveStage, isSchedulableStage } from "@/lib/stages";
import { ROLES } from "@/lib/permissions";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { useAuth } from "@/context/AuthContext";

// WS8 §5 — landing in a schedulable stage used to force ProposeInterviewModal
// immediately, before HR had any chance to look at the calendar. Now the
// stage move succeeds on its own and requesting an interviewer is this
// panel's own standalone action (onRequestInterviewer), available any time —
// not just the moment they land here.
export default function InterviewStatusPanel({ candidate, position, onRequestInterviewer }) {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!candidate?.id) return;
    setLoading(true);
    getInterviewsForApplication(candidate.id)
      .then((r) => setRecords(r.sort((a, b) => b.createdAt - a.createdAt)))
      .catch((e) => console.error("getInterviewsForApplication:", e))
      .finally(() => setLoading(false));
  };
  useEffect(load, [candidate?.id]);

  const schedulable = isSchedulableStage(position, candidate?.stage);
  if (loading || (!schedulable && records.length === 0)) return null;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Interview</div>
      {records.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-background px-3.5 py-3 text-[13px]">
          <span className="text-muted-foreground">No interview requested yet.</span>
          {onRequestInterviewer && (
            <Button variant="subtle" onClick={onRequestInterviewer} className="shrink-0 !px-3 !py-1.5 text-xs">
              <CalendarPlus size={13} /> Request an interviewer
            </Button>
          )}
        </div>
      ) : (
        records.map((r) => (
          <InterviewRecord key={r.id} record={r} position={position} actor={user} onChanged={load} />
        ))
      )}
    </div>
  );
}

function InterviewRecord({ record, position, actor, onChanged }) {
  const stage = resolveStage(position, record.stageId);
  const when = new Date(record.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  if (record.status === "confirmed") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-[#16A34A]/30 bg-[#E7F6EC] px-3.5 py-3 text-[13px] text-[#15803D] dark:bg-[#16A34A]/15">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
        <span><b>{stage.label}</b> confirmed with {nameOf(record)} — {when}.</span>
      </div>
    );
  }

  if (record.status === "pending_confirmation") {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card px-3.5 py-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{stage.label}</span>
          <span className="text-muted-foreground">— requested {nameOf(record)}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-[#B45309] dark:text-[#FBBF24]">
            <Clock size={11} /> Waiting {timeAgo(record.requestedAt)}
          </span>
        </div>
        <div className="text-muted-foreground">{when}</div>
      </div>
    );
  }

  if (record.status === "needs_attention") {
    return <NeedsAttention record={record} position={position} stage={stage} when={when} actor={actor} onChanged={onChanged} />;
  }

  // 'completed' or any other terminal value — quiet, historical.
  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3 text-[13px] text-muted-foreground">
      {stage.label} — {record.status} with {nameOf(record)}, {when}.
    </div>
  );
}

const nameOf = (record) => record.rankedCandidates?.find((r) => r.uid === record.interviewerId)?.name || "someone";

function NeedsAttention({ record, position, stage, when, actor, onChanged }) {
  const [pool, setPool] = useState([]);
  const [pickUid, setPickUid] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ownerRole = stageOwnerRole(position, record.stageId);
    listInterviewers()
      .then((list) => setPool(list.filter((p) => p.role === ownerRole || p.role === ROLES.MANAGEMENT)))
      .catch((e) => console.error("listInterviewers:", e));
  }, [position, record.stageId]);

  const assign = async () => {
    if (!pickUid) return;
    setBusy(true);
    await overrideInterviewRequest({
      interviewId: record.id, applicationId: record.applicationId, positionId: record.positionId, stageId: record.stageId,
      candidateName: record.candidateName, interviewerId: pickUid, scheduledAt: record.scheduledAt, durationMs: record.durationMs,
      actor,
    });
    setBusy(false);
    setPickUid("");
    onChanged();
  };

  return (
    <div className="space-y-2.5 rounded-lg border border-[#F0DFA6] bg-[#FBF1DC] px-3.5 py-3 text-[13px] dark:border-[#5a4a1a] dark:bg-[#3a2f0f]">
      <div className="flex items-start gap-2 text-[#8A6314] dark:text-[#F5D77E]">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <span><b>{stage.label} needs attention</b> — {record.poolReason || "no eligible interviewer was found."}</span>
      </div>
      <div className="text-muted-foreground">Proposed for {when}. Assign someone directly:</div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={pickUid} onChange={(e) => setPickUid(e.target.value)} className="!w-auto min-w-[180px] flex-1">
          <option value="">Choose an interviewer…</option>
          {pool.map((p) => <option key={p.uid} value={p.uid}>{p.name}</option>)}
        </Select>
        <Button onClick={assign} disabled={!pickUid || busy} className="shrink-0 !px-3 !py-1.5 text-xs">
          <Send size={13} /> {busy ? "Sending…" : "Request"}
        </Button>
      </div>
    </div>
  );
}
