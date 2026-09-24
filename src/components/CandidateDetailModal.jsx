import OtherApplications from "@/components/OtherApplications";
import ScoreBreakdown from "@/components/ScoreBreakdown";
// Full CV / application detail for a candidate — opened from the candidates
// table and the board. Shows every structured field, the attached CV, the
// rejection record (if any) and the full audit history of pipeline decisions.
import { useState } from "react";
import { Download, ExternalLink, FileText, Mail, Phone, MapPin, Linkedin, RotateCcw, Ban, LogIn, ArrowRight, ArrowRightLeft, Check, UserPlus, MessageSquare, Send, Trash2, AlertTriangle, Star, Briefcase } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea, Input } from "@/components/ui/Field";
import RichCommentEditor from "@/components/ui/RichCommentEditor";
import SafeHtml from "@/components/ui/SafeHtml";
import { isSanitizedCommentEmpty } from "@/lib/sanitizeHtml";
import { StageBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import { can } from "@/lib/permissions";
import { stageLabelOf, canAdvanceStageFor, nextStage, resolveStage } from "@/lib/stages";
import { formatDate, displayName } from "@/lib/format";
import { downloadDataUrl, openDataUrl, humanSize } from "@/lib/file";
import { reconsiderCandidate, addComment, deleteComment, advanceStage, saveAcceptedOffer } from "@/data/store";
import { meetsShortlistThreshold, evaluateReviewGate } from "@/lib/scoreStaleness";
import InterviewStatusPanel from "@/components/InterviewStatusPanel";

const OFFER_STATUS_TONE = { sent: "#2563EB", accepted: "#16A34A", declined: "#DC2626", negotiating: "#A9781A" };
const OFFER_STATUS_LABEL = { sent: "Sent — awaiting response", accepted: "Accepted", declined: "Declined", negotiating: "Negotiating" };

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

// Current WS4 shape splits awardType/field apart (a combined "degree" string
// let extraction lose the field entirely — see CLAUDE.md WS4). Legacy
// candidates parsed before that fix only have `degree`, which still renders
// correctly here.
const degreeLabel = (e) => (e.awardType ? `${e.awardType}${e.field ? ` in ${e.field}` : ""}` : e.degree || "");

const RECOMMENDATIONS = [
  { id: "advance", label: "Advance", tone: "#16A34A" },
  { id: "hold", label: "Hold", tone: "#A9781A" },
  { id: "reject", label: "Reject", tone: "#DC2626" },
];
const recommendationOf = (id) => RECOMMENDATIONS.find((r) => r.id === id) || null;

// Turn a history entry into an icon + human sentence.
function describe(e) {
  switch (e.type) {
    case "apply": return { icon: UserPlus, tone: "#64748B", text: "Applied" };
    case "stage": return { icon: ArrowRight, tone: "#2563EB", text: `Moved ${stageLabel(e.from)} → ${stageLabel(e.to)}` };
    case "hire": return { icon: Check, tone: "#16A34A", text: `Hired (from ${stageLabel(e.from)})` };
    case "withdraw": return { icon: LogIn, tone: "#64748B", text: "Withdrawn ? candidate preference" };
    case "reject": return { icon: Ban, tone: "#DC2626", text: `Rejected at ${stageLabel(e.from)}${e.reason ? ` — ${e.reason}` : ""}` };
    case "reconsider": return { icon: RotateCcw, tone: "#7C3AED", text: "Moved back into review" };
    case "offer": return { icon: Briefcase, tone: OFFER_STATUS_TONE[e.status] || "#2563EB", text: `Offer ${e.status === "sent" ? "sent" : OFFER_STATUS_LABEL[e.status]?.toLowerCase() || e.status}` };
    default: return { icon: LogIn, tone: "#64748B", text: e.type };
  }
}

export default function CandidateDetailModal({ open, onClose, candidate, position, positionTitle, mustReview = false, scoreDoc = null, onSchedule }) {
  const { user } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState("");
  const [score, setScore] = useState("");
  const [posting, setPosting] = useState(false);
  const [moving, setMoving] = useState(false);
  const [offerSalary, setOfferSalary] = useState("");
  const [offerBusy, setOfferBusy] = useState(false);
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
  // terminal stages) — unconditionally, regardless of threshold. Each user gets
  // ONE comment per stage — they may delete it (before the move is confirmed)
  // and re-add.
  const isTerminal = c.stage === "hired" || c.stage === "rejected" || c.stage === "withdrawn";
  const isApplied = c.stage === "applied";
  const scoreRequired = !isTerminal && !isApplied;
  const myComment = comments.find((cm) => (cm.byUid || cm.by) === myId && cm.stage === c.stage);
  // WS8 §4 (corrected) — the threshold-relative comment rule is scoped to the
  // Applied column's own move-out decision ONLY, mirroring its green/red
  // colour (meetsShortlistThreshold) exactly. Every stage after Applied keeps
  // comment text unconditionally mandatory, same as score — the threshold
  // never reaches those; it's display (colour) and Applied-move only there.
  const commentRequired = isApplied ? !meetsShortlistThreshold(scoreDoc, position) : scoreRequired;
  const scoreOk = !scoreRequired || (score !== "" && Number(score) >= 0 && Number(score) <= 100);
  const canPost = canComment && !isTerminal && !myComment;
  const hasScoredReview = !!(myComment && myComment.score != null); // copy only — which banner text to show

  // Move to next stage — right here in the pop-out, so reviewing and advancing a
  // candidate (e.g. one clicked from an AI-filtered shortlist) never needs closing
  // this modal and finding them again elsewhere. Only shown when the caller passed
  // a `position` (PositionDetail does; the cross-position CandidatesTable/Employees
  // views don't, so this stays hidden there) and this user may act on this stage.
  const mayMove = !!position && !isTerminal && canAdvanceStageFor(user, position, c.stage);
  const nextId = position ? nextStage(position.stages, c.stage) : null;
  const nextLabel = nextId ? resolveStage(position, nextId)?.label : null;
  const offerRequired = nextId === "hired" && c.offer?.status !== "accepted"; // ties the loop closed
  // The SAME evaluateReviewGate() call advanceStage() makes server-side —
  // not a hand-rolled re-check — so this can never drift from what the
  // actual move will do. Re-evaluated on every render, so a threshold change
  // between leaving the review and clicking Move re-gates against the
  // CURRENT threshold, same as the server does.
  const moveBlocked = !evaluateReviewGate({ stage: c.stage, review: myComment, score: scoreDoc, position }).ok || offerRequired;

  const reconsider = async () => {
    await reconsiderCandidate(c.id, actor);
    onClose();
  };

  const submitOffer = async () => {
    if (!offerSalary.trim()) return;
    setOfferBusy(true);
    try {
      await saveAcceptedOffer(c.id, { salary: offerSalary, actor });
      setOfferSalary("");
      toast.success("Accepted offer saved.");
    } catch (error) { toast.error(error.message || "Could not save accepted offer."); }
    finally { setOfferBusy(false); }
  };

  const postComment = async () => {
    if ((commentRequired && isSanitizedCommentEmpty(draft)) || !scoreOk) return;
    setPosting(true);
    await addComment(c.id, {
      text: draft,
      score: scoreRequired ? Number(score) : null,
      actor,
    });
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
    let res;
    try { res = await advanceStage(c.id, actor); }
    catch (error) { toast.error(error.message || "Could not move candidate. Check your stage assignment and interview time."); return; }
    finally { setMoving(false); }
    if (res && res.ok === false) { if (res.error) toast.error(res.error); return; } // e.g. review-required — button stays put
    if (res?.hired) {
      toast.success(res.employeeId ? `${displayName(c)} hired — employee ID ${res.employeeId} issued.` : `${displayName(c)} hired.`);
    }
    // WS8 §5 — the move succeeds on its own now; it no longer forces the
    // Request-an-interviewer modal on landing (that made HR guess a slot with
    // no idea who's free, exactly what the calendar exists to prevent).
    // Requesting an interviewer is now its own action, below, available any
    // time the candidate sits in a schedulable stage.
    onClose(); // done — back to whatever list this was opened from (board or AI results)
  };

  const requestInterviewer = () => {
    if (onSchedule && position) onSchedule({ candidate: c, stageId: c.stage });
  };

  return (
    <Modal open={open} onClose={onClose} width={640} title="Candidate details" subtitle={positionTitle ? `Applied for ${positionTitle}` : ""}>
      <div className="space-y-6">
        {/* header */}
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={displayName(c)} color={c.avatarColor} size={52} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-extrabold text-foreground">{displayName(c)}</span>
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
              {c.needsReview && (
                <span className="rounded-md bg-[#FBF1DC] px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]" title={c.cvValidation?.reason || "CV validation was borderline — worth a second look"}>
                  Needs review
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

        {c.stage === "screening" && <p className="rounded-lg bg-secondary p-3 text-sm">To move forward from HR Screening, you must be an assigned HR recruiter with a saved interview date and time in Configure stages.</p>}

        {open && <OtherApplications key={c.id} candidate={c} positionTitle={position?.title || positionTitle || c.appliedRole || c.positionId} />}

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
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3">
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
          {mustReview && moveBlocked && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-[#FBE9E9] px-3 py-2.5 text-[13px] font-semibold text-[#B91C1C]">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {isApplied
                ? "This candidate's score doesn't meet the shortlist threshold (or isn't scored yet) — add a comment below before moving them out of Applied."
                : !hasScoredReview
                ? "Add your comment and a score below before you can move this candidate to the next stage."
                : "Add a comment below before you can move this candidate to the next stage."}
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
                      {cm.recommendation && recommendationOf(cm.recommendation) && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                          style={{ background: `${recommendationOf(cm.recommendation).tone}18`, color: recommendationOf(cm.recommendation).tone }}
                        >
                          {recommendationOf(cm.recommendation).label}
                        </span>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">{stageLabel(cm.stage)} · {formatDate(cm.at)}</span>
                      {deletable && (
                        <button onClick={removeMyComment} title="Delete your comment" className="text-muted-foreground hover:text-[#DC2626]">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {cm.text ? (
                      <SafeHtml html={cm.text} className="mt-1.5 text-sm text-foreground [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_p:last-child]:mb-0" />
                    ) : cm.score != null ? (
                      <p className="mt-1.5 text-sm italic text-muted-foreground">No comment left — score met the shortlist threshold.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {/* one review per user per stage — hidden once you've left yours (delete it to redo) */}
          {canPost ? (
            <div className="mt-3 space-y-2">
              <RichCommentEditor
                value={draft}
                onChange={setDraft}
                maxLength={1000}
                placeholder={commentRequired ? "Add your comment on this candidate…" : "Add an optional comment on this candidate…"}
              />
              <p className="text-xs text-muted-foreground">
                {isApplied
                  ? commentRequired
                    ? "Comment required — this score doesn't meet the shortlist threshold (or isn't scored yet)."
                    : "Comment optional — this score meets the shortlist threshold."
                  : "Comment required for every move past Applied."}
              </p>
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
                <Button onClick={postComment} disabled={(commentRequired && isSanitizedCommentEmpty(draft)) || !scoreOk || posting}>
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

        {!isTerminal && (c.offer || (user?.role === "Management" && nextId === "hired")) && (
          <div className="rounded-lg border border-border bg-background p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">
              <Briefcase size={13} /> Accepted Offer
            </div>
            {c.offer?.status === "accepted" ? <Row label="Salary" value={c.offer.salary} /> : user?.role === "Management" && nextId === "hired" ? (
              <div className="space-y-2">
                <Input aria-label="Accepted salary" value={offerSalary} onChange={e => setOfferSalary(e.target.value)} placeholder="Enter agreed salary" />
                <p className="text-xs text-muted-foreground">Record the salary already agreed with the candidate.</p>
                <div className="flex justify-end">
                  <Button onClick={submitOffer} disabled={!offerSalary.trim() || offerBusy}>{offerBusy ? "Saving..." : "Save accepted offer"}</Button>
                </div>
              </div>
            ) : <p className="text-sm text-muted-foreground">Management must record the accepted salary before hiring.</p>}
          </div>
        )}

        {/* move to next stage — right here, no need to leave the pop-out */}
        {mayMove && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-4">
            <p className="text-[13px]">
              {offerRequired ? (
                <span className="font-semibold text-[#B91C1C]">{displayName(c)} needs an accepted offer before they can be hired.</span>
              ) : moveBlocked ? (
                <span className="font-semibold text-[#B91C1C]">
                  {isApplied
                    ? <>This score doesn't meet the shortlist threshold (or isn't scored yet) — add a comment above before moving {displayName(c)} out of Applied.</>
                    : !hasScoredReview
                    ? <>Add your comment and a score above before moving {displayName(c)} on.</>
                    : <>Add a comment above before moving {displayName(c)} on.</>}
                </span>
              ) : (
                <span className="text-foreground">
                  Ready to move <span className="font-semibold">{displayName(c)}</span> to <span className="font-semibold">{nextLabel || "the next stage"}</span>?
                </span>
              )}
            </p>
            <Button onClick={moveNext} disabled={moveBlocked || moving} className="shrink-0">
              {moving ? "Moving…" : <>Move to {nextLabel || "next stage"} <ArrowRight size={14} /></>}
            </Button>
          </div>
        )}

        {scoreDoc?.status === "scored" && <ScoreBreakdown score={scoreDoc} position={position} candidate={c} />}
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

        {c.emailMismatch && c.emailFromCv && (
          <div className="flex items-start gap-2 rounded-lg border border-[#F0DFA6] bg-[#FBF1DC] p-3 text-[13px] text-[#8A6314] dark:border-[#5a4a1a] dark:bg-[#3a2f0f] dark:text-[#F5D77E]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>The email on file in their CV ({c.emailFromCv}) differs from the one they typed ({c.email}). The typed email is used as primary.</span>
          </div>
        )}

        {c.cvTruncation?.applied && (
          <div className="flex items-start gap-2 rounded-lg border border-[#F0DFA6] bg-[#FBF1DC] p-3 text-[13px] text-[#8A6314] dark:border-[#5a4a1a] dark:bg-[#3a2f0f] dark:text-[#F5D77E]">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>This CV was unusually long, so only the beginning and end were read in full — content from the middle may be missing from what was checked and extracted.</span>
          </div>
        )}

        {/* WS4 — full structured CV extraction, alongside the derived summary above */}
        {c.education?.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Education</div>
            <ul className="space-y-1">
              {c.education.map((e, i) => (
                <li key={i} className="text-sm text-foreground">
                  {degreeLabel(e)}{e.institution ? ` — ${e.institution}` : ""}{e.year ? ` (${e.year})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
        {c.experienceEntries?.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Work history</div>
            <ul className="space-y-2">
              {c.experienceEntries.map((e, i) => (
                <li key={i} className="text-sm text-foreground">
                  <span className="font-medium">{e.title}</span>{e.company ? ` at ${e.company}` : ""}
                  {(e.startDate || e.endDate) && (
                    <span className="text-muted-foreground"> · {e.startDate || "?"} – {e.endDate || "present"}</span>
                  )}
                  {e.summary && <div className="text-xs text-muted-foreground">{e.summary}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(c.certifications?.length > 0 || c.languages?.length > 0) && (
          <div className="grid grid-cols-2 gap-4">
            <Row label="Certifications" value={c.certifications?.join(", ")} />
            <Row label="Languages" value={c.languages?.join(", ")} />
          </div>
        )}

        {c.linkedIn && (
          <div className="space-y-0.5">
            <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">LinkedIn / portfolio</div>
            <a href={c.linkedIn} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
              <Linkedin size={14} /> {c.linkedIn}
            </a>
          </div>
        )}
        <Row label="Cover note" value={c.coverNote} />

        <InterviewStatusPanel candidate={c} position={position} onRequestInterviewer={onSchedule ? requestInterviewer : null} />

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
                      {e.comment && <SafeHtml html={e.comment} className="mt-0.5 text-xs italic text-muted-foreground [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-4 [&_ol]:pl-4 [&_p:last-child]:mb-0" />}
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
