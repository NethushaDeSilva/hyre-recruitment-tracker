// Full CV / application detail for a candidate — opened from the candidates
// table and the board. Shows every structured field, the attached CV, the
// rejection record (if any) and the full audit history of pipeline decisions.
import { useState } from "react";
import { Download, ExternalLink, FileText, Mail, Phone, MapPin, Linkedin, RotateCcw, Ban, LogIn, ArrowRight, ArrowRightLeft, Check, UserPlus, MessageSquare, Send, Trash2, AlertTriangle, Star } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea, Input } from "@/components/ui/Field";
import { StageBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import { can } from "@/lib/permissions";
import { stageLabelOf, canActOnStageFor, nextStage, resolveStage } from "@/lib/stages";
import { formatDate } from "@/lib/format";
import { downloadDataUrl, openDataUrl, humanSize } from "@/lib/file";
import { reconsiderCandidate, addComment, deleteComment, advanceStage } from "@/data/store";

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

const stageLabel = (id) => stageLabelOf(id);

// Turn a history entry into an icon + human sentence.
function describe(e) {
  switch (e.type) {
    case "apply": return { icon: UserPlus, tone: "#64748B", text: "Applied" };
    case "stage": return { icon: ArrowRight, tone: "#2563EB", text: `Moved ${stageLabel(e.from)} → ${stageLabel(e.to)}` };
    case "hire": return { icon: Check, tone: "#16A34A", text: `Hired (from ${stageLabel(e.from)})` };
    case "reject": return { icon: Ban, tone: "#DC2626", text: `Rejected at ${stageLabel(e.from)}${e.reason ? ` — ${e.reason}` : ""}` };
    case "reconsider": return { icon: RotateCcw, tone: "#7C3AED", text: "Moved back into review" };
    default: return { icon: LogIn, tone: "#64748B", text: e.type };
  }
}

export default function CandidateDetailModal({ open, onClose, candidate, position, positionTitle, mustReview = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [score, setScore] = useState("");
  const [posting, setPosting] = useState(false);
  const [moving, setMoving] = useState(false);
  if (!candidate) return null;
  const c = candidate;
  const rej = c.rejection;
  const actor = user ? { name: user.name, role: user.role, uid: user.uid || user.email || user.name } : null;
  const myId = user?.uid || user?.email || user?.name || "";
  const canManage = can(user?.role, "manageCandidates");
  const canReconsider = can(user?.role, "reconsiderCandidate"); // HR only
  const canComment = can(user?.role, "viewBoard"); // any staff member can leave a note
  const history = [...(c.history || [])].sort((a, b) => b.at - a.at);
  const comments = c.comments || [];

  // Review rules: a score is required for every stage AFTER Applied (and not for
  // terminal stages). Each user gets ONE comment per stage — they may delete it
  // (before the move is confirmed) and re-add.
  const isTerminal = c.stage === "hired" || c.stage === "rejected";
  const scoreRequired = !isTerminal && c.stage !== "applied";
  const myComment = comments.find((cm) => (cm.byUid || cm.by) === myId && cm.stage === c.stage);
  const scoreOk = !scoreRequired || (score !== "" && Number(score) >= 0 && Number(score) <= 100);
  const canPost = canComment && !isTerminal && !myComment;

  // Move to next stage — right here in the pop-out, so reviewing and advancing a
  // candidate (e.g. one clicked from an AI-filtered shortlist) never needs closing
  // this modal and finding them again elsewhere. Only shown when the caller passed
  // a `position` (PositionDetail does; the cross-position CandidatesTable/Employees
  // views don't, so this stays hidden there) and this user may act on this stage.
  const mayMove = !!position && !isTerminal && canActOnStageFor(user, position, c.stage);
  const moveBlocked = scoreRequired && !myComment; // needs their review posted first
  const nextId = position ? nextStage(position.stages, c.stage) : null;
  const nextLabel = nextId ? resolveStage(position, nextId)?.label : null;

  const reconsider = async () => {
    await reconsiderCandidate(c.id, actor);
    onClose();
  };

  const postComment = async () => {
    if (!draft.trim() || !scoreOk) return;
    setPosting(true);
    await addComment(c.id, { text: draft, score: scoreRequired ? Number(score) : null, actor });
    setDraft("");
    setScore("");
    setPosting(false);
  };

  const removeMyComment = async () => {
    if (!myComment) return;
    await deleteComment(c.id, { at: myComment.at, byUid: myId });
  };

  const moveNext = async () => {
    setMoving(true);
    const res = await advanceStage(c.id, actor);
    setMoving(false);
    if (res && res.ok === false) return; // e.g. review-required — button stays put
    if (res?.hired) {
      toast.success(res.employeeId ? `${c.name} hired — employee ID ${res.employeeId} issued.` : `${c.name} hired.`);
    }
    onClose(); // done — back to whatever list this was opened from (board or AI results)
  };

  return (
    <Modal open={open} onClose={onClose} width={640} title="Candidate details" subtitle={positionTitle ? `Applied for ${positionTitle}` : ""}>
      <div className="space-y-6">
        {/* header */}
        <div className="flex items-center gap-3">
          <Avatar name={c.name} color={c.avatarColor} size={52} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold text-foreground">{c.name}</span>
              {c.candidateId && (
                <span className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-muted-foreground" title="Candidate ID">
                  {c.candidateId}
                </span>
              )}
              {c.employeeId && (
                <span className="rounded-md bg-[#16A34A]/12 px-1.5 py-0.5 font-mono text-[11px] font-bold tracking-wide text-[#15803D]" title="Employee ID (issued on hire)">
                  {c.employeeId}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              {c.email && <span className="inline-flex items-center gap-1"><Mail size={13} /> {c.email}</span>}
              {c.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {c.phone}</span>}
              {c.location && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {c.location}</span>}
            </div>
          </div>
          <div className="ml-auto"><StageBadge stageId={c.stage} /></div>
        </div>

        {/* internal role-change context (an existing employee requesting a move) */}
        {c.source === "Role change" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-[#4F46E5]/25 bg-[#4F46E5]/5 p-4">
            <ArrowRightLeft size={18} className="mt-0.5 shrink-0 text-[#4F46E5] dark:text-[#A5B4FC]" />
            <div className="text-[13px] text-foreground">
              <span className="font-semibold">Internal role-change request.</span> Currently{" "}
              <span className="font-semibold">{c.fromRole || "an existing role"}</span>
              {c.fromEmployeeId ? <> · <span className="font-mono">{c.fromEmployeeId}</span></> : null} — requesting a move to this role.
            </div>
          </div>
        )}

        {/* rejection record + talent-pool reconsider */}
        {c.stage === "rejected" && (
          <div className="rounded-lg border border-[#F3D2D2] bg-[#FDF2F2] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-sm font-bold text-[#B91C1C]">
                  <Ban size={15} /> {rej?.reason || "Rejected"}
                </div>
                {rej?.comment && <p className="text-[13px] text-[#7F1D1D]">{rej.comment}</p>}
                <p className="text-xs text-[#B91C1C]/80">
                  {rej?.stage ? `At ${stageLabel(rej.stage)}` : ""}{rej?.at ? ` · ${formatDate(rej.at)}` : ""}{rej?.by ? ` · by ${rej.by}` : ""}
                </p>
              </div>
              {canReconsider && (
                <Button variant="ghost" onClick={reconsider} className="shrink-0">
                  <RotateCcw size={14} /> Reconsider
                </Button>
              )}
            </div>
          </div>
        )}

        {/* CV file */}
        {c.cvDataUrl ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileText size={20} className="shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{c.cvFileName || "CV"}</div>
                {c.cvSize ? <div className="text-xs text-muted-foreground">{humanSize(c.cvSize)}</div> : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => openDataUrl(c.cvDataUrl)}><ExternalLink size={15} /> View</Button>
              <Button variant="subtle" onClick={() => downloadDataUrl(c.cvDataUrl, c.cvFileName || "cv")}><Download size={15} /> Download</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            No CV file attached{c.source === "Added by HR" ? " (added directly by HR)." : "."}
          </div>
        )}

        {/* reviewer comments + score — the review that unlocks moving to the next stage */}
        <div className="rounded-lg border border-border bg-background p-4">
          <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
            <MessageSquare size={13} /> Reviewer comments
            {comments.length > 0 && <span className="text-[#94A3B8]">· {comments.length}</span>}
          </div>

          {/* shown when someone tried to move this candidate without reviewing first */}
          {mustReview && scoreRequired && !myComment && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-[#FBE9E9] px-3 py-2.5 text-[13px] font-semibold text-[#B91C1C]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              Add your comment and a score below before you can move this candidate to the next stage.
            </div>
          )}

          {comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet. Leave your review before moving this candidate on — the next reviewer will see it here.</p>
          ) : (
            <ul className="space-y-3">
              {comments.map((cm, i) => {
                const mine = (cm.byUid || cm.by) === myId;
                const deletable = mine && cm.stage === c.stage; // only before the move is confirmed
                return (
                  <li key={i} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Avatar name={cm.by || "?"} size={22} />
                      <span className="text-[13px] font-semibold text-foreground">{cm.by || "Someone"}</span>
                      {cm.byRole && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{cm.byRole}</span>}
                      {cm.score != null && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#FBF1DC] px-1.5 py-0.5 text-[10px] font-bold text-[#A9781A]">
                          <Star size={10} strokeWidth={2.5} /> {cm.score}/100
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">{stageLabel(cm.stage)} · {formatDate(cm.at)}</span>
                      {deletable && (
                        <button onClick={removeMyComment} title="Delete your comment" className="text-muted-foreground hover:text-[#DC2626]">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-foreground">{cm.text}</p>
                  </li>
                );
              })}
            </ul>
          )}

          {/* one review per user per stage — hidden once you've left yours (delete it to redo) */}
          {canPost ? (
            <div className="mt-3 space-y-2">
              <Textarea
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1000}
                placeholder="Add your comment on this candidate…"
              />
              {scoreRequired && (
                <div className="flex items-center gap-2">
                  <label className="text-[13px] font-semibold text-foreground">Score</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    placeholder="0–100"
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground">out of 100 (required to move on)</span>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={postComment} disabled={!draft.trim() || !scoreOk || posting}>
                  <Send size={14} /> {posting ? "Posting…" : "Post review"}
                </Button>
              </div>
            </div>
          ) : (
            canComment && !isTerminal && myComment && (
              <p className="mt-3 text-xs text-muted-foreground">You've left your review for this stage. Delete it above if you want to change it.</p>
            )
          )}
        </div>

        {/* move to next stage — right here, no need to leave the pop-out */}
        {mayMove && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
            <p className="text-[13px]">
              {moveBlocked ? (
                <span className="font-semibold text-[#B91C1C]">Add your comment and a score above before moving {c.name} on.</span>
              ) : (
                <span className="text-foreground">
                  Ready to move <span className="font-semibold">{c.name}</span> to <span className="font-semibold">{nextLabel || "the next stage"}</span>?
                </span>
              )}
            </p>
            <Button onClick={moveNext} disabled={moveBlocked || moving} className="shrink-0">
              {moving ? "Moving…" : <>Move to {nextLabel || "next stage"} <ArrowRight size={14} /></>}
            </Button>
          </div>
        )}

        {/* structured fields */}
        <div className="grid grid-cols-2 gap-4">
          <Row label="Position" value={positionTitle} />
          <Row label="Source" value={c.source} />
          <Row label="Highest qualification" value={c.highestQualification} />
          <Row label="Field of study" value={c.fieldOfStudy} />
          <Row label="Experience" value={c.experience} />
          <Row label="Applied" value={formatDate(c.appliedAt)} />
          <Row label="Current / recent role" value={c.currentRole} />
          <Row label="Current / recent company" value={c.currentCompany} />
        </div>

        <Row label="Key skills" value={c.skills} />
        {c.linkedIn && (
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">LinkedIn / portfolio</div>
            <a href={c.linkedIn} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Linkedin size={14} /> {c.linkedIn}
            </a>
          </div>
        )}
        <Row label="Cover note" value={c.coverNote} />

        {/* audit history */}
        {history.length > 0 && (
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Recruitment history</div>
            <ol className="space-y-3">
              {history.map((e, i) => {
                const d = describe(e);
                const Icon = d.icon;
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${d.tone}18`, color: d.tone }}>
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-foreground">{d.text}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(e.at)}{e.by ? ` · ${e.by}${e.byRole ? ` (${e.byRole})` : ""}` : ""}
                      </div>
                      {e.score != null && <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-bold text-[#A9781A]"><Star size={11} strokeWidth={2.5} /> Score {e.score}/100</div>}
                      {e.comment && <div className="mt-0.5 text-xs italic text-muted-foreground">“{e.comment}”</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}
