// Prev/Next pager with a "Showing X–Y of Z" label — shared by any paginated
// table (currently Candidates; extracted so a second list doesn't reinvent it).
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, totalPages, total, pageSize, onPageChange }) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        Showing <span className="font-semibold text-foreground">{start}–{end}</span> of {total}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-40"
        >
          <ChevronLeft size={15} /> Prev
        </button>
        <span className="px-2 text-sm font-semibold text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-background disabled:pointer-events-none disabled:opacity-40"
        >
          Next <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
