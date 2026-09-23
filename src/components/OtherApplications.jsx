import { useEffect, useState } from "react";
import { useHyreData, getOtherActiveApplications, recordCandidatePreference, subscribeCandidatePreferences } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { crossRejectActive, canCrossRejectFromStage } from "@/lib/crossRejection";
import { stageLabelOf } from "@/lib/stages";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";

export default function OtherApplications({ candidate, positionTitle }) {
  const { user } = useAuth();
  const { candidates, positions } = useHyreData();
  const [rows, setRows] = useState([]), [loading, setLoading] = useState(true);
  const [reviewed, setReviewed] = useState(null), [choice, setChoice] = useState("undecided");
  const [selected, setSelected] = useState(""), [note, setNote] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [decisions, setDecisions] = useState([]);
  const allowed = user?.role === "HR" && crossRejectActive(candidate) && canCrossRejectFromStage(candidate);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getOtherActiveApplications(candidate.personId, candidate.positionId)
      .then(data => { if (alive) setRows(data); })
      .catch(() => { if (alive) setError("Could not load other applications. Reopen the candidate to retry."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [candidate.personId, candidate.positionId, candidates, positions]);
  useEffect(() => subscribeCandidatePreferences(candidate.personId, setDecisions, () => setError("Could not load preference history.")), [candidate.personId]);
  const open = () => {
    setReviewed([{ ...candidate, positionTitle }, ...rows]);
    setChoice("undecided"); setSelected(candidate.id); setNote(""); setError(""); setNotice("");
  };
  const confirm = async () => {
    setBusy(true); setError("");
    try {
      await recordCandidatePreference(candidate.id, reviewed.map(a => a.id), { choice, selectedApplicationId: selected, note, actor: user });
      setNotice(choice === "one" ? "Candidate preference recorded. The other applications were withdrawn." : "Candidate preference recorded. All applications remain active.");
      setReviewed(null);
    } catch (e) { setError(e.message || "Could not save the preference."); }
    finally { setBusy(false); }
  };
  const withdrawn = choice === "one" ? (reviewed || []).filter(a => a.id !== selected) : [];
  return <section className="space-y-3 rounded-lg border border-border p-4">
    <h3 className="text-sm font-bold">Position preference</h3>
    {notice && <p role="status" className="text-sm">{notice}</p>}
    {!reviewed && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <h4 className="text-sm font-medium">Other Positions Applied To</h4>
    {loading ? <p className="text-sm text-muted-foreground">Loading other applications…</p> : !rows.length ? <p className="text-sm text-muted-foreground">No other active applications.</p> : <>
      <ul className="space-y-2">{rows.map(row => <li key={row.id} className="text-sm"><strong>{row.positionTitle}</strong> · {stageLabelOf(row.stage)} · Active</li>)}</ul>
      <p className="text-sm text-muted-foreground">Ask during the online conversation whether the candidate wants to continue with all positions or focus on one. An undecided preference does not block moving stages.</p>
      <Button disabled={!allowed || loading || busy} onClick={open}>Record candidate’s choice</Button>
      {!allowed && <p className="text-xs text-muted-foreground">HR can record this decision from HR Screening onward.</p>}
    </>}
    {!!decisions.length && <details><summary className="cursor-pointer text-sm font-medium">Recorded preferences</summary><ul className="mt-2 space-y-3">{decisions.map(d => <li key={d.id} className="text-sm"><strong>{d.choice === "one" ? `Continue only with ${positions.find(p => p.id === candidates.find(a => a.id === d.selectedApplicationId)?.positionId)?.title || d.selectedPositionTitle}` : d.choice === "both" ? "Continue with all active positions" : "Not decided yet"}</strong><p className="text-xs text-muted-foreground">Recorded by {d.by} · {new Date(d.at).toLocaleString()}</p>{d.note && <p>{d.note}</p>}</li>)}</ul><p className="mt-2 text-xs text-muted-foreground">Previous withdrawals are not reopened automatically when a later preference is recorded.</p></details>}
    <Modal open={!!reviewed} onClose={() => { if (!busy) setReviewed(null); }} title="Record candidate’s choice" footer={<><Button variant="ghost" disabled={busy} onClick={() => setReviewed(null)}>Cancel</Button><Button disabled={busy || (choice === "one" && !selected)} onClick={confirm}>{busy ? "Saving…" : "Confirm choice"}</Button></>}>
      <div role="dialog" aria-label="Record candidate preference" className="space-y-4">
        <p className="text-sm">Record the choice the candidate confirmed during your conversation.</p>
        <fieldset disabled={busy} className="space-y-3"><legend className="mb-2 text-sm font-semibold">Candidate’s preference</legend>
          <label className="flex gap-2 text-sm"><input type="radio" name="preference" checked={choice === "both"} onChange={() => setChoice("both")} />{reviewed?.length === 2 ? "Continue with both" : "Continue with all active positions"}</label>
          <label className="flex gap-2 text-sm"><input type="radio" name="preference" checked={choice === "one"} onChange={() => setChoice("one")} />Continue only with one position</label>
          {choice === "one" && <label className="block text-sm">Position to keep<select aria-label="Position to keep" value={selected} onChange={e => setSelected(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-card p-2">{reviewed?.map(a => <option key={a.id} value={a.id}>{a.positionTitle}</option>)}</select></label>}
          <label className="flex gap-2 text-sm"><input type="radio" name="preference" checked={choice === "undecided"} onChange={() => setChoice("undecided")} />Not decided yet</label>
        </fieldset>
        {!!withdrawn.length ? <div className="rounded-lg bg-muted p-3 text-sm"><strong>Will be withdrawn — candidate preference:</strong><ul className="mt-2 list-disc pl-5">{withdrawn.map(a => <li key={a.id}>{a.positionTitle}{a.id === candidate.id ? " (current application)" : ""}</li>)}</ul><p className="mt-2">No rejection or score will be recorded. This applies to the applications listed here.</p></div> : <p className="text-sm">All applications will remain active.</p>}
        <label className="block text-sm font-medium">Note (optional)<Textarea disabled={busy} value={note} onChange={e => setNote(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </Modal>
  </section>;
}
