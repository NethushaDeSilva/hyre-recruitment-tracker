// One [start] [end] [remove] row used by a day panel's "Available times"
// section (Part A). `step="900"`
// snaps the native time picker to 15-minute increments at the UI layer;
// validateDay() (src/lib/weeklyAvailability.js) is the real, authoritative
// check that runs regardless of how the value got there (typed, pasted).
import { Trash2, AlertCircle, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/Field";

export default function TimeRangeRow({ row, onChange, onRemove, error, warning, removeLabel }) {
  return (
    <div>
      <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5">
        <Input type="time" step={900} value={row.start} onChange={(e) => onChange({ start: e.target.value })} className="!w-auto shrink-0" />
        <span className="shrink-0 text-xs text-muted-foreground">to</span>
        <Input type="time" step={900} value={row.end} onChange={(e) => onChange({ end: e.target.value })} className="!w-auto shrink-0" />
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-[#DC2626]"
        >
          <Trash2 size={14} />
        </button>
      </div>
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[#DC2626]">
          <AlertCircle size={12} className="shrink-0" /> {error}
        </p>
      )}
      {!error && warning && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[#B45309] dark:text-[#FBBF24]">
          <AlertTriangle size={12} className="shrink-0" /> {warning}
        </p>
      )}
    </div>
  );
}
