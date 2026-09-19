// WS8 §8.2a — the interviewer availability calendar, now entered through
// role tabs (Fix 2: folded in rather than living as a second page). Landing
// state is exactly three tabs and a prompt — nothing loads until HR picks
// one. Read-only in this shape: selecting a slot to actually book lives in
// Part C (the automated request/accept/decline flow, plus HR's manual
// override, §15), where there is a real destination for that action.
// Building a click handler here with nothing on the other end would be
// exactly the half-finished feature CLAUDE.md rules out.
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Send } from "lucide-react";
import { listStaff, getAvailabilityStates, getStaffAvailability, notifyUser, subscribeInterviewBookings } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import { weekStart, addWeeks, hourRange } from "@/lib/scheduleGrid";
import { Button } from "@/components/ui/Button";
import InterviewCalendarGrid from "@/pages/InterviewCalendarGrid";

const TABS = [
  { key: ROLES.HR, label: "HR" },
  { key: ROLES.INTERVIEWER, label: "Interviewer" },
  { key: ROLES.MANAGEMENT, label: "Management" },
];

function weekLabel(startMs) {
  const end = startMs + 6 * 86400000;
  const opts = { day: "numeric", month: "short" };
  return `${new Date(startMs).toLocaleDateString("en-GB", opts)} – ${new Date(end).toLocaleDateString("en-GB", opts)}`;
}

export default function InterviewCalendar() {
  const { user } = useAuth();
  const [roleTab, setRoleTab] = useState(null); // null = landing state, nothing selected
  const [roleUsers, setRoleUsers] = useState([]);
  const [roleStates, setRoleStates] = useState({}); // uid -> "available" | "unavailable" | "unknown"
  const [listLoading, setListLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);

  const [weekStartMs, setWeekStartMs] = useState(() => weekStart(Date.now()));
  const [showFullDay, setShowFullDay] = useState(false);
  const [availability, setAvailability] = useState({});
  const [gridLoading, setGridLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [scheduleError, setScheduleError] = useState("");
  const [requested, setRequested] = useState(new Set());
  useEffect(() => subscribeInterviewBookings(() => setRevision((r) => r + 1), (e) => setScheduleError(e.message)), []);

  // Picking a role tab loads only that role's users — zero names render
  // until this fires (landing state has no data fetch at all).
  useEffect(() => {
    if (!roleTab) { setRoleUsers([]); setRoleStates({}); return; }
    let alive = true;
    setListLoading(true);
    setSelectedPerson(null);
    listStaff([roleTab]).then(async (list) => {
      if (!alive) return;
      setRoleUsers(list);
      const states = await getAvailabilityStates(list.map((u) => u.uid));
      if (alive) setRoleStates(states);
    }).finally(() => { if (alive) setListLoading(false); });
    return () => { alive = false; };
  }, [roleTab]);

  // Selecting a person loads THEIR real declared-availability + booked-
  // interview record for the visible week — the same data source and the
  // same InterviewCalendarGrid the booking calendar always used, just
  // scoped to one person instead of up to three toggled side by side.
  useEffect(() => {
    if (!selectedPerson) { setAvailability({}); return; }
    let alive = true;
    setGridLoading(true);
    setScheduleError("");
    getStaffAvailability([selectedPerson.uid], { fromMs: weekStartMs, toMs: weekStartMs + 7 * 86400000 })
      .then((res) => { if (alive) setAvailability(res); })
      .catch((e) => setScheduleError(`Could not load bookings: ${e.message}`))
      .finally(() => { if (alive) setGridLoading(false); });
    return () => { alive = false; };
  }, [selectedPerson, weekStartMs, revision]);

  const requestAvailability = async (person) => {
    await notifyUser({
      uid: person.uid,
      type: "availability_request",
      message: `${user?.name || "HR"} is scheduling interviews and needs your current availability — declare it at /availability.`,
    });
    setRequested((prev) => new Set(prev).add(person.uid));
  };

  const tabLabel = TABS.find((t) => t.key === roleTab)?.label;
  const { startHour, endHour } = hourRange(showFullDay);
  const selectedState = selectedPerson ? availability[selectedPerson.uid]?.state : null;
  const selectedUnknown = selectedPerson && (!availability[selectedPerson.uid] || selectedState === "unknown");

  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Interview calendar</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Interviewer availability — declared only, never inferred. Browse by category.
      </p>

      {scheduleError && <p role="alert" className="mt-3 text-sm text-[#DC2626]">{scheduleError}</p>}

      <div className="mt-5 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setRoleTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
              roleTab === t.key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!roleTab && <p className="mt-6 text-sm text-muted-foreground">Select a category to view interviewers.</p>}

      {roleTab && listLoading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {roleTab && !listLoading && !selectedPerson && (
        <div className="mt-5 max-w-xl divide-y divide-border rounded-lg border border-border bg-card">
          {roleUsers.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No {tabLabel} users found.</p>}
          {roleUsers.map((u) => {
            const declared = roleStates[u.uid] && roleStates[u.uid] !== "unknown";
            return (
              <button
                key={u.uid}
                type="button"
                onClick={() => setSelectedPerson(u)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{u.name}</div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABELS[u.role] || u.role}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  declared ? "bg-[#16A34A]/12 text-[#16A34A] dark:text-[#4ADE80]" : "bg-secondary text-muted-foreground"
                }`}>
                  {declared ? "Availability declared" : "No availability"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {roleTab && selectedPerson && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setSelectedPerson(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft size={15} /> Back to {tabLabel}
          </button>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-1.5 py-1.5">
              <button type="button" onClick={() => setWeekStartMs((w) => addWeeks(w, -1))} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Previous week">
                <ChevronLeft size={16} />
              </button>
              <span className="flex items-center gap-1.5 whitespace-nowrap px-1.5 text-sm font-semibold text-foreground">
                <CalendarDays size={14} className="text-muted-foreground" /> {weekLabel(weekStartMs)}
              </span>
              <button type="button" onClick={() => setWeekStartMs((w) => addWeeks(w, 1))} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Next week">
                <ChevronRight size={16} />
              </button>
            </div>
            <Button variant={showFullDay ? "subtle" : "ghost"} onClick={() => setShowFullDay((v) => !v)} className="!px-3 !py-1.5 text-xs">
              {showFullDay ? "Full day" : "Working hours"}
            </Button>
            {selectedUnknown && (
              <button
                type="button"
                onClick={() => requestAvailability(selectedPerson)}
                disabled={requested.has(selectedPerson.uid)}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
              >
                <Send size={12} /> {requested.has(selectedPerson.uid) ? "Requested" : "Request availability"}
              </button>
            )}
          </div>

          {selectedUnknown && (
            <p className="mt-3 text-sm font-medium text-muted-foreground">{selectedPerson.name} has not declared availability yet.</p>
          )}

          <div className="mt-4">
            {gridLoading ? (
              <div className="rounded-lg border border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <InterviewCalendarGrid
                weekStartMs={weekStartMs}
                startHour={startHour}
                endHour={endHour}
                people={[selectedPerson]}
                availability={availability}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
