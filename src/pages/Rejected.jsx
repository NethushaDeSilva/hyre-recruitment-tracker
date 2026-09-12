// Rejected — the talent pool. A rejected candidate is never deleted (see
// firestore.rules — REJECTED can never be deleted); they move here instead of
// staying mixed into the active Candidates list, exactly the way a HIRED
// candidate moves to Employees. HR can reconsider someone from here via the
// detail modal, which moves them back to "applied" on their original position.
import { useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown, Download } from "lucide-react";
import { useHyreData } from "@/data/store";
import { visiblePositions } from "@/lib/stages";
import { useAuth } from "@/context/AuthContext";
import { useStaggerReveal } from "@/hooks/useStaggerReveal";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate, displayName } from "@/lib/format";
import { downloadDataUrl } from "@/lib/file";
import CandidateDetailModal from "@/components/CandidateDetailModal";
import { HoverScrollText } from "@/components/ui/HoverScrollText";
import { cn } from "@/lib/utils";

export default function Rejected() {
  const { user } = useAuth();
  const { positions: allPositions, candidates: allCandidates, loading } = useHyreData();
  const positions = useMemo(() => visiblePositions(allPositions, user), [allPositions, user]);

  const rejected = useMemo(() => {
    const ids = new Set(positions.map((p) => p.id));
    return allCandidates.filter((c) => ids.has(c.positionId) && c.stage === "rejected");
  }, [allCandidates, positions]);

  const [q, setQ] = useState("");
  const [position, setPosition] = useState("");
  const [sort, setSort] = useState({ key: "appliedAt", dir: "desc" });
  const [selected, setSelected] = useState(null);

  const titleFor = (id) => positions.find((p) => p.id === id)?.title || "—";
  const positionFor = (id) => positions.find((p) => p.id === id) || null;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rejected.filter((c) => {
      if (position && c.positionId !== position) return false;
      if (needle) {
        const hay = `${displayName(c)} ${c.email} ${c.skills} ${titleFor(c.positionId)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c) => (sort.key === "name" ? displayName(c).toLowerCase() : sort.key === "position" ? titleFor(c.positionId).toLowerCase() : c.appliedAt);
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rejected, positions, q, position, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const bodyRef = useStaggerReveal(!loading && rows.length > 0, { selector: ":scope > tr", stagger: 35, distance: 10 });

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
      <div className="space-y-1.5">
        <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Rejected</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} of ${rejected.length} candidates`}
          <span className="ml-1 text-[#94A3B8]">· kept in the talent pool, never deleted</span>
        </p>
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
        </div>
      </Card>

      {/* table */}
      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-border bg-background text-[13px]">
              <tr>
                <Th label="Candidate" k="name" />
                <Th label="Position" k="position" />
                <th className="px-4 py-3 text-left font-semibold text-foreground">Reason</th>
                <Th label="Applied" k="appliedAt" />
                <th className="px-4 py-3 text-left font-semibold text-foreground">CV</th>
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">No rejected candidates match these filters.</td></tr>
              ) : (
                rows.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-background"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={displayName(c)} color={c.avatarColor} size={34} />
                        <div className="min-w-0 flex-1">
                          <HoverScrollText text={displayName(c)} className="text-sm font-semibold text-foreground" />
                          <HoverScrollText text={c.email || "—"} className="text-xs text-muted-foreground" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <HoverScrollText text={titleFor(c.positionId)} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <HoverScrollText text={c.rejection?.reason || "—"} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(c.appliedAt)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {c.cvDataUrl ? (
                        <button
                          onClick={() => downloadDataUrl(c.cvDataUrl, c.cvFileName || "cv")}
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

      <CandidateDetailModal
        open={!!selected}
        onClose={() => setSelected(null)}
        candidate={selected && (rejected.find((x) => x.id === selected.id) || selected)}
        position={selected ? positionFor(selected.positionId) : null}
        positionTitle={selected ? titleFor(selected.positionId) : ""}
      />
    </div>
  );
}
