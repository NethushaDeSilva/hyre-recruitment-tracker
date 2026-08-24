// Position detail — the pipeline board. Columns = the position's configured
// stages. Recruitment is a multi-stage filter: each stage is owned by a role
// (HR screening → Department review → interviews → Final interview), and only the
// owning role (or Management) can advance/reject a candidate in that stage.
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronRight, Plus, Settings2, Check, ArrowLeft, X, Search, SlidersHorizontal, GitCompare } from "lucide-react";
import { useHyreData, advanceStage, rejectCandidate, bulkReject } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { can, ROLE_LABELS, ROLES } from "@/lib/permissions";
import { resolveStage, canActOnStageFor, assigneesFor, positionVisibleTo, nextStage } from "@/lib/stages";
import { effectiveStatus } from "@/lib/positions";
import { QUALIFICATIONS, EXPERIENCE_RANGES } from "@/lib/application";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate } from "@/lib/format";
import CheckDropdown from "@/components/CheckDropdown";
import AddCandidateModal from "@/components/AddCandidateModal";
import RejectModal from "@/components/RejectModal";
import StageConfigModal from "@/components/StageConfigModal";
import CandidateDetailModal from "@/components/CandidateDetailModal";
import CompareModal from "@/components/CompareModal";
import EligibilityTag from "@/components/EligibilityTag";

