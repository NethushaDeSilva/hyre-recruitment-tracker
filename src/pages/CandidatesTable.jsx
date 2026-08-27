// Candidates table (HR / Management) — every applicant across all positions in a
// sortable, filterable table. This is the "CV details in a table" the brief asks
// for: filter by position, stage, qualification, experience or free-text search,
// sort by any column, and download/view each CV.
import { useEffect, useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Download, SlidersHorizontal, X } from "lucide-react";
import { useHyreData } from "@/data/store";
import { stageLabelOf, visiblePositions } from "@/lib/stages";
import { useAuth } from "@/context/AuthContext";
import { useStaggerReveal } from "@/hooks/useStaggerReveal";
import { QUALIFICATIONS, EXPERIENCE_RANGES } from "@/lib/application";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { StageBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate } from "@/lib/format";
import { downloadDataUrl } from "@/lib/file";
import CandidateDetailModal from "@/components/CandidateDetailModal";
import EligibilityTag from "@/components/EligibilityTag";
import { cn } from "@/lib/utils";

// The one-tap qualification shortcuts shown as chips above the filters.
const QUAL_CHIPS = ["GCE O/L", "GCE A/L", "Diploma", "Bachelor's Degree", "Master's Degree"];

// Ordinal rank so qualification / experience / stage sort meaningfully, not A–Z.
const rank = (list, v) => {
  const i = list.indexOf(v);
  return i < 0 ? list.length : i;
};
const STAGE_ORDER = ["applied", "screening", "interview", "final", "hired", "hold", "rejected"];

export default function CandidatesTable() {
  const { user } = useAuth();
  const { positions: allPositions, candidates: allCandidates, loading } = useHyreData();
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
        const hay = `${c.name} ${c.email} ${c.skills} ${c.currentRole} ${c.currentCompany} ${titleFor(c.positionId)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c) => {
      switch (sort.key) {
        case "name": return c.name.toLowerCase();
        case "position": return titleFor(c.positionId).toLowerCase();
        case "qualification": return rank(QUALIFICATIONS, c.highestQualification);
        case "experience": return rank(EXPERIENCE_RANGES, c.experience);
        case "stage": return rank(STAGE_ORDER, c.stage);
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

  const VIEWS = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "pool", label: "Talent pool" },
  ];
  const counts = useMemo(
    () => ({
      all: candidates.length,
      active: candidates.filter((c) => c.stage !== "rejected").length,
      pool: candidates.filter((c) => c.stage === "rejected").length,
    }),
    [candidates]
  );

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const clearFilters = () => {
    setQ(""); setPosition(""); setStage(""); setQualification(""); setExperience("");
  };
  const activeFilters = q || position || stage || qualification || experience;

  // one-tap qualification chip: toggles the exact-qualification filter
  const toggleChip = (qual) => setQualification((cur) => (cur === qual ? "" : qual));

  // --- pagination (keeps big lists — 700+ CVs — snappy and readable) ---
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  // jump back to page 1 whenever the result set changes
  useEffect(() => setPage(1), [q, position, stage, qualification, experience, view, sort]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const bodyRef = useStaggerReveal(!loading && pageRows.length > 0, { selector: ":scope > tr", stagger: 35, distance: 10 });

  // --- bulk selection (the "select all" tick acts on the current page) ---
  const selectedRows = rows.filter((c) => checked.has(c.id));
  const pageAllChecked = pageRows.length > 0 && pageRows.every((c) => checked.has(c.id));
  const cvCount = selectedRows.filter((c) => c.cvDataUrl).length; // how many have a CV to download

  const toggleOne = (id) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAllVisible = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (pageAllChecked) pageRows.forEach((c) => next.delete(c.id));
      else pageRows.forEach((c) => next.add(c.id));
      return next;
    });
  const clearSelection = () => setChecked(new Set());

  // Download the CV file of every selected candidate that has one. Staggered a
  // little so the browser doesn't drop back-to-back downloads.
  const downloadSelected = () => {
    selectedRows
      .filter((c) => c.cvDataUrl)
      .forEach((c, i) => setTimeout(() => downloadDataUrl(c.cvDataUrl, c.cvFileName || `${c.name}-cv`), i * 250));
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
            {loading ? "Loading…" : `${rows.length} of ${candidates.length} candidates`}
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

      {/* quick qualification chips — one tap to narrow, e.g. show only O/L applicants */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Quick filter:</span>
        {QUAL_CHIPS.map((qual) => {
          const on = qualification === qual;
          return (
            <button
              key={qual}
              onClick={() => toggleChip(qual)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:bg-secondary"
              )}
            >
              {qual}
            </button>
          );
        })}
      </div>

      {/* filters */}
      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <Search size={15} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, skills…"
              className="w-full bg-transparent text-foreground placeholder:text-[#94A3B8] focus:outline-none"
            />
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
            <span className="ml-2 font-medium text-muted-foreground">· {cvCount} with a CV</span>
          </span>
          <div className="flex items-center gap-2">
            <button onClick={clearSelection} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary">
              <X size={14} /> Clear
            </button>
            <Button onClick={downloadSelected} disabled={cvCount === 0} title={cvCount === 0 ? "None of the selected candidates have a CV attached" : undefined}>
              <Download size={15} /> Download {cvCount} CV{cvCount === 1 ? "" : "s"}
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
                <Th label="Stage" k="stage" />
                <Th label="Applied" k="appliedAt" />
                <th className="px-4 py-3 text-left font-semibold text-foreground">CV</th>
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">Loading candidates…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">No candidates match these filters.</td></tr>
              ) : (
                pageRows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className={cn(
                      "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-background",
                      checked.has(c.id) && "bg-primary/5"
                    )}
                  >
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checked.has(c.id)}
                        onChange={() => toggleOne(c.id)}
                        aria-label={`Select ${c.name}`}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={c.name} color={c.avatarColor} size={34} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-foreground">{c.name}</span>
                            {c.source === "Role change" && (
                              <span className="shrink-0 rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-[#A5B4FC]" title={`Internal role change from ${c.fromRole || "current role"}${c.fromEmployeeId ? ` (${c.fromEmployeeId})` : ""}`}>
                                Role change
                              </span>
                            )}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{c.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">{c.candidateId || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{titleFor(c.positionId)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>{c.highestQualification || "—"}</span>
                        <EligibilityTag candidateQual={c.highestQualification} minQual={minQualFor(c.positionId)} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.experience || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.location || "—"}</td>
                    <td className="px-4 py-3">
                      <StageBadge stageId={c.stage} />
                      {c.stage === "rejected" && c.rejection?.reason && (
                        <div className="mt-1 text-[11px] font-medium text-[#DC2626]">{c.rejection.reason}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(c.appliedAt)}</td>
                    <td className="px-4 py-3">
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
      {!loading && rows.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, rows.length)}</span> of {rows.length}
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
