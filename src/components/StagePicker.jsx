// Pick which interview/screening stages a vacancy uses. Applied + Hired are
// locked on; the middle stages are toggleable so each vacancy can have its own
// process (e.g. a senior role adds Final Interview; a junior role skips it).
import { Check, Lock } from "lucide-react";
import { CONFIGURABLE_STAGES, STAGES } from "@/lib/stages";
import { ROLE_LABELS } from "@/lib/permissions";

function LockedRow({ stageId }) {
  const s = STAGES[stageId];
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#E9EEF4] bg-[#F6F8FB] px-3 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.dot }} />
      <span className="flex-1 text-sm font-semibold text-foreground">{s.label}</span>
      <Lock size={13} className="text-[#94A3B8]" />
    </div>
  );
}

export default function StagePicker({ value, onChange }) {
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((s) => s !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <LockedRow stageId="applied" />
      {CONFIGURABLE_STAGES.map((id) => {
        const s = STAGES[id];
        const on = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              on ? "border-primary bg-secondary" : "border-[#E9EEF4] bg-card hover:bg-background"
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                on ? "border-primary bg-primary text-primary-foreground" : "border-[#C7D2E0] bg-card"
              }`}
            >
              {on && <Check size={13} strokeWidth={3} />}
            </span>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.dot }} />
            <span className="flex-1 text-sm font-semibold text-foreground">{s.label}</span>
            <span className="text-xs font-medium text-muted-foreground">{ROLE_LABELS[s.owner] || "—"}</span>
          </button>
        );
      })}
      <LockedRow stageId="hired" />
    </div>
  );
}