export default function PositionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { positions, candidates, loading } = useHyreData();
  const [addOpen, setAddOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false); // reject all selected applicants at once
  const [detail, setDetail] = useState(null);
  const [mustReview, setMustReview] = useState(false); // tells the detail modal to show the "review first" banner
  const [reviewFor, setReviewFor] = useState(null);    // candidate id showing the inline "review first" hint on its card
  // Applied-stage bulk select (HR only) — tick applicants and move them together.
  const [picked, setPicked] = useState(() => new Set());
  // Side-by-side compare (HR & Interviewer) — a separate selection mode.
  const [compareMode, setCompareMode] = useState(false);
  const [compareSet, setCompareSet] = useState(() => new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  // board filters (HR only) — search is live; the multi-select qualification /
  // experience filters take effect when Apply is pressed.
  const [q, setQ] = useState("");
  const [qualDraft, setQualDraft] = useState([]);
  const [expDraft, setExpDraft] = useState([]);
  const [qualActive, setQualActive] = useState([]);
  const [expActive, setExpActive] = useState([]);

  const canConfigure = can(user?.role, "managePositions");
  const isHR = user?.role === ROLES.HR; // board filter + Applied bulk-move are HR-only
  const canCompare = can(user?.role, "compareCandidates"); // HR & Interviewer, NOT Management
  const MAX_COMPARE = 3;
  const actor = user ? { name: user.name, role: user.role, uid: user.uid || user.email || user.name } : null;
  const toast = useToast();

  const position = positions.find((p) => p.id === id);
  if (loading) {
    return <div className="grid h-full place-items-center p-4 sm:p-7 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!position) {
    return (
      <div className="p-4 sm:p-7">
        <p className="text-muted-foreground">Position not found.</p>
        <Link to="/positions" className="text-sm font-semibold text-primary">← Back to positions</Link>
      </div>
    );
  }
  // HR & Interviewers may only open positions they're assigned to (Management: all).
  if (!positionVisibleTo(position, user)) {
    return (
      <div className="p-4 sm:p-7">
        <p className="text-muted-foreground">You aren’t assigned to this position, so you can’t view it.</p>
        <Link to="/positions" className="text-sm font-semibold text-primary">← Back to your positions</Link>
      </div>
    );
  }

  const cands = candidates.filter((c) => c.positionId === position.id);
  // Always show a column for any stage that actually has candidates, even if that
  // stage was later removed from the configured pipeline — so nobody is orphaned.
  const orphanStages = [...new Set(cands.map((c) => c.stage))].filter((s) => s !== "rejected" && !position.stages.includes(s));
  const columns = [...position.stages, ...orphanStages, ...(cands.some((c) => c.stage === "rejected") ? ["rejected"] : [])];

  // apply the board filters (live search + the applied multi-selects) to the set
  const needle = q.trim().toLowerCase();
  const anyFilter = q.trim() || qualActive.length || expActive.length;
  const filtered = cands.filter((c) => {
    if (qualActive.length && !qualActive.includes(c.highestQualification)) return false;
    if (expActive.length && !expActive.includes(c.experience)) return false;
    if (needle) {
      const hay = `${c.name} ${c.email} ${c.skills} ${c.currentRole} ${c.currentCompany} ${c.fieldOfStudy}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const applyFilters = () => { setQualActive(qualDraft); setExpActive(expDraft); };
  const filtersDirty = JSON.stringify(qualDraft) !== JSON.stringify(qualActive) || JSON.stringify(expDraft) !== JSON.stringify(expActive);
  const clearFilters = () => { setQ(""); setQualDraft([]); setExpDraft([]); setQualActive([]); setExpActive([]); };

  // Move flow. Applied is a plain move; any stage after it needs the acting user's
  // comment + score first (enforced in store.advanceStage). If it's missing we open
  // the candidate's profile and show a "review first" message instead of moving.
  const attemptMove = async (c) => {
    const res = await advanceStage(c.id, actor);
    if (res && res.ok === false && res.reason === "review-required") {
      setReviewFor(c.id);
      setMustReview(true);
      setDetail(c);
    } else if (res?.hired) {
      // Hired: the candidate is now an employee, issued an employee ID.
      toast.success(
        res.employeeId
          ? `${c.name} hired — employee ID ${res.employeeId} issued.`
          : `${c.name} hired.`
      );
    }
  };

  // --- Applied-stage bulk move (HR only) ---
  // Works on the applicants currently shown in Applied (so it respects the filter).
  const appliedShown = filtered.filter((c) => c.stage === "applied");
  const appliedPicked = appliedShown.filter((c) => picked.has(c.id));
  const allAppliedPicked = appliedShown.length > 0 && appliedPicked.length === appliedShown.length;
  const appliedNext = nextStage(position.stages, "applied");
  const appliedNextLabel = resolveStage(position, appliedNext)?.label || "next stage";
  const togglePick = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAllApplied = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allAppliedPicked) appliedShown.forEach((c) => next.delete(c.id));
      else appliedShown.forEach((c) => next.add(c.id));
      return next;
    });
  const clearPicked = () => setPicked(new Set());
  const movePickedToNext = async () => {
    const ids = appliedPicked.map((c) => c.id);
    setPicked(new Set());
    await Promise.all(ids.map((id) => advanceStage(id, actor))); // no note — it's just an application
  };

  // --- Side-by-side compare (HR & Interviewer) ---
  const toggleCompareMode = () => {
    setCompareMode((on) => !on);
    setCompareSet(new Set());
    setPicked(new Set()); // the two selection modes don't mix
  };
  const toggleCompare = (id) =>
    setCompareSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_COMPARE) next.add(id); // cap at MAX_COMPARE
      return next;
    });
  const compareList = [...compareSet].map((cid) => cands.find((c) => c.id === cid)).filter(Boolean);
  const compareAtCap = compareSet.size >= MAX_COMPARE;

  return (
    <div className="flex h-full flex-col p-4 sm:p-7">
      {/* header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Link to="/positions" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> Positions
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-[27px]">{position.title}</h1>
            <StatusPill status={effectiveStatus(position)} />
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            {position.department} · {anyFilter ? `${filtered.length} of ${cands.length}` : cands.length} candidates · Opened {formatDate(position.createdAt)}
          </div>
        </div>
        {canConfigure && (
          <div className="flex flex-wrap items-center gap-3">
            {/* No manual open/close/reopen — positions close only on their
                auto-close date and can never be reopened. */}
            <Button variant="ghost" onClick={() => setConfigOpen(true)}>
              <Settings2 size={16} /> Configure stages
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add candidate
            </Button>
          </div>
        )}
      </div>

      {/* filter bar — HR only. Search is live; tick one or more qualifications /
          experience ranges, then press Apply. Great for triaging the Applied pile. */}
      {isHR && (
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <div className="flex min-w-[190px] flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm sm:max-w-xs sm:flex-none">
            <Search size={15} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, skills…"
              className="w-full bg-transparent text-foreground placeholder:text-[#94A3B8] focus:outline-none"
            />
          </div>
          <CheckDropdown label="Qualifications" options={QUALIFICATIONS} value={qualDraft} onChange={setQualDraft} className="min-w-[170px]" />
          <CheckDropdown label="Experience" options={EXPERIENCE_RANGES} value={expDraft} onChange={setExpDraft} className="min-w-[150px]" />
          <Button onClick={applyFilters} disabled={!filtersDirty}>
            Apply
          </Button>
          {anyFilter && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary">
              <SlidersHorizontal size={14} /> Clear
            </button>
          )}
        </div>
      )}

      {/* compare toolbar — HR & Interviewer only (not Management) */}
      {canCompare && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant={compareMode ? "primary" : "ghost"} onClick={toggleCompareMode}>
            <GitCompare size={16} /> {compareMode ? "Exit compare" : "Compare candidates"}
          </Button>
          {compareMode && (
            <span className="text-[13px] font-medium text-muted-foreground">
              Tick 2–{MAX_COMPARE} candidates{compareAtCap ? ` (max ${MAX_COMPARE} reached)` : ""}, then open the comparison.
            </span>
          )}
        </div>
      )}

      {/* board — fills the remaining height and is the ONE scroll region: its
          left–right scrollbar stays pinned at the bottom of the screen and its
          up–down scrollbar on the right scrolls ALL columns together (no per-column
          scrollbars). Scrolling down reveals more candidates in the taller columns. */}
      <div className="mt-4 flex min-h-0 flex-1 items-start gap-4 overflow-auto pb-2">
        {columns.map((stageId) => {
          const stage = resolveStage(position, stageId);
          const inStage = filtered.filter((c) => c.stage === stageId);
          const ownerLabel = stage.owner ? ROLE_LABELS[stage.owner] : null;
          const team = assigneesFor(position, stageId);
          // Show up to two names so a team never looks like a single (reverted)
          // person — e.g. "Boothika, Chamara +1" rather than a lone "Boothika +2".
          const teamLabel = team.length === 0 ? null
            : team.length <= 2 ? team.map((t) => t.name).join(", ")
            : `${team[0].name}, ${team[1].name} +${team.length - 2}`;
          return (
            <div key={stageId} className="flex w-[240px] shrink-0 flex-col rounded-2xl border border-[#EDF0F4] bg-[#F6F8FB] p-3 dark:border-transparent dark:bg-[#17171a]">
              <div className="flex items-start justify-between px-1 pb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.dot }} />
                    <span className="text-sm font-bold text-foreground">{stage.label}</span>
                  </div>
                  {ownerLabel && (
                    <span className="ml-[18px] mt-0.5 block text-[11px] font-medium text-[#94A3B8]">
                      {ownerLabel}{teamLabel ? <> · <span className="text-primary">{teamLabel}</span></> : null}
                    </span>
                  )}
                </div>
                <span className="rounded-lg px-2 py-0.5 text-xs font-bold" style={{ background: stage.badgeBg, color: stage.badgeFg }}>
                  {inStage.length}
                </span>
              </div>

              {/* Applied stage only, HR only: select-all + move everyone ticked to the next stage */}
              {isHR && stageId === "applied" && appliedShown.length > 0 && (
                <div className="mb-3 space-y-2">
                  <label className="flex cursor-pointer items-center gap-2 px-1 text-[12px] font-semibold text-foreground">
                    <input
                      type="checkbox"
                      checked={allAppliedPicked}
                      onChange={toggleAllApplied}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                    Select all ({appliedShown.length})
                  </label>
                  {appliedPicked.length > 0 && (
                    <div className="space-y-1.5 rounded-xl border border-primary/40 bg-primary/10 p-2">
                      <div className="px-0.5 text-[12px] font-bold text-foreground">{appliedPicked.length} selected</div>
                      <button
                        onClick={movePickedToNext}
                        className="flex w-full items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        Move to {appliedNextLabel} <ChevronRight size={14} />
                      </button>
                      <button
                        onClick={() => setBulkRejectOpen(true)}
                        className="flex w-full items-center justify-center gap-1 rounded-lg border border-[#F0C4C4] py-2 text-xs font-bold text-[#DC2626] transition-colors hover:bg-[#FBE9E9] dark:border-[#5a2a2a] dark:hover:bg-[#2a1717]"
                      >
                        <X size={14} strokeWidth={3} /> Reject selected
                      </button>
                      <button
                        onClick={clearPicked}
                        className="w-full rounded-lg py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-secondary"
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {inStage.map((c) => {
                  const mayAct = canActOnStageFor(user, position, c.stage);
                  return (
                    <div key={c.id} className={`space-y-3 rounded-xl border bg-card p-3 shadow-card ${(compareMode && compareSet.has(c.id)) || (!compareMode && isHR && stageId === "applied" && picked.has(c.id)) ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                      <div className="flex items-start gap-2">
                        {compareMode && canCompare ? (
                          <input
                            type="checkbox"
                            checked={compareSet.has(c.id)}
                            onChange={() => toggleCompare(c.id)}
                            disabled={!compareSet.has(c.id) && compareAtCap}
                            aria-label={`Compare ${c.name}`}
                            title={!compareSet.has(c.id) && compareAtCap ? `You can compare up to ${MAX_COMPARE} at once` : undefined}
                            className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        ) : isHR && stageId === "applied" ? (
                          <input
                            type="checkbox"
                            checked={picked.has(c.id)}
                            onChange={() => togglePick(c.id)}
                            aria-label={`Select ${c.name}`}
                            className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                          />
                        ) : null}
                        <button onClick={() => setDetail(c)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                          <Avatar name={c.name} color={c.avatarColor} size={38} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground hover:text-primary">{c.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{c.appliedRole || "Candidate"}</div>
                          </div>
                        </button>
                      </div>
                      {position.minQualification && c.highestQualification && (
                        <EligibilityTag candidateQual={c.highestQualification} minQual={position.minQualification} />
                      )}

                      {c.stage === "hired" ? (
                        <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#E7F6EC] py-2 text-xs font-bold text-[#16A34A]">
                          <Check size={14} strokeWidth={3} /> Hired
                        </div>
                      ) : c.stage === "rejected" ? (
                        <div className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#FBE9E9] py-2 text-xs font-bold text-[#DC2626]">
                          <X size={14} strokeWidth={3} /> {c.rejection?.reason || "Rejected"}
                        </div>
                      ) : mayAct ? (
                        <div className="space-y-1.5">
                          <button
                            onClick={() => (c.stage === "applied" ? advanceStage(c.id, actor) : attemptMove(c))}
                            className="flex w-full items-center justify-center gap-1 rounded-lg bg-[#F1F5FA] py-2 text-xs font-semibold text-primary transition-colors hover:bg-[#E5EBF3] dark:bg-[#242427] dark:hover:bg-[#2d2d31]"
                          >
                            Move to next stage <ChevronRight size={14} />
                          </button>
                          <button
                            onClick={() => setRejectTarget(c)}
                            className="w-full rounded-lg py-1.5 text-xs font-semibold text-[#DC2626] transition-colors hover:bg-[#FBE9E9]"
                          >
                            Reject
                          </button>
                          {reviewFor === c.id && (
                            <button
                              onClick={() => { setMustReview(true); setDetail(c); }}
                              className="w-full rounded-lg bg-[#FBE9E9] px-2 py-1.5 text-left text-[11px] font-semibold text-[#B91C1C]"
                            >
                              Add a comment and a score in the profile before moving on.
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="rounded-lg bg-[#F5F7FA] py-2 text-center text-[11px] font-medium text-[#94A3B8] dark:bg-[#242427]">
                          {team.length ? `Assigned to ${teamLabel}` : ownerLabel ? `${ownerLabel} owns this stage` : "View only"}
                        </div>
                      )}
                    </div>
                  );
                })}

                {inStage.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#D3DCE7] py-6 text-center text-xs text-[#94A3B8] dark:border-[#2d2d31]">
                    {anyFilter ? "No matches" : "No candidates"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* floating compare bar */}
      {compareMode && compareSet.size > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-full border border-border bg-card px-3 py-2 shadow-pop">
            <span className="pl-2 text-sm font-semibold text-foreground">
              {compareSet.size} selected{compareSet.size < 2 ? " · pick 1 more" : ""}
            </span>
            <Button onClick={() => setCompareOpen(true)} disabled={compareSet.size < 2}>
              <GitCompare size={15} /> Compare side by side
            </Button>
            <button onClick={() => setCompareSet(new Set())} className="rounded-full px-3 py-1.5 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground">
              Clear
            </button>
          </div>
        </div>
      )}

      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} candidates={compareList} position={position} />
      <AddCandidateModal open={addOpen} onClose={() => setAddOpen(false)} position={position} />
      <StageConfigModal open={configOpen} position={position} onClose={() => setConfigOpen(false)} />
      <CandidateDetailModal
        open={!!detail}
        candidate={detail && (candidates.find((x) => x.id === detail.id) || detail)}
        positionTitle={position.title}
        mustReview={mustReview}
        onClose={() => { setDetail(null); setMustReview(false); setReviewFor(null); }}
      />
      <RejectModal
        open={!!rejectTarget}
        candidate={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={async ({ reason, comment }) => {
          await rejectCandidate(rejectTarget.id, { reason, comment, actor });
        }}
      />
      <RejectModal
        open={bulkRejectOpen}
        count={appliedPicked.length}
        onClose={() => setBulkRejectOpen(false)}
        onConfirm={async ({ reason, comment }) => {
          const ids = appliedPicked.map((c) => c.id);
          setPicked(new Set());
          await bulkReject(ids, { reason, comment, actor });
        }}
      />
    </div>
  );
}
