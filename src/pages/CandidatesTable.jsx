// Candidates table (HR / Management) — every applicant across all positions in a
// sortable, filterable table. This is the "CV details in a table" the brief asks
// for: filter by position, stage, qualification, experience or free-text search,
// sort by any column, and download/view each CV.
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useHyreData, advanceStage } from "@/data/store";
import { stageLabelOf, resolveStage, nextStage, canActOnStageFor, visiblePositions } from "@/lib/stages";
import { useAuth } from "@/context/AuthContext";
import { useStaggerReveal } from "@/hooks/useStaggerReveal";
import { QUALIFICATIONS, EXPERIENCE_RANGES } from "@/lib/application";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { StageBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/ToastProvider";
import { formatDate, displayName } from "@/lib/format";
import { downloadDataUrl } from "@/lib/file";
import AiFilter from "@/components/AiFilter";
import CandidateDetailModal from "@/components/CandidateDetailModal";
import EligibilityTag from "@/components/EligibilityTag";
import { cn } from "@/lib/utils";

// AI Score column pill colour — same thresholds as AiFilter's own scorePill,
// so a candidate reads the same whether you're looking at the popover or the table.
const aiScorePill = (s) =>
  s >= 75
    ? "bg-[#16A34A]/12 text-[#16A34A] dark:text-[#4ADE80]"
    : s >= 50
    ? "bg-[#E0A422]/15 text-[#B4801A] dark:text-[#F5D77E]"
    : "bg-[#DC2626]/10 text-[#DC2626] dark:text-[#F87171]";

// Ordinal rank so qualification / experience / stage sort meaningfully, not A–Z.
const rank = (list, v) => {
  const i = list.indexOf(v);
  return i < 0 ? list.length : i;
};
const STAGE_ORDER = ["applied", "screening", "interview", "final", "hired", "hold", "rejected"];

export default function CandidatesTable() {
  const { user } = useAuth();
  const { positions: allPositions, candidates: allCandidates, loading } = useHyreData();
  const toast = useToast();
  const actor = user ? { name: user.name, role: user.role, uid: user.uid || user.email || user.name } : null;
  // HR sees candidates only from positions they're assigned to; Management: all.
  const positions = useMemo(() => visiblePositions(allPositions, user), [allPositions, user]);
  // HIRED people are NOT candidates anymore — they live on the Employees page.
  // The candidates table only holds people still in (or dropped from) the pipeline.
  const candidates = useMemo(() => {
    const ids = new Set(positions.map((p) => p.id));
    return allCandidates.filter((c) => ids.has(c.positionId) && c.stage !== "hired");
  }, [allCandidates, positions]);
  const [q, setQ] = useState("");
  const [position, setPosition] = useState("");
  const [stage, setStage] = useState("");
  const [qualification, setQualification] = useState("");
  const [experience, setExperience] = useState("");
  const [sort, setSort] = useState({ key: "appliedAt", dir: "desc" });
  const [view, setView] = useState("all"); // all | active | hired | pool
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(() => new Set()); // ticked candidate ids for bulk actions
  // AI Mode — same screening panel as the position board, scoped to every
  // candidate visible on this (cross-position) page. Results are kept here too
  // (not just inside the popover) so the score can show as a column in the table.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiResults, setAiResults] = useState(null); // { summary, ranked: [{id, score, verdict, reason}] }
  const aiWrapRef = useRef(null);
  useEffect(() => {
    if (!aiOpen) return;
    const onDown = (e) => { if (selected) return; if (aiWrapRef.current && !aiWrapRef.current.contains(e.target)) setAiOpen(false); };
    const onKey = (e) => { if (selected) return; if (e.key === "Escape") setAiOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [aiOpen, selected]);
  const aiScoreById = useMemo(() => new Map((aiResults?.ranked || []).map((r) => [r.id, r])), [aiResults]);

  const titleFor = (id) => positions.find((p) => p.id === id)?.title || "—";
  const positionFor = (id) => positions.find((p) => p.id === id) || null; // for the detail modal's Move-to-next-stage
  const minQualFor = (id) => positions.find((p) => p.id === id)?.minQualification || "";
  const stagesPresent = useMemo(
    () => STAGE_ORDER.filter((s) => candidates.some((c) => c.stage === s)),
    [candidates]
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = candidates.filter((c) => {
      if (view === "active" && c.stage === "rejected") return false;
      if (view === "pool" && c.stage !== "rejected") return false;
      if (position && c.positionId !== position) return false;
      if (stage && c.stage !== stage) return false;
      if (qualification && c.highestQualification !== qualification) return false;
      if (experience && c.experience !== experience) return false;
      if (needle) {
        const hay = `${displayName(c)} ${c.email} ${c.skills} ${c.currentRole} ${c.currentCompany} ${titleFor(c.positionId)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c) => {
      switch (sort.key) {
        case "name": return displayName(c).toLowerCase();
        case "position": return titleFor(c.positionId).toLowerCase();
        case "qualification": return rank(QUALIFICATIONS, c.highestQualification);
        case "experience": return rank(EXPERIENCE_RANGES, c.experience);
        case "appliedAt": return c.appliedAt;
        default: return c.appliedAt;
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [candidates, positions, q, position, stage, qualification, experience, sort, view]);

  // One person can apply to many positions (WS1) — each is its own application
  // row underneath, but they must never LOOK like the same person entered twice.
  // Group the already-filtered/sorted applications by person, in the order each
  // person first appears in `rows`, and carry every one of their applications
  // along so the table can still show (and act on) each individually.
  const personKey = (c) => c.personId || c.candidateId || c.email;
  const groupedRows = useMemo(() => {
    const order = [];
    const byPerson = new Map();
    for (const c of rows) {
      const key = personKey(c);
      if (!byPerson.has(key)) {
        byPerson.set(key, { ...c, key, applications: [] });
        order.push(key);
      }
      byPerson.get(key).applications.push(c);
    }
    return order.map((key) => byPerson.get(key));
  }, [rows]);
  const uniquePeople = (list) => new Set(list.map(personKey)).size;

  const VIEWS = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "pool", label: "Talent pool" },
  ];
  const counts = useMemo(
    () => ({
      all: uniquePeople(candidates),
      active: uniquePeople(candidates.filter((c) => c.stage !== "rejected")),
      pool: uniquePeople(candidates.filter((c) => c.stage === "rejected")),
    }),
    [candidates]
  );

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const clearFilters = () => {
    setQ(""); setPosition(""); setStage(""); setQualification(""); setExperience("");
  };
  const activeFilters = q || position || stage || qualification || experience;

  // --- pagination (keeps big lists — 700+ CVs — snappy and readable) ---
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  // jump back to page 1 whenever the result set changes
  useEffect(() => setPage(1), [q, position, stage, qualification, experience, view, sort]);
  const totalPages = Math.max(1, Math.ceil(groupedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = groupedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const bodyRef = useStaggerReveal(!loading && pageGroups.length > 0, { selector: ":scope > tr", stagger: 35, distance: 10 });

  // --- bulk selection (the "select all" tick acts on the current page) ---
  // `checked` still stores APPLICATION ids underneath — a grouped row's checkbox
  // just toggles every application belonging to that person at once, so the bulk
  // move logic below (which is inherently per-application) needs no changes.
  const selectedRows = rows.filter((c) => checked.has(c.id));
  const pageApplicationIds = pageGroups.flatMap((g) => g.applications.map((a) => a.id));
  const pageAllChecked = pageApplicationIds.length > 0 && pageApplicationIds.every((id) => checked.has(id));

  // Bulk "move to next stage" — Applied only (mirrors the position board's bulk
  // move: no review/score note required, it's just an application), and only for
  // candidates this user is actually allowed to act on in that stage. Selected
  // candidates can span different positions, so eligibility and the next-stage
  // label are computed per-candidate from THEIR OWN position's pipeline.
  const movable = selectedRows.filter(
    (c) => c.stage === "applied" && canActOnStageFor(user, positionFor(c.positionId), "applied")
  );
  const moveLabels = [...new Set(
    movable
      .map((c) => {
        const pos = positionFor(c.positionId);
        const ns = pos && nextStage(pos.stages, "applied");
        return ns ? resolveStage(pos, ns).label : null;
      })
      .filter(Boolean)
  )];
  const moveLabel = moveLabels.length === 1 ? moveLabels[0] : "next stage";

  const toggleGroup = (group) =>
    setChecked((prev) => {
      const next = new Set(prev);
      const allChecked = group.applications.every((a) => next.has(a.id));
      group.applications.forEach((a) => (allChecked ? next.delete(a.id) : next.add(a.id)));
      return next;
    });
  const toggleAllVisible = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (pageAllChecked) pageApplicationIds.forEach((id) => next.delete(id));
      else pageApplicationIds.forEach((id) => next.add(id));
      return next;
    });
  const clearSelection = () => setChecked(new Set());

  const moveSelected = async () => {
    const ids = movable.map((c) => c.id);
    clearSelection();
    await Promise.all(ids.map((id) => advanceStage(id, actor)));
    toast.success(`Moved ${ids.length} candidate${ids.length === 1 ? "" : "s"} to ${moveLabel}.`);
  };

  const Th = ({ label, k, className }) => (
    <th className={cn("px-4 py-3 text-left", className)}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary">
        {label}
        {sort.key === k ? (
          sort.dir === "asc" ? <ChevronUp size={13} /> : <ChevronDown size={13} />
        ) : (
          <ChevronUp size={13} className="opacity-20" />
        )}
      </button>
    </th>
  );

  return (
    <div className="p-4 sm:p-7">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Candidates</h1>
          <p className="text-sm font-medium text-muted-foreground">
            {loading ? "Loading…" : `${groupedRows.length} of ${uniquePeople(candidates)} candidates`}
          </p>
        </div>
      </div>

      {/* view segments — talent pool = rejected candidates kept for future roles */}
      <div className="mt-5 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-semibold transition-colors",
              view === v.id ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-background"
            )}
          >
            {v.label}
            <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", view === v.id ? "bg-card/20" : "bg-secondary text-muted-foreground")}>
              {counts[v.id]}
            </span>
          </button>
        ))}
      </div>

      {/* filters */}
      <Card className="relative z-30 mt-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div ref={aiWrapRef} className="relative min-w-[220px] flex-1">
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <Search size={15} className="shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, email, skills…"
                className="w-full bg-transparent text-foreground placeholder:text-[#94A3B8] focus:outline-none"
              />
              <button
                onClick={() => setAiOpen((o) => !o)}
                title="Screen candidates with AI"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors",
                  aiOpen ? "border-primary bg-primary text-primary-foreground" : "border-primary/40 bg-primary/[0.06] text-primary hover:bg-primary/10"
                )}
              >
                <Sparkles size={13} /> AI Mode
              </button>
            </div>

            {/* AI screening popover — scores everyone currently visible on this
                page (across positions); results also populate the AI Score column. */}
            {aiOpen && (
              <div className="absolute left-0 top-full z-40 mt-2 w-full sm:max-w-[680px]">
                <AiFilter candidates={candidates} onOpen={setSelected} onClose={() => setAiOpen(false)} onResults={setAiResults} />
              </div>
            )}
          </div>
          <Select value={position} onChange={(e) => setPosition(e.target.value)} className="w-auto min-w-[150px]">
            <option value="">All positions</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
          <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-auto min-w-[130px]">
            <option value="">All stages</option>
            {stagesPresent.map((s) => <option key={s} value={s}>{stageLabelOf(s)}</option>)}
          </Select>
          <Select value={qualification} onChange={(e) => setQualification(e.target.value)} className="w-auto min-w-[150px]">
            <option value="">All qualifications</option>
            {QUALIFICATIONS.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
          <Select value={experience} onChange={(e) => setExperience(e.target.value)} className="w-auto min-w-[140px]">
            <option value="">All experience</option>
            {EXPERIENCE_RANGES.map((x) => <option key={x} value={x}>{x}</option>)}
          </Select>
          {activeFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary">
              <SlidersHorizontal size={14} /> Clear
            </button>
          )}
        </div>
      </Card>

      {/* bulk action bar — appears once you tick people */}
      {selectedRows.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">
            {selectedRows.length} selected
            {movable.length > 0 && (
              <span className="ml-2 font-medium text-muted-foreground">· {movable.length} can move to {moveLabel}</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary">
              <X size={14} /> Clear
            </button>
            <Button
              onClick={moveSelected}
              disabled={movable.length === 0}
              title={movable.length === 0 ? "None of the selected candidates can move — only people in Applied are eligible" : undefined}
            >
              <ChevronRight size={15} /> Move {movable.length} to {moveLabel}
            </Button>
          </div>
        </div>
      )}

      {/* table */}
      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-background text-[13px]">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={pageAllChecked}
                    onChange={toggleAllVisible}
                    aria-label="Select all candidates on this page"
                    className="h-4 w-4 cursor-pointer accent-primary"
                  />
                </th>
                <Th label="Candidate" k="name" />
                <th className="px-4 py-3 text-left font-semibold text-foreground">Candidate ID</th>
                <Th label="Position" k="position" />
                <Th label="Qualification" k="qualification" />
                <Th label="Experience" k="experience" />
                <th className="px-4 py-3 text-left font-semibold text-foreground">Location</th>
                <Th label="Applied" k="appliedAt" />
                <th className="px-4 py-3 text-left font-semibold text-foreground">CV</th>
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Loading candidates…</td></tr>
              ) : groupedRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No candidates match these filters.</td></tr>
              ) : (
                pageGroups.map((c) => (
                  <tr
                    key={c.key}
                    onClick={() => setSelected(c.applications[0])}
                    className={cn(
                      "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-background",
                      c.applications.some((a) => checked.has(a.id)) && "bg-primary/5"
                    )}
                  >
                    <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={c.applications.every((a) => checked.has(a.id))}
                        onChange={() => toggleGroup(c)}
                        aria-label={`Select ${displayName(c)}`}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={displayName(c)} color={c.avatarColor} size={34} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-foreground">{displayName(c)}</span>
                            {c.source === "Role change" && (
                              <span className="shrink-0 rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-[#A5B4FC]" title={`Internal role change from ${c.fromRole || "current role"}${c.fromEmployeeId ? ` (${c.fromEmployeeId})` : ""}`}>
                                Role change
                              </span>
                            )}
                            {c.needsReview && (
                              <span className="shrink-0 rounded bg-[#FBF1DC] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]" title={c.cvValidation?.reason || "CV validation was borderline — worth a second look"}>
                                Needs review
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{c.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{c.candidateId || "—"}</span>
                    </td>
                    {/* One self-contained "chip" per application — title, eligibility,
                        stage and AI score all live together, so wrapping or a longer
                        title never desyncs which stage/score belongs to which position
                        (the old separate-columns layout let them drift apart). The
                        Applied column below lists dates in the same order so it still
                        lines up with these top to bottom. */}
                    <td className="min-w-[220px] px-4 py-3 align-top text-muted-foreground">
                      <div className="space-y-1.5">
                        {c.applications.map((a) => (
                          <div
                            key={a.id}
                            onClick={(e) => { e.stopPropagation(); setSelected(a); }}
                            className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 transition-colors hover:border-primary/40"
                          >
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="max-w-[150px] truncate font-medium text-foreground" title={titleFor(a.positionId)}>
                                {titleFor(a.positionId)}
                              </span>
                              <StageBadge stageId={a.stage} />
                              <div className="ml-auto flex items-center gap-1.5">
                                {aiScoreById.has(a.id) && (
                                  <span
                                    className={cn("rounded px-1.5 py-0.5 text-[11px] font-bold", aiScorePill(aiScoreById.get(a.id).score))}
                                    title={aiScoreById.get(a.id).reason}
                                  >
                                    {aiScoreById.get(a.id).score}%
                                  </span>
                                )}
                                <EligibilityTag candidateQual={c.highestQualification} minQual={minQualFor(a.positionId)} />
                              </div>
                            </div>
                            {a.stage === "rejected" && a.rejection?.reason && (
                              <div className="mt-1 text-[11px] font-medium text-[#DC2626]">{a.rejection.reason}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{c.highestQualification || "—"}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{c.experience || "—"}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">{c.location || "—"}</td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      <div className="space-y-1.5">
                        {c.applications.map((a) => (
                          <div key={a.id} className="py-1.5 leading-none">{formatDate(a.appliedAt)}</div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {c.cvDataUrl ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadDataUrl(c.cvDataUrl, c.cvFileName || "cv"); }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-secondary"
                          title={c.cvFileName}
                        >
                          <Download size={13} /> CV
                        </button>
                      ) : (
                        <span className="text-xs text-[#94A3B8]">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* pagination */}
      {!loading && groupedRows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, groupedRows.length)}</span> of {groupedRows.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft size={15} /> Prev
            </button>
            <span className="px-2 text-sm font-semibold text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-40"
            >
              Next <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      <CandidateDetailModal
        open={!!selected}
        onClose={() => setSelected(null)}
        candidate={selected && (candidates.find((x) => x.id === selected.id) || selected)}
        position={selected ? positionFor(selected.positionId) : null}
        positionTitle={selected ? titleFor(selected.positionId) : ""}
      />
    </div>
  );
}
