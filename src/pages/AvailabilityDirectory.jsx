// HR browsing interviewers' declared weekly availability (Part B) — READ
// ONLY. No selection, no auto-assignment, no slot creation: clicking a
// calendar block does nothing (see WeeklyCalendarView). This is a distinct,
// new screen from the existing /schedule booking calendar (InterviewCalendar.jsx),
// which is about creating real, dated interview bookings — this one is a
// simple directory over the weekly TEMPLATE Part A (Availability.jsx) writes.
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { listStaff, getWeeklyAvailabilityDocs } from "@/data/store";
import { ROLES, ROLE_LABELS } from "@/lib/permissions";
import { normalizeWeek } from "@/lib/weeklyAvailability";
import WeeklyCalendarView from "@/components/availability/WeeklyCalendarView";

const TABS = [
  { key: ROLES.HR, label: "HR" },
  { key: ROLES.INTERVIEWER, label: "Interviewer" },
  { key: ROLES.MANAGEMENT, label: "Management" },
];

export default function AvailabilityDirectory() {
  const [activeTab, setActiveTab] = useState(null); // null = landing state, nothing selected
  const [staff, setStaff] = useState([]);
  const [docs, setDocs] = useState({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null); // { uid, name } once a user is clicked

  useEffect(() => {
    if (!activeTab) return;
    let alive = true;
    setLoading(true);
    setSelected(null);
    listStaff([activeTab]).then(async (list) => {
      if (!alive) return;
      setStaff(list);
      const docsByUid = await getWeeklyAvailabilityDocs(list.map((u) => u.uid));
      if (alive) setDocs(docsByUid);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeTab]);

  const tabLabel = TABS.find((t) => t.key === activeTab)?.label;

  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Interviewer availability</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Browse who has declared a weekly schedule, by category.</p>

      <div className="mt-6 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-bold transition-colors ${
              activeTab === t.key ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground hover:bg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!activeTab && <p className="mt-6 text-sm text-muted-foreground">Select a category to view interviewers.</p>}

      {activeTab && loading && <p className="mt-6 text-sm text-muted-foreground">Loading…</p>}

      {activeTab && !loading && !selected && (
        <div className="mt-5 max-w-xl divide-y divide-border rounded-lg border border-border bg-card">
          {staff.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No {tabLabel} users found.</p>}
          {staff.map((u) => {
            const declared = !!docs[u.uid];
            return (
              <button
                key={u.uid}
                type="button"
                onClick={() => setSelected(u)}
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

      {activeTab && selected && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            <ArrowLeft size={15} /> Back to {tabLabel}
          </button>
          <WeeklyCalendarView name={selected.name} days={docs[selected.uid] ? normalizeWeek(docs[selected.uid]) : null} />
        </div>
      )}
    </div>
  );
}
