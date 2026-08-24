// Employees — the HIRED roster. Once a candidate is moved to "hired" they stop
// being a candidate and appear here instead, identified by their EMPLOYEE ID
// (e.g. SE-SNE-0001), job role and department. HR & Management only.
import { useMemo, useState } from "react";
import { Search, ChevronUp, ChevronDown, Download, BadgeCheck } from "lucide-react";
import { useHyreData } from "@/data/store";
import { visiblePositions } from "@/lib/stages";
import { useAuth } from "@/context/AuthContext";
import { useStaggerReveal } from "@/hooks/useStaggerReveal";
import { departmentCode } from "@/lib/departments";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate } from "@/lib/format";
import { downloadDataUrl } from "@/lib/file";
import CandidateDetailModal from "@/components/CandidateDetailModal";
import { cn } from "@/lib/utils";

// Numeric part of an employee id, so "…-0002" sorts after "…-0001" not lexically.
const empNum = (id) => { const m = /(\d+)\s*$/.exec(String(id || "")); return m ? Number(m[1]) : 0; };

export default function Employees() {
  const { user } = useAuth();
  const { positions: allPositions, candidates: allCandidates, loading } = useHyreData();
  // HR sees hires from positions they're assigned to; Management: all.
  const positions = useMemo(() => visiblePositions(allPositions, user), [allPositions, user]);
  const posById = useMemo(() => new Map(positions.map((p) => [p.id, p])), [positions]);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "employeeId", dir: "asc" });
  const [selected, setSelected] = useState(null);

  // hired people whose position is visible to this user, decorated with role + dept.
  // One row per PERSON — their MOST RECENT hire — so an internal promotion (a role
  // change that got hired into the new role) shows the new role, not two rows.
  const employees = useMemo(() => {
    const ids = new Set(positions.map((p) => p.id));
    const byPerson = new Map();
    for (const c of allCandidates) {
      if (c.stage !== "hired" || !ids.has(c.positionId)) continue;
      const key = c.submittedByUid || (c.email || "").toLowerCase() || c.id;
      const prev = byPerson.get(key);
      if (!prev || (c.hiredAt || 0) > (prev.hiredAt || 0)) byPerson.set(key, c);
    }
    return [...byPerson.values()].map((c) => {
      const pos = posById.get(c.positionId);
      return {
        ...c,
        role: c.employeeRole || pos?.title || c.appliedRole || "—",
        dept: c.employeeDept || pos?.department || "—",
      };
    });
  }, [allCandidates, positions, posById]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = employees.filter((e) => {
      if (!needle) return true;
      const hay = `${e.name} ${e.email} ${e.employeeId} ${e.role} ${e.dept} ${e.candidateId}`.toLowerCase();
      return hay.includes(needle);
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (e) => {
      switch (sort.key) {
        case "name": return e.name.toLowerCase();
        case "role": return e.role.toLowerCase();
        case "dept": return e.dept.toLowerCase();
        case "hiredAt": return e.hiredAt || 0;
        case "employeeId":
        default: return empNum(e.employeeId);
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [employees, q, sort]);

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const bodyRef = useStaggerReveal(!loading && rows.length > 0, { selector: ":scope > tr", stagger: 40, distance: 10 });

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
        <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Employees</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} hired ${rows.length === 1 ? "employee" : "employees"}`}
          <span className="ml-1 text-[#94A3B8]">· issued an employee ID on hire</span>
        </p>
      </div>

      {/* search */}
      <Card className="mt-5 p-4">
        <div className="flex min-w-[220px] items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <Search size={15} className="text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search employee ID, name, role, department…"
            className="w-full bg-transparent text-foreground placeholder:text-[#94A3B8] focus:outline-none"
          />
        </div>
      </Card>

      {/* table */}
      <Card className="mt-5 overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border bg-background text-[13px]">
              <tr>
                <Th label="Employee ID" k="employeeId" />
                <Th label="Employee" k="name" />
                <Th label="Job role" k="role" />
                <Th label="Department" k="dept" />
                <Th label="Hired" k="hiredAt" />
                <th className="px-4 py-3 text-left font-semibold text-foreground">CV</th>
              </tr>
            </thead>
            <tbody ref={bodyRef}>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Loading employees…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No employees yet — people appear here the moment they're hired.
                </td></tr>
              ) : (
                rows.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-background"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-[#16A34A]/12 px-2 py-1 font-mono text-xs font-bold tracking-wide text-[#15803D]">
                        <BadgeCheck size={13} /> {e.employeeId || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={e.name} color={e.avatarColor} size={34} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-foreground">{e.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{e.email || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground">{e.role}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.dept} <span className="ml-1 font-mono text-[11px] text-[#94A3B8]">({departmentCode(e.dept)})</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{e.hiredAt ? formatDate(e.hiredAt) : "—"}</td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      {e.cvDataUrl ? (
                        <button
                          onClick={() => downloadDataUrl(e.cvDataUrl, e.cvFileName || `${e.name}-cv`)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
                        >
                          <Download size={13} /> CV
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
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
        candidate={selected}
        positionTitle={selected ? posById.get(selected.positionId)?.title || "" : ""}
      />
    </div>
  );
}
