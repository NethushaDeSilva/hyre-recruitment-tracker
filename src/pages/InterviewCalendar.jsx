// WS8 §8.2a — the interviewer availability calendar. Read-only in this
// shape: selecting a slot to actually book lives in Part C (the automated
// request/accept/decline flow, plus HR's manual override, §15), where there
// is a real destination for that action. Building a click handler here with
// nothing on the other end would be exactly the half-finished feature
// CLAUDE.md rules out.
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { listInterviewers, getStaffAvailability, notifyUser } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { weekStart, addWeeks, hourRange } from "@/lib/scheduleGrid";
import { Button } from "@/components/ui/Button";
import InterviewCalendarLegend from "@/pages/InterviewCalendarLegend";
import InterviewCalendarGrid from "@/pages/InterviewCalendarGrid";

// WS8 §7b — side-by-side sub-columns per person sharing a day; above three
// the lanes just keep shrinking, so three is the cap. A person beyond the
// cap doesn't disappear from the legend, they're just not toggle-able onto
// the grid until one of the three visible is deselected — the legend shows
// a "+N more" count instead of silently letting a 4th lane squeeze in.
const MAX_VISIBLE = 3;

function weekLabel(startMs) {
  const end = startMs + 6 * 86400000;
  const opts = { day: "numeric", month: "short" };
  return `${new Date(startMs).toLocaleDateString("en-GB", opts)} – ${new Date(end).toLocaleDateString("en-GB", opts)}`;
}

export default function InterviewCalendar() {
  const { user } = useAuth();
  const [weekStartMs, setWeekStartMs] = useState(() => weekStart(Date.now()));
  const [showFullDay, setShowFullDay] = useState(false);
  const [interviewers, setInterviewers] = useState([]);
  const [visible, setVisible] = useState([]);
  const [availability, setAvailability] = useState({});
  const [loading, setLoading] = useState(true);
  const [requested, setRequested] = useState(new Set());

  useEffect(() => {
    let alive = true;
    listInterviewers()
      .then((list) => {
        if (!alive) return;
        setInterviewers(list);
        setVisible(list.slice(0, MAX_VISIBLE).map((p) => p.uid));
      })
      .catch((e) => console.error("listInterviewers:", e));
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!visible.length) { setAvailability({}); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    getStaffAvailability(visible, { fromMs: weekStartMs, toMs: weekStartMs + 7 * 86400000 })
      .then((res) => { if (alive) setAvailability(res); })
      .catch((e) => console.error("getStaffAvailability:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, weekStartMs]);

  const toggleVisible = (uid) =>
    setVisible((prev) => {
      if (prev.includes(uid)) return prev.filter((id) => id !== uid);
      if (prev.length >= MAX_VISIBLE) return prev; // §7b — cap at 3, never shrink lanes further
      return [...prev, uid];
    });

  const requestAvailability = async (person) => {
    await notifyUser({
      uid: person.uid,
      type: "availability_request",
      message: `${user?.name || "HR"} is scheduling interviews and needs your current availability — declare it at /availability.`,
    });
    setRequested((prev) => new Set(prev).add(person.uid));
  };

  const visiblePeople = interviewers.filter((p) => visible.includes(p.uid));
  const { startHour, endHour } = hourRange(showFullDay);

  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Interview calendar</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Interviewer availability — declared only, never inferred. Hatched lanes mean no current declaration.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-1.5">
          <button
            type="button"
            onClick={() => setWeekStartMs((w) => addWeeks(w, -1))}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="flex items-center gap-1.5 whitespace-nowrap px-1.5 text-sm font-semibold text-foreground">
            <CalendarDays size={14} className="text-muted-foreground" /> {weekLabel(weekStartMs)}
          </span>
          <button
            type="button"
            onClick={() => setWeekStartMs((w) => addWeeks(w, 1))}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <Button variant={showFullDay ? "subtle" : "ghost"} onClick={() => setShowFullDay((v) => !v)} className="!px-3 !py-1.5 text-xs">
          {showFullDay ? "Full day" : "Working hours"}
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-start gap-4 lg:flex-nowrap">
        <InterviewCalendarLegend
          interviewers={interviewers}
          availability={availability}
          visible={visible}
          maxVisible={MAX_VISIBLE}
          onToggle={toggleVisible}
          onRequest={requestAvailability}
          requested={requested}
        />
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <InterviewCalendarGrid
              weekStartMs={weekStartMs}
              startHour={startHour}
              endHour={endHour}
              people={visiblePeople}
              availability={availability}
            />
          )}
        </div>
      </div>
    </div>
  );
}
