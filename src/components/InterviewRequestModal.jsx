// WS8 Part C — the interviewer's side of the loop. A pending request is
// answered here: accept books it (becomes a real commitment — the calendar
// already reads /interviews for exactly this), decline mechanically hands it
// to the next ranked person (or surfaces to HR if the ranking is exhausted).
// No cron, no timer — this screen and the waiting-time display ARE the
// replacement for a timeout.
import { useEffect, useState } from "react";
import { Check, X, Clock } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { useHyreData, getPendingInterviewsForStaff, respondToInterviewRequest } from "@/data/store";
import { resolveStage } from "@/lib/stages";
import { timeAgo } from "@/lib/format";

export default function InterviewRequestModal({ open, onClose }) {
  const { user } = useAuth();
  const { positions } = useHyreData();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [lastOutcome, setLastOutcome] = useState(null);

  const load = () => {
    if (!user?.uid) return;
    setLoading(true);
    getPendingInterviewsForStaff(user.uid)
      .then(setRequests)
      .catch((e) => console.error("getPendingInterviewsForStaff:", e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (open) { setLastOutcome(null); load(); } }, [open, user?.uid]);

  const respond = async (id, accept) => {
    setBusyId(id);
    const res = await respondToInterviewRequest(id, { accept, actor: user });
    setBusyId(null);
    if (!accept && res.ok) {
      setLastOutcome(res.status === "needs_attention" ? "No one else was left — HR has been surfaced this one." : "Passed to the next ranked interviewer.");
    }
    load();
  };

  return (
    <Modal open={open} onClose={onClose} width={520} title="Interview requests" subtitle="DevOps interviews waiting on your response">
      <div className="space-y-3">
        {lastOutcome && <p className="rounded-md bg-secondary px-3 py-2 text-[12px] text-muted-foreground">{lastOutcome}</p>}
        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
        {!loading && requests.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing waiting on you.</p>}
        {requests.map((r) => {
          const position = positions.find((p) => p.id === r.positionId);
          const stageLabel = position ? resolveStage(position, r.stageId).label : r.stageId;
          return (
            <div key={r.id} className="space-y-2.5 rounded-lg border border-border bg-card p-3.5">
              <div>
                <div className="text-sm font-bold text-foreground">{r.candidateName || "Candidate"}</div>
                <div className="text-[12px] text-muted-foreground">{position?.title || r.positionId} — {stageLabel}</div>
              </div>
              <div className="text-[13px] text-foreground">
                {new Date(r.scheduledAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                <span className="text-muted-foreground"> · {Math.round(r.durationMs / 60000)} min</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
                  <Clock size={11} /> Waiting {timeAgo(r.requestedAt)}
                </span>
                <div className="ml-auto flex shrink-0 gap-2">
                  <Button variant="ghost" onClick={() => respond(r.id, false)} disabled={busyId === r.id} className="!px-3 !py-1.5 text-xs">
                    <X size={13} /> Decline
                  </Button>
                  <Button onClick={() => respond(r.id, true)} disabled={busyId === r.id} className="!px-3 !py-1.5 text-xs">
                    <Check size={13} /> Accept
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
