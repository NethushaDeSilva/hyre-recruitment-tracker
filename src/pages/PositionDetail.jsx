import { canBulkSelect, isScoreStale, staleReason, notScoredReason, scorePillClass } from "@/lib/scoreStaleness";
import AssessmentStatus from "@/components/AssessmentStatus";
// Position detail — the pipeline board. Columns = the position's configured
// stages. Recruitment is a multi-stage filter: each stage is owned by a role
// (HR screening → Department review → interviews → Final interview), and only the
// owning role (or Management) can advance/reject a candidate in that stage.
//
// The Applied column doubles as the WS5 5.8 shortlist (previously a separate
// Board/Shortlist tab — merged in so "the screen that turns 100 CVs into a
// workable list" IS the Applied column, not a second view of it). HR-only:
// the sort-by-score, threshold hide, and score pill below only ever change
// what HR sees — Interviewers/Management keep the Applied column exactly as
// it always rendered, natural order, unfiltered, matching every other column.
import { useMemo, useState, useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronRight, Plus, Settings2, Pencil, Check, ArrowLeft, X, Search, SlidersHorizontal, RefreshCw, AlertCircle } from "lucide-react";
import { useHyreData, advanceStage, rejectCandidate, bulkReject, rescoreVacancy, updatePositionThreshold } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { can, ROLE_LABELS, ROLES } from "@/lib/permissions";
import { resolveStage, canActOnStageFor, assigneesFor, positionVisibleTo, nextStage } from "@/lib/stages";
import { effectiveStatus } from "@/lib/positions";
import { sortApplications } from "../../functions/_lib/filtration/engine.js";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate, displayName } from "@/lib/format";
import AddCandidateModal from "@/components/AddCandidateModal";
import RejectModal from "@/components/RejectModal";
import StageConfigModal from "@/components/StageConfigModal";
import OpenPositionModal from "@/components/OpenPositionModal";
import CandidateDetailModal from "@/components/CandidateDetailModal";
import ProposeInterviewModal from "@/components/ProposeInterviewModal";

