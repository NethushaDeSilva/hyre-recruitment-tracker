// Candidates table <colgroup> + <thead> — extracted from CandidatesTable.jsx
// to keep it under the ~300-line component limit. Match's header is a special
// case: it's only sortable once a position filter scopes every row to one
// score (see the "Select a position" notice next to the filter), so it
// doesn't go through the generic toggleSort() the other columns use.
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function CandidatesTableHead({ sort, toggleSort, setSort, position, pageAllChecked, toggleAllVisible }) {
  const Th = ({ label, k }) => (
    <th className="px-4 py-3 text-left">
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
    <>
      {/* Every column has an explicit width — with table-fixed + w-full,
          all-explicit widths scale proportionally to fill the row, so no
          single column can balloon and crowd out the rest. */}
      <colgroup>
        <col className="w-10" />
        <col className="w-[200px]" />
        <col className="w-[100px]" />
        <col className="w-[260px]" />
        <col className="w-[140px]" />
        <col className="w-[110px]" />
        <col className="w-[90px]" />
        <col className="w-[100px]" />
        <col className="w-[80px]" />
      </colgroup>
      <thead className="border-b border-border bg-background text-[13px]">
        <tr>
          <th className="px-4 py-3">
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
          <th className="px-4 py-3 text-left">
            <button
              onClick={() => position && setSort({ key: "match", dir: "desc" })}
              disabled={!position}
              title={!position ? "Select a position to sort by match" : undefined}
              className={cn(
                "inline-flex items-center gap-1 font-semibold",
                position ? "text-foreground hover:text-primary" : "cursor-not-allowed text-muted-foreground opacity-50"
              )}
            >
              Match
              {sort.key === "match" ? <ChevronDown size={13} /> : <ChevronUp size={13} className="opacity-20" />}
            </button>
          </th>
          <Th label="Qualification" k="qualification" />
          <Th label="Experience" k="experience" />
          <Th label="Applied" k="appliedAt" />
          <th className="px-4 py-3 text-left font-semibold text-foreground">CV</th>
        </tr>
      </thead>
    </>
  );
}
