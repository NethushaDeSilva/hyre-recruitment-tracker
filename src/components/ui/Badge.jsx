// Status + stage pills. Colours come from the stage catalogue / brand tokens,
// applied via inline style so Tailwind never purges dynamic classes.
import { stageInfo } from "@/lib/stages";

export function StageBadge({ stageId }) {
  const s = stageInfo(stageId);
  if (!s) return null;
  return (
    <span
      className="stage-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: s.badgeBg, color: s.badgeFg, "--pill": s.dot }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

// Open = green, Pending = amber, Closed (or anything else) = grey.
const STATUS_STYLE = {
  Open: { bg: "#E7F6EC", fg: "#16A34A", dot: "#16A34A" },
  Pending: { bg: "#FBF1DC", fg: "#A9781A", dot: "#E0A422" },
  Closed: { bg: "#EEF1F5", fg: "#64748B", dot: "#94A3B8" },
};

export function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Closed;
  const label = status === "Pending" ? "Pending approval" : status;
  return (
    <span
      className="stage-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ background: s.bg, color: s.fg, "--pill": s.dot }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {label}
    </span>
  );
}
