// WS8 Part C — the trigger's only manual step. Candidate reached a schedulable
// stage; HR proposes WHEN, and everything after this is automatic: rank,
// request the top pick, store the full explanation on the record. Shown
// immediately after send so HR can read the ranking on screen right away —
// not a separate step they have to go find.
import { useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { createInterviewRequest } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { displayName } from "@/lib/format";

const DURATIONS = [
  { value: 1800000, label: "30 minutes" },
  { value: 2700000, label: "45 minutes" },
  { value: 3600000, label: "1 hour" },
  { value: 5400000, label: "1.5 hours" },
  { value: 7200000, label: "2 hours" },
];
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export default function ProposeInterviewModal({ open, candidate, position, stageId, stageLabel, onClose }) {
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [durationMs, setDurationMs] = useState(3600000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const close = () => {
    setError(""); setDate(""); setTime(""); setDurationMs(3600000); setResult(null);
    onClose();
  };

  const canSubmit = date && time;
  const submit = async () => {
    if (!canSubmit || !candidate) return;
    setBusy(true);
    setError("");
    try {
      const scheduledAt = new Date(`${date}T${time}`).getTime();
      const res = await createInterviewRequest({
        applicationId: candidate.id, positionId: position.id, stageId,
        candidateName: displayName(candidate), scheduledAt, durationMs, actor: user,
      });
      setResult(res);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!open || !candidate) return null;

  return (
    <Modal
      open={open}
      onClose={close}
      width={560}
      title="Request an interviewer"
      subtitle={`${stageLabel} — ${displayName(candidate)}`}
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit || busy}>{busy ? "Ranking…" : "Send request"}</Button>
          </>
        )
      }
    >
      {error && <p role="alert" className="mb-3 text-sm text-[#DC2626]">{error}</p>}
      {!result ? (
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground">
            Propose a slot. Hyre ranks eligible interviewers by declared availability at this time and current booking load, then requests the top pick.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" required>
              <Input type="date" value={date} min={todayStr()} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time" required>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
          </div>
          <Field label="Duration">
            <Select value={durationMs} onChange={(e) => setDurationMs(Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </Field>
        </div>
      ) : (
        <RequestResult result={result} />
      )}
    </Modal>
  );
}

function RequestResult({ result }) {
  if (result.status === "needs_attention") {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-lg border border-[#F0DFA6] bg-[#FBF1DC] px-3.5 py-3 text-[13px] text-[#8A6314] dark:border-[#5a4a1a] dark:bg-[#3a2f0f] dark:text-[#F5D77E]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{result.poolReason || "No eligible interviewer was found."} Assign someone manually from this candidate's Interview panel — that works standalone, any time.</span>
        </div>
        {result.excludedCandidates.length > 0 && <ExclusionList excluded={result.excludedCandidates} />}
      </div>
    );
  }
  const top = result.rankedCandidates[0];
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-[#16A34A]/30 bg-[#E7F6EC] px-3.5 py-3 text-[13px] text-[#15803D] dark:bg-[#16A34A]/15">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
        <span><b>{top.name}</b> was requested.</span>
      </div>
      <div>
        <div className="mb-1.5 text-[11px] font-bold tracking-wide text-muted-foreground">WHY {top.name.toUpperCase()} WAS RANKED FIRST</div>
        <ul className="space-y-1 text-[13px] text-foreground">
          {top.reasons.map((r, i) => (
            <li key={i} className="flex gap-2"><span className="shrink-0 text-muted-foreground">·</span>{r}</li>
          ))}
        </ul>
      </div>
      {result.rankedCandidates.length > 1 && (
        <details className="text-[12px] text-muted-foreground">
          <summary className="cursor-pointer font-semibold">{result.rankedCandidates.length - 1} more in the ranking, if {top.name} declines</summary>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            {result.rankedCandidates.slice(1).map((r) => <li key={r.uid}>{r.name}</li>)}
          </ol>
        </details>
      )}
      {result.excludedCandidates.length > 0 && <ExclusionList excluded={result.excludedCandidates} />}
    </div>
  );
}

function ExclusionList({ excluded }) {
  return (
    <details className="text-[12px] text-muted-foreground">
      <summary className="cursor-pointer font-semibold">{excluded.length} interviewer{excluded.length === 1 ? "" : "s"} not eligible</summary>
      <ul className="mt-1.5 list-disc space-y-1 pl-4">
        {excluded.map((e) => <li key={e.uid}>{e.name} — {e.reason}</li>)}
      </ul>
    </details>
  );
}
