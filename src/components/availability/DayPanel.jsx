// One day's editor: a single Available-times section, plus on Saturday and
// Sunday ONLY, a "Remove this day" affordance (Part A spec — a weekday
// expresses "not working" the ordinary way: zero available rows). There is no
// separate "blocked" section — anything not listed as available is already
// treated as busy (src/lib/availability.js only ever reads declared `slots`
// as free; everything else is implicitly unavailable).
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WEEKEND_KEYS, DAY_LABELS } from "@/lib/weeklyAvailability";
import TimeRangeRow from "./TimeRangeRow";

function issueFor(validation, list, index) {
  const error = validation.errors.find((e) => e.list === list && e.index === index);
  const warning = validation.warnings.find((w) => w.list === list && w.index === index);
  return { error: error?.message, warning: warning?.message };
}

export default function DayPanel({ dayKey, day, validation, onAddRow, onChangeRow, onRemoveRow, onRemoveDay, onRestoreDay }) {
  const isWeekend = WEEKEND_KEYS.includes(dayKey);
  const label = DAY_LABELS[dayKey];

  if (day.enabled === false) {
    // Only reachable for sat/sun — weekdays never have their `enabled` flag
    // flipped, so this branch is structurally absent from Mon–Fri.
    return (
      <div className="space-y-3 rounded-lg border border-[#E9EEF4] bg-card p-6 shadow-card">
        <p className="text-sm text-muted-foreground">You are not working on {label}s.</p>
        <Button variant="ghost" onClick={onRestoreDay} className="!px-3 !py-1.5 text-xs">
          Restore {label}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {isWeekend && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onRemoveDay}
            className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-[#DC2626]"
          >
            Remove this day
          </button>
        </div>
      )}

      <div className="space-y-3 rounded-lg border border-[#BBF0CE] bg-[#F0FBF4] p-5 dark:border-[#1c4a2e] dark:bg-[#0f2418]">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[13px] font-bold text-[#16A34A]">Available times</h3>
          <Button variant="ghost" onClick={onAddRow} className="!px-3 !py-1.5 text-xs">
            <Plus size={14} /> Add available time
          </Button>
        </div>
        {day.available.length === 0 && <p className="text-sm text-muted-foreground">No available times set for this day.</p>}
        <div className="space-y-2">
          {day.available.map((row, i) => {
            const { error, warning } = issueFor(validation, "available", i);
            return (
              <TimeRangeRow
                key={i}
                row={row}
                error={error}
                warning={warning}
                removeLabel={`Remove available time ${i + 1} on ${label}`}
                onChange={(patch) => onChangeRow("available", i, patch)}
                onRemove={() => onRemoveRow("available", i)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
