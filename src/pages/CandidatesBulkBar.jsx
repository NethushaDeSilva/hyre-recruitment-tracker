// Bulk action bar for the Candidates table — extracted from
// CandidatesTable.jsx to keep it under the ~300-line component limit. Purely
// a selection summary + two buttons; all the actual move/reject logic (and
// the permission gating behind which candidates are eligible) stays in the
// page, which owns the selection state.
import { ChevronRight, X, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function CandidatesBulkBar({ selectedCount, movable, moveLabel, rejectable, onClear, onMove, onReject }) {
  if (selectedCount === 0) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3">
      <span className="text-sm font-semibold text-foreground">
        {selectedCount} selected
        {movable.length > 0 && (
          <span className="ml-2 font-medium text-muted-foreground">· {movable.length} can move to {moveLabel}</span>
        )}
        {rejectable.length > 0 && (
          <span className="ml-2 font-medium text-muted-foreground">· {rejectable.length} can be rejected</span>
        )}
      </span>
      <div className="flex items-center gap-2">
        <button onClick={onClear} className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary">
          <X size={14} /> Clear
        </button>
        <Button
          variant="danger"
          onClick={onReject}
          disabled={rejectable.length === 0}
          title={rejectable.length === 0 ? "None of the selected candidates can be rejected by you" : undefined}
        >
          <Ban size={15} /> Reject {rejectable.length}
        </Button>
        <Button
          onClick={onMove}
          disabled={movable.length === 0}
          title={movable.length === 0 ? "None of the selected candidates can move — only people in Applied are eligible" : undefined}
        >
          <ChevronRight size={15} /> Move {movable.length} to {moveLabel}
        </Button>
      </div>
    </div>
  );
}
