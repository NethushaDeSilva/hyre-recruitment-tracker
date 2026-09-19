import { isActiveCandidate } from "@/lib/candidateCounts";
// Candidates table (HR / Management) — every ACTIVE applicant across all
// positions in a sortable table. Hired candidates live on Employees; rejected
// candidates live on Rejected — this table only ever holds people still in
// the pipeline. Filter by position or free-text search, sort by any column,
// download/view each CV. Stage changes happen on the position board, where
// there's stage context — this is a cross-position lookup, not a workspace.
import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useHyreData, bulkReject } from "@/data/store";
import { canActOnStageFor, visiblePositions } from "@/lib/stages";
import { useAuth } from "@/context/AuthContext";
import { useStaggerReveal } from "@/hooks/useStaggerReveal";
import { QUALIFICATIONS, EXPERIENCE_RANGES } from "@/lib/application";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/ToastProvider";
import { displayName } from "@/lib/format";
import { sortApplications } from "../../functions/_lib/filtration/engine.js";
import CandidateDetailModal from "@/components/CandidateDetailModal";
import RejectModal from "@/components/RejectModal";
import CandidatesTableRow from "@/pages/CandidatesTableRow";
import CandidatesTableHead from "@/pages/CandidatesTableHead";
import CandidatesBulkBar from "@/pages/CandidatesBulkBar";