export default function PositionDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const stageFilter = searchParams.get("stage"); // e.g. ?stage=applied — "N at Applied" link from the Positions grid
  const { user } = useAuth();
  const { positions, candidates, scores, loading } = useHyreData();
  const [addOpen, setAddOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false); // reject all selected applicants at once
  const [detail, setDetail] = useState(null);
  const [mustReview, setMustReview] = useState(false); // tells the detail modal to show the "review first" banner
  const [reviewFor, setReviewFor] = useState(null);    // candidate id showing the inline "review first" hint on its card
  const [scheduleTarget, setScheduleTarget] = useState(null); // WS8 — { candidate, stageId } once they land in a schedulable stage
  // Applied-stage bulk select (HR only) — tick applicants and move them together.
  const [picked, setPicked] = useState(() => new Set());
  // board search (HR only) — live, filters by name/skills/role/company/field.
  const [q, setQ] = useState("");
  // WS5 5.8 / WS8 §4 — shortlist threshold. Now a persisted position field,
  // not a per-session view filter: dragging it writes position.shortlistThreshold
  // via updatePositionThreshold() on release, so it survives a reload. Local
  // state still drives the slider live (immediate feedback while dragging)
  // and resets from the position's stored value only when navigating to a
  // DIFFERENT position, so it never fights a live Firestore update mid-drag.
  const [threshold, setThreshold] = useState(0);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreMsg, setRescoreMsg] = useState("");
  // UI chrome: the header shrinks as you scroll the board (reclaims space).
  const [collapsed, setCollapsed] = useState(false);
  // Collapse past 44px of board scroll, expand back under 16px (hysteresis stops flicker).
  const onBoardScroll = (e) => {
    const y = e.currentTarget.scrollTop;
    setCollapsed((c) => (c ? y > 16 : y > 44));
  };

  const canConfigure = can(user?.role, "managePositions");
  const isHR = user?.role === ROLES.HR; // board filter + Applied bulk-move are HR-only
  const actor = user ? { name: user.name, role: user.role, uid: user.uid || user.email || user.name } : null;
  const toast = useToast();

  const position = positions.find((p) => p.id === id);

  // Reset the threshold to this position's stored default only when the
  // position actually changes (never on every Firestore update, or a live
  // HR drag would get silently overwritten mid-session).
  useEffect(() => {
    setThreshold(position?.shortlistThreshold ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position?.id]);

  // Cross-application indicator (Part 2) — built once from the FULL,
  // already-loaded `candidates` stream (every application across every
  // position staff can see; no extra Firestore read, no N+1 per card).
  // personId -> [{ positionId }] across the whole store, deduped later.
  const applicationsByPerson = useMemo(() => {
    const map = new Map();
    for (const c of candidates) {
      if (!c.personId) continue;
      if (!map.has(c.personId)) map.set(c.personId, []);
      map.get(c.personId).push(c.positionId);
    }
    return map;
  }, [candidates]);
  // Other positions this candidate applied to, visible to THIS viewer only
  // (positionVisibleTo) — an Interviewer must never learn the title of a
  // position they aren't assigned to via a third party's application. Omit
  // entirely (no placeholder, no count) when nothing is visible.
  const otherPositionTitlesFor = (c) => {
    if (!c.personId || !position) return [];
    const ids = [...new Set(applicationsByPerson.get(c.personId) || [])].filter((pid) => pid !== position.id);
    return ids
      .map((pid) => positions.find((p) => p.id === pid))
      .filter((p) => p && positionVisibleTo(p, user))
      .map((p) => p.title);
  };
  // "also applied to X" / "X and Y" / "X, Y +N more" — capped so a person
  // with many applications never blows out a 240px card.
  const otherPositionsLabel = (titles) => {
    if (titles.length === 0) return "";
    if (titles.length === 1) return `also applied to ${titles[0]}`;
    if (titles.length === 2) return `also applied to ${titles[0]} and ${titles[1]}`;
    return `also applied to ${titles[0]}, ${titles[1]} +${titles.length - 2} more`;
  };

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
  // ?stage= (the "N at Applied" link on the Positions grid) filters the board
  // down to just that one column — same board, same per-column bulk actions,
  // just fewer columns rendered. Falls back to every column if the param
  // doesn't name a real one here.
  const visibleColumns = stageFilter && columns.includes(stageFilter) ? [stageFilter] : columns;

  // apply the live board search to the set
  const needle = q.trim().toLowerCase();
  const anyFilter = needle.length > 0;
  const filtered = cands.filter((c) => {
    if (needle) {
      const hay = `${displayName(c)} ${c.email} ${c.skills} ${c.currentRole} ${c.currentCompany} ${c.fieldOfStudy}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  // Move flow. Applied is a plain move; any stage after it needs the acting user's
  // comment + score first (enforced in store.advanceStage). If it's missing we open
  // the candidate's profile and show a "review first" message instead of moving.
  const attemptMove = async (c) => {
    const res = await advanceStage(c.id, actor);
    if (res && res.ok === false && (res.reason === "review-required" || res.reason === "comment-required")) {
      setReviewFor(c.id);
      setMustReview(true);
      setDetail(c);
    } else if (res && res.ok === false && res.reason === "offer-required") {
      toast.error(`${displayName(c)} needs an accepted offer before they can be hired.`);
      setDetail(c);
    } else if (res?.hired) {
      // Hired: the candidate is now an employee, issued an employee ID.
      toast.success(
        res.employeeId
          ? `${displayName(c)} hired — employee ID ${res.employeeId} issued.`
          : `${displayName(c)} hired.`
      );
    }
    // WS8 §5 — landing in a schedulable stage no longer auto-opens
    // ProposeInterviewModal (that forced HR to guess a slot with no idea who's
    // free). Requesting an interviewer is now a standalone action from the
    // candidate's Interview panel (CandidateDetailModal), available any time.
  };

  // --- WS5 5.8: Applied column = the shortlist (merged in, not a second view) ---
  // HR only (isHR gate below) — Interviewers/Management get the applied stage
  // in its plain, unsorted, unfiltered order, same as any other column.
  // sortApplications is the exact WS5 5.8 tie-break chain (score desc, core
  // skills desc, id asc) — reused, not reimplemented, and it already sorts
  // unscored entries last rather than as a 0 (rule 6).
  const appliedStageAll = filtered.filter((c) => c.stage === "applied");
  const appliedEntries = appliedStageAll.map((c) => {
    const s = scores.get(c.id);
    return { candidateId: c.id, status: s?.status === "scored" ? "scored" : "unscored", result: s?.status === "scored" ? s : undefined, c };
  });
  const appliedOrdered = sortApplications(appliedEntries);
  // Threshold HIDES, never removes — a scored-below-threshold entry is
  // dropped from what renders, but never from `filtered`/`cands`/Firestore.
  // Unscored entries are never subject to the threshold at all (rule 6).
  const appliedVisibleEntries = appliedOrdered.filter((e) => e.status !== "scored" || e.result.overallScore >= threshold);
  const appliedVisibleIds = new Set(appliedVisibleEntries.map((e) => e.candidateId));
  const appliedHiddenByThreshold = appliedOrdered.length - appliedVisibleEntries.length;
  const appliedUnscoredCount = appliedOrdered.filter((e) => e.status !== "scored").length;
  const appliedStaleCount = appliedOrdered.filter((e) => e.status === "scored" && isScoreStale(scores.get(e.candidateId))).length;
  const runRescore = async () => {
    setRescoring(true);
    setRescoreMsg("");
    const res = await rescoreVacancy(position.id);
    setRescoring(false);
    setRescoreMsg(res.ok ? `Re-scored ${res.scored} application${res.scored === 1 ? "" : "s"}${res.failed ? `, ${res.failed} failed` : ""}.` : res.error);
  };

  // Persist on release (mouseup/touchend/blur), not on every `input` tick of
  // the drag — the slider still updates `threshold` live via onChange for
  // immediate visual feedback, this just decides when that value gets saved.
  const persistThreshold = async (value) => {
    if (value === (position?.shortlistThreshold ?? 0)) return;
    setSavingThreshold(true);
    await updatePositionThreshold(position.id, value);
    setSavingThreshold(false);
  };

  // --- Applied-stage bulk move (HR only) ---
  // Eligible = visible under the current threshold/search AND canBulkSelect
  // (score fresh, meets eligibility). A candidate the threshold hides falls
  // out of appliedVisibleEntries and therefore out of appliedShown, so
  // appliedPicked (below) drops it automatically the next render — no
  // separate "clear selection on filter change" effect needed.
  const appliedShown = isHR
    ? appliedVisibleEntries.filter((e) => canBulkSelect(scores.get(e.candidateId), position, e.c)).map((e) => e.c)
    : [];
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
    // Recheck at execution (point 7) — never trust the picked Set alone,
    // even though appliedPicked is already filtered through appliedShown.
    const ids = appliedPicked.filter((c) => canBulkSelect(scores.get(c.id), position, c)).map((c) => c.id);
    setPicked(new Set());
    await Promise.all(ids.map((id) => advanceStage(id, actor, { screeningBulk: true }))); // no note — it's just an application
  };

  return (
    <div className={`flex h-full flex-col px-4 pb-4 transition-[padding] duration-200 ease-natural sm:px-7 sm:pb-7 ${collapsed ? "pt-3 sm:pt-4" : "pt-4 sm:pt-7"}`}>
      {/* header — collapses as you scroll the board so the board gets more room.
          Each piece names only the properties it actually changes (never `transition-all`,
          which would make the browser watch every property for changes) and eases with a
          natural decelerating curve rather than the mechanical default. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-natural ${collapsed ? "max-h-0 opacity-0" : "max-h-8 opacity-100"}`}>
            <Link to="/positions" className="inline-flex items-center gap-1 text-[13px] font-medium text-muted-foreground hover:text-foreground">
              <ArrowLeft size={14} /> Positions
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={`font-extrabold tracking-tight text-foreground transition-[font-size] duration-200 ease-natural ${collapsed ? "text-lg sm:text-xl" : "text-2xl sm:text-[27px]"}`}>{position.title}</h1>
            <StatusPill status={effectiveStatus(position)} />
          </div>
          <div className={`overflow-hidden text-sm font-medium text-muted-foreground transition-[max-height,opacity] duration-200 ease-natural ${collapsed ? "max-h-0 opacity-0" : "max-h-8 opacity-100"}`}>
            {position.department} · {anyFilter ? `${filtered.length} of ${cands.length}` : cands.length} candidates · Opened {formatDate(position.createdAt)}
            {position.hiringManagerName && <> · Hiring manager: {position.hiringManagerName}</>}
            {" · "}{position.hiredCount || 0}/{position.headcount || 1} hired
          </div>
        </div>
        {canConfigure && (
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="ghost" onClick={() => setEditOpen(true)}>
              <Pencil size={16} /> Edit position
            </Button>
            <Button variant="ghost" onClick={() => setConfigOpen(true)}>
              <Settings2 size={16} /> Configure stages
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus size={16} /> Add candidate
            </Button>
          </div>
        )}
      </div>

      {/* search — HR only. Client-side, filters the visible board only. */}
      {isHR && (
        <div className={`relative z-30 flex flex-wrap items-center gap-2.5 transition-[margin] duration-200 ease-natural ${collapsed ? "mt-2" : "mt-5"}`}>
          <div className="flex min-w-[160px] flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <Search size={15} className="shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, skills…"
              className="w-full bg-transparent text-foreground placeholder:text-[#94A3B8] focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* WS5 5.8 / WS8 §4 — shortlist threshold. A primary control now, not a
          side slider: this is what turns 100 Applied CVs into a workable
          shortlist. Persists to position.shortlistThreshold on release
          (persistThreshold above) so it survives a reload, and drives the
          Applied-column green/red colour and the review-comment gate
          everywhere else via the same >= comparison (meetsShortlistThreshold). */}
      {isHR && (
        <div className={`relative z-20 flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] px-4 py-3.5 transition-[margin] duration-200 ease-natural ${collapsed ? "mt-2" : "mt-3"}`}>
          <SlidersHorizontal size={18} className="shrink-0 text-primary" />
          {/* min-w-0 (not shrink-0) is the actual fix: shrink-0 was blocking this
              box from ever being squeezed into a narrower line, so its own
              flex-wrap never had a reason to engage — the box just ran off the
              viewport at full width instead of reflowing its children. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <label htmlFor="shortlist-threshold" className="text-sm font-bold text-foreground">Shortlist threshold</label>
            <input
              id="shortlist-threshold"
              type="range" min={0} max={100} step={5} value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              onMouseUp={(e) => persistThreshold(Number(e.target.value))}
              onTouchEnd={(e) => persistThreshold(Number(e.target.value))}
              onKeyUp={(e) => persistThreshold(Number(e.target.value))}
              className="h-2 w-40 accent-primary"
            />
            <span className="text-lg font-extrabold tabular-nums text-primary">{threshold}+</span>
            <span className="text-xs font-medium text-muted-foreground">
              {savingThreshold ? "Saving…" : `${appliedVisibleEntries.length} shown · ${appliedHiddenByThreshold} below threshold`}
              {!savingThreshold && appliedUnscoredCount > 0 && <> · {appliedUnscoredCount} unscored</>}
            </span>
            {appliedStaleCount > 0 && (
              <span className="rounded bg-[#FBF1DC] px-1.5 py-0.5 text-xs font-bold text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]">
                {appliedStaleCount} stale
              </span>
            )}
          </div>
          <button
            onClick={runRescore}
            disabled={rescoring}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-card px-2.5 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <RefreshCw size={12} className={rescoring ? "animate-spin" : ""} /> {rescoring ? "Re-scoring…" : "Re-score all"}
          </button>
        </div>
      )}
      {isHR && rescoreMsg && <p className="mt-1.5 text-xs text-muted-foreground">{rescoreMsg}</p>}
      {isHR && !position.requirements && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-[#F0DFA6] bg-[#FBF1DC] px-3 py-2 text-[13px] text-[#8A6314] dark:border-[#5a4a1a] dark:bg-[#3a2f0f] dark:text-[#F5D77E]">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span>This vacancy has no requirements set, so Applied applications can't be scored. <button onClick={() => setEditOpen(true)} className="font-semibold underline">Edit position</button></span>
        </div>
      )}

      {stageFilter && visibleColumns.length === 1 && (
        <div className="mt-3 flex items-center gap-2 text-[13px] font-medium text-muted-foreground">
          Filtered to <span className="font-bold text-foreground">{resolveStage(position, visibleColumns[0]).label}</span>
          <button onClick={() => setSearchParams({})} className="font-semibold text-primary hover:underline">Show all stages</button>
        </div>
      )}
      {/* board — the ONE scroll region. Its up–down scroll drives the header
          collapse above (more room for candidates), while its left–right scrollbar
          stays pinned at the bottom and scrolls ALL columns together. */}
      <div onScroll={onBoardScroll} className={`flex min-h-0 flex-1 items-start gap-4 overflow-auto overscroll-contain pb-2 transition-[margin] duration-200 ease-natural ${collapsed ? "mt-2" : "mt-4"}`}>
        {visibleColumns.map((stageId) => {
          const stage = resolveStage(position, stageId);
          // Applied, HR only: ranked by score (WS5 5.8 tie-break) and
          // threshold-hidden — everyone else sees the plain, unsorted stage.
          const inStage = stageId === "applied" && isHR
            ? appliedOrdered.filter((e) => appliedVisibleIds.has(e.candidateId)).map((e) => e.c)
            : filtered.filter((c) => c.stage === stageId);
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
                    <div key={c.id} className={`space-y-3 rounded-xl border bg-card p-3 shadow-card ${isHR && stageId === "applied" && picked.has(c.id) ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                      <div className="flex items-start gap-2">
                        {isHR && stageId === "applied" ? (
                          <input
                            type="checkbox"
                            checked={picked.has(c.id)}
                            disabled={!canBulkSelect(scores.get(c.id), position, c)}
                            onChange={() => togglePick(c.id)}
                            aria-label={`Select ${displayName(c)}`}
                            className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                          />
                        ) : null}
                        <button onClick={() => setDetail(c)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                          <Avatar name={displayName(c)} color={c.avatarColor} size={38} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold text-foreground hover:text-primary">{displayName(c)}</span>
                              {c.needsReview && (
                                <span className="shrink-0 rounded bg-[#FBF1DC] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]" title={c.cvValidation?.reason || "CV validation was borderline — worth a second look"}>
                                  Review
                                </span>
                              )}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">{c.appliedRole || "Candidate"}</div>
                            {otherPositionsLabel(otherPositionTitlesFor(c)) && (
                              <div className="truncate text-[10px] text-muted-foreground/60">{otherPositionsLabel(otherPositionTitlesFor(c))}</div>
                            )}
                          </div>
                        </button>
                      </div>
                      {isHR && stageId === "applied" && (
                        scores.get(c.id)?.status === "scored" ? (
                          <div className="flex items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${scorePillClass(scores.get(c.id).overallScore, position)}`}>
                              {scores.get(c.id).overallScore}
                            </span>
                            {isScoreStale(scores.get(c.id)) && (
                              <span title={staleReason(scores.get(c.id))} className="rounded bg-[#FBF1DC] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]">
                                Stale
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <AlertCircle size={11} className="shrink-0" />
                            Not scored — {notScoredReason(scores.get(c.id), position)}
                            <button onClick={runRescore} className="font-semibold text-primary hover:underline">Retry</button>
                          </div>
                        )
                      )}
                      <AssessmentStatus score={scores.get(c.id)} position={position} candidate={c} />

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

      <AddCandidateModal open={addOpen} onClose={() => setAddOpen(false)} position={position} />
      <StageConfigModal open={configOpen} position={position} onClose={() => setConfigOpen(false)} />
      <OpenPositionModal open={editOpen} position={position} onClose={() => setEditOpen(false)} />
      <CandidateDetailModal
        open={!!detail}
        candidate={detail && (candidates.find((x) => x.id === detail.id) || detail)}
        position={position}
        positionTitle={position.title}
        mustReview={mustReview}
        scoreDoc={detail ? scores.get(detail.id) : null}
        onClose={() => { setDetail(null); setMustReview(false); setReviewFor(null); }}
        onSchedule={setScheduleTarget}
      />
      <ProposeInterviewModal
        open={!!scheduleTarget}
        candidate={scheduleTarget?.candidate}
        position={position}
        stageId={scheduleTarget?.stageId}
        stageLabel={scheduleTarget ? resolveStage(position, scheduleTarget.stageId).label : ""}
        onClose={() => setScheduleTarget(null)}
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
