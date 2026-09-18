// WS8 §8.2a/§8.5 — one row per visible interviewer. This is where the
// UNKNOWN state has to read at a glance: a person who never declared, or
// whose declaration lapsed, gets a grey "?" instead of their color swatch,
// muted name text, and a real "Request availability" action — never just a
// blank row that could be mistaken for "nothing to report."
import { HelpCircle, Check, Send } from "lucide-react";
import { timeAgo } from "@/lib/format";

export default function InterviewCalendarLegend({ interviewers, availability, visible, maxVisible, onToggle, onRequest, requested }) {
  const atCap = maxVisible != null && visible.length >= maxVisible;
  const hiddenCount = interviewers.length - visible.length;
  return (
    <div className="w-full shrink-0 space-y-1.5 lg:w-64">
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold tracking-[0.1em] text-muted-foreground">INTERVIEWERS</span>
        {/* §7b — never silently shrink the grid's lanes past 3; say what's hidden instead. */}
        {atCap && hiddenCount > 0 && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            +{hiddenCount} more
          </span>
        )}
      </div>
      {interviewers.length === 0 && (
        <p className="px-1 text-sm text-muted-foreground">No interviewers found.</p>
      )}
      {interviewers.map((person) => {
        const av = availability[person.uid];
        const unknown = !av || av.state === "unknown";
        const on = visible.includes(person.uid);
        const disabled = !on && atCap;
        const ageing = av?.declaredAt > 0 && Date.now() - av.declaredAt > 7 * 24 * 60 * 60 * 1000;
        return (
          <div
            key={person.uid}
            className={`flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-xs ${disabled ? "opacity-50" : ""}`}
          >
            <button
              type="button"
              onClick={() => onToggle(person.uid)}
              disabled={disabled}
              title={disabled ? `Deselect someone to add ${person.name} (max ${maxVisible} at once)` : undefined}
              className="flex shrink-0 items-center gap-2 disabled:cursor-not-allowed"
              aria-pressed={on}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${on ? "" : "opacity-30"}`}
                style={unknown ? undefined : { background: person.avatarColor }}
              >
                {unknown ? <HelpCircle size={14} className="text-muted-foreground" strokeWidth={2.5} /> : on ? <Check size={12} strokeWidth={3} /> : ""}
              </span>
              <span className={`min-w-0 whitespace-nowrap text-left font-semibold ${unknown ? "text-muted-foreground" : "text-foreground"}`}>
                {person.name}
              </span>
            </button>

            <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
              {unknown
                ? av?.declaredAt ? `Expired — ${timeAgo(av.declaredAt)}` : "Not declared"
                : `${ageing ? "⚠ " : ""}Updated ${timeAgo(av.declaredAt)}`}
            </span>

            {unknown && (
              <button
                type="button"
                onClick={() => onRequest(person)}
                disabled={requested.has(person.uid)}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <Send size={11} /> {requested.has(person.uid) ? "Requested" : "Request availability"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