// Ordinal rank so qualification / experience / stage sort meaningfully, not A–Z.
const rank = (list, v) => {
  const i = list.indexOf(v);
  return i < 0 ? list.length : i;
};
export default function CandidatesTable() {
  const { user } = useAuth();
  const { positions: allPositions, candidates: allCandidates, scores, loading } = useHyreData();
  const toast = useToast();
  const actor = user ? { name: user.name, role: user.role, uid: user.uid || user.email || user.name } : null;
  // HR sees candidates only from positions they're assigned to; Management: all.
  const positions = useMemo(() => visiblePositions(allPositions, user), [allPositions, user]);
  // HIRED people are NOT candidates anymore — they live on the Employees page,
  // and REJECTED people live on the Rejected page — this table only holds
  // people still active in the pipeline.
  const candidates = useMemo(() => {
    const ids = new Set(positions.map((p) => p.id));
    return allCandidates.filter((c) => ids.has(c.positionId) && isActiveCandidate(c));
  }, [allCandidates, positions]);
  const [q, setQ] = useState("");
  const [position, setPosition] = useState("");
  const [sort, setSort] = useState({ key: "appliedAt", dir: "desc" });
  const [selected, setSelected] = useState(null);
  const [checked, setChecked] = useState(() => new Set()); // ticked candidate ids for bulk actions
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);

  const titleFor = (id) => positions.find((p) => p.id === id)?.title || "—";
  const positionFor = (id) => positions.find((p) => p.id === id) || null;

  // Match is only sortable once a single position scopes every row to exactly
  // one score (see the "Select a position" notice next to the filter) — a
  // person's several applications can carry different scores against
  // different vacancies, and there's no meaningful single value to sort a
  // person-row by across them.
  useEffect(() => {
    if (position) setSort({ key: "match", dir: "desc" });
    else setSort((s) => (s.key === "match" ? { key: "appliedAt", dir: "desc" } : s));
  }, [position]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = candidates.filter((c) => {
      if (position && c.positionId !== position) return false;
      if (needle) {
        const hay = `${displayName(c)} ${c.email} ${c.skills} ${c.currentRole} ${c.currentCompany} ${titleFor(c.positionId)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    // Match sort reuses the WS5 5.8 tie-break chain verbatim (score desc,
    // core-skills desc, id asc) rather than a second, hand-rolled ordering.
    if (sort.key === "match" && position) {
      const entries = list.map((c) => {
        const s = scores.get(c.id);
        return { candidateId: c.id, status: s?.status === "scored" ? "scored" : "unscored", result: s?.status === "scored" ? s : undefined };
      });
      const orderedIds = sortApplications(entries).map((e) => e.candidateId);
      const byId = new Map(list.map((c) => [c.id, c]));
      return orderedIds.map((id) => byId.get(id));
    }

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
  }, [candidates, positions, q, position, sort, scores]);

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

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const clearFilters = () => {
    setQ(""); setPosition("");
  };
  const activeFilters = q || position;

  // --- pagination (keeps big lists — 700+ CVs — snappy and readable) ---
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  // jump back to page 1 whenever the result set changes
  useEffect(() => setPage(1), [q, position, sort]);
  const totalPages = Math.max(1, Math.ceil(groupedRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageGroups = groupedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const bodyRef = useStaggerReveal(!loading && pageGroups.length > 0, { selector: ":scope > tr", stagger: 35, distance: 10 });

  // --- bulk selection (the "select all" tick acts on the current page) ---
  // `checked` still stores APPLICATION ids underneath — a grouped row's checkbox
  // just toggles every application belonging to that person at once, so the
  // reject logic below (which is inherently per-application) needs no changes.
  const selectedRows = rows.filter((c) => checked.has(c.id));
  const pageApplicationIds = pageGroups.flatMap((g) => g.applications.map((a) => a.id));
  const pageAllChecked = pageApplicationIds.length > 0 && pageApplicationIds.every((id) => checked.has(id));

  // Bulk reject — any selected candidate the acting user owns the current
  // stage of (Management: any stage). Same permission gate the position
  // board's bulk reject uses, and rejectCandidate/bulkReject in store.js is
  // the one path both write through.
  const rejectable = selectedRows.filter((c) => canActOnStageFor(user, positionFor(c.positionId), c.stage));

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

      {/* filters */}
      <Card className="relative z-30 mt-5 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <Search size={15} className="shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, email, skills…"
                className="w-full bg-transparent text-foreground placeholder:text-[#94A3B8] focus:outline-none"
              />
            </div>
          </div>
          <Select value={position} onChange={(e) => setPosition(e.target.value)} className="w-auto min-w-[150px]">
            <option value="">All positions</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
          {!position && (
            <span className="text-xs font-medium text-muted-foreground">Select a position to sort by score.</span>
          )}
          {activeFilters && (
            <button onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary">
              <SlidersHorizontal size={14} /> Clear
            </button>
          )}
        </div>
      </Card>

      {/* bulk action bar — appears once you tick people */}
      <CandidatesBulkBar
        selectedCount={selectedRows.length}
        rejectable={rejectable}
        onClear={clearSelection}
        onReject={() => setBulkRejectOpen(true)}
      />

      {/* table */}
      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          {/* min-w grew with the Qualification/Experience columns (+50/+55px,
              see CandidatesTableHead.jsx) -- accepted per-audit: the table's
              own scroll region starts a bit sooner at 100% zoom, the page
              body still never scrolls. */}
          <table className="w-full min-w-[1255px] table-fixed text-sm">
            <CandidatesTableHead
              sort={sort}
              toggleSort={toggleSort}
              setSort={setSort}
              position={position}
              pageAllChecked={pageAllChecked}
              toggleAllVisible={toggleAllVisible}
            />
            <tbody ref={bodyRef}>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">Loading candidates…</td></tr>
              ) : groupedRows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">No candidates match these filters.</td></tr>
              ) : (
                pageGroups.map((c) => (
                  <CandidatesTableRow
                    key={c.key}
                    c={c}
                    checked={checked}
                    toggleGroup={toggleGroup}
                    titleFor={titleFor}
                    positionFor={positionFor}
                    scores={scores}
                    onOpenCandidate={setSelected}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {!loading && (
        <Pagination page={currentPage} totalPages={totalPages} total={groupedRows.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      )}

      <CandidateDetailModal
        open={!!selected}
        onClose={() => setSelected(null)}
        candidate={selected && (candidates.find((x) => x.id === selected.id) || selected)}
        position={selected ? positionFor(selected.positionId) : null}
        positionTitle={selected ? titleFor(selected.positionId) : ""}
        scoreDoc={selected ? scores.get(selected.id) : null}
      />
      <RejectModal
        open={bulkRejectOpen}
        count={rejectable.length}
        onClose={() => setBulkRejectOpen(false)}
        onConfirm={async ({ reason, comment }) => {
          const ids = rejectable.map((c) => c.id);
          clearSelection();
          const n = await bulkReject(ids, { reason, comment, actor });
          toast.success(`Rejected ${n} candidate${n === 1 ? "" : "s"}.`);
        }}
      />
    </div>
  );
}
