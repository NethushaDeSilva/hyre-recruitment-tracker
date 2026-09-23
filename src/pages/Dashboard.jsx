import { confirmedAvailabilitySlots } from "@/lib/confirmedAvailability";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, CalendarClock, ClipboardCheck, Plus, CalendarPlus, Users, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useHyreData, subscribeInterviewBookings, listStaff, subscribeAvailabilityRecords, respondToInterviewRequest } from "@/data/store";
import { can, ROLES } from "@/lib/permissions";
import { BOOKED_STATUSES, timeMs } from "@/lib/interviewSchedule";
import { activeCandidates } from "@/lib/candidateCounts";
import { weekStart, addWeeks } from "@/lib/scheduleGrid";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const ACTIONS = [
  { label: "Create Position", icon: Plus, permission: "managePositions", to: "/positions?create=1" },
  { label: "Schedule Interview", icon: CalendarPlus, permission: "viewInterviewCalendar", to: "/schedule" },
  { label: "View Candidates", icon: Users, permission: "viewCandidatesTable", to: "/candidates" },
];
const GROUPS = [
  ["Applied", ["applied"]], ["Shortlisted", ["screening", "shortlisted"]],
  ["Interviewing", ["dept", "interview", "interview2", "final"]],
  ["Offered", ["offered", "offer"]], ["Hired", ["hired"]],
];
const date = (value) => timeMs(value) > 0 ? new Date(timeMs(value)).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" }) : "Date unavailable";
const clock = (value) => new Date(timeMs(value)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function dashboardMetrics(positions, candidates, bookings, employees, now = Date.now()) {
  const positionIds = new Set(positions.filter(p => !p.deleting && p.recordState !== "Deleted").map(p => p.id));
  const stageCandidates = candidates.filter(c => c.stage === "hired" || (c.positionId && positionIds.has(c.positionId)));
  const active = activeCandidates(stageCandidates);
  const start = weekStart(now), end = addWeeks(start, 1);
  const scheduled = bookings.filter((b) => BOOKED_STATUSES.includes(b.status) && timeMs(b.scheduledAt) >= start && timeMs(b.scheduledAt) < end).sort((a, b) => timeMs(a.scheduledAt) - timeMs(b.scheduledAt));
  const hires = [...employees].sort((a, b) => timeMs(b.hiredAt) - timeMs(a.hiredAt));
  const durations = hires.filter((h) => timeMs(h.appliedAt) > 0 && timeMs(h.hiredAt) >= timeMs(h.appliedAt)).map((h) => (timeMs(h.hiredAt) - timeMs(h.appliedAt)) / 86400000);
  return { active, stageCandidates, open: positions.filter((p) => p.status === "Open"), scheduled, pending: bookings.filter((b) => b.status === "pending_confirmation"), hires, average: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null };
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { positions, candidates, employees = [], loading } = useHyreData();
  const [bookings, setBookings] = useState([]);
  const [staff, setStaff] = useState([]);
  const [availabilityRecords, setAvailabilityRecords] = useState({});
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [staffLoading, setStaffLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    setBookings([]); setError("");
    return subscribeInterviewBookings(setBookings, () => setError("Interview data could not be loaded. Please refresh."), user?.role === ROLES.INTERVIEWER ? user.uid : undefined);
  }, [user?.uid, user?.role]);
  useEffect(() => {
    let alive = true;
    setStaffLoading(true); setAvailabilityError("");
    (async () => {
      const people = user?.role === ROLES.INTERVIEWER ? [user] : await listStaff([ROLES.HR, ROLES.INTERVIEWER, ROLES.MANAGEMENT]);
      if (alive) setStaff(people);
    })().catch(() => { if (alive) setAvailabilityError("Availability could not be loaded."); }).finally(() => { if (alive) setStaffLoading(false); });
    return () => { alive = false; };
  }, [user?.uid, user?.role]);
  useEffect(() => {
    setAvailabilityRecords({});
    return subscribeAvailabilityRecords(staff.map(p => p.uid), records => {
      setAvailabilityRecords(records);
      setAvailabilityError("");
    }, () => setAvailabilityError("Availability could not be loaded."));
  }, [staff]);
  const availableStaff = staff.filter(p => confirmedAvailabilitySlots(availabilityRecords[p.uid], now).length > 0);
  const metrics = useMemo(() => dashboardMetrics(positions, candidates, bookings, employees, now), [positions, candidates, bookings, employees, now]);

  const grouped = GROUPS.map(([label, ids]) => ({ label, count: metrics.stageCandidates.filter((c) => ids.includes(c.stage)).length }));
  const other = metrics.active.filter((c) => !GROUPS.some(([, ids]) => ids.includes(c.stage))).length;
  const respond = async (booking, accept) => {
    setBusy(booking.id); setMessage("");
    try {
      const result = await respondToInterviewRequest(booking.id, { accept, actor: user });
      if (!result?.ok) throw new Error("The request could not be saved.");
      setMessage(accept ? "Interview approved." : "Interview declined; reassignment has been requested.");
    } catch (e) { setMessage(e.message || "Could not save your response."); }
    finally { setBusy(""); }
  };
  if (loading) return <div className="p-7 text-sm text-muted-foreground">Loading dashboard…</div>;
  return <div className="space-y-6 p-4 sm:p-7">
    <header><h1 className="text-[27px] font-extrabold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Recruitment and interview management in one place.{user?.role === ROLES.INTERVIEWER && " Interview data is limited to your assignments."}</p></header>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={Briefcase} label="Open Positions" value={metrics.open.length} />
      <StatCard icon={Users} label="Candidates in Pipeline" value={metrics.active.length} />
      <StatCard icon={CalendarClock} label="Interviews This Week" value={error ? "—" : metrics.scheduled.length} />
      <StatCard icon={ClipboardCheck} label="Pending Approvals" value={error ? "—" : metrics.pending.length} />
    </div>
    <section aria-label="Quick actions" className="flex flex-wrap gap-3">{ACTIONS.map((a) => <Button key={a.label} disabled={!can(user?.role, a.permission)} onClick={() => navigate(a.to)} title={can(user?.role, a.permission) ? undefined : "Your role does not have access"}>{can(user?.role, a.permission) ? <a.icon size={16} /> : <Lock size={16} />}{a.label}</Button>)}</section>
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <section className="min-w-0 space-y-4" aria-labelledby="hr-section"><h2 id="hr-section" className="text-xl font-bold">HR</h2>
        <Panel title="Candidates by position"><PositionChart positions={positions} candidates={candidates} /></Panel>
        <Panel title="Candidates by stage"><div className="space-y-4">{grouped.map((g) => <div key={g.label}><div className="mb-1 flex justify-between text-sm"><span>{g.label}</span><strong>{g.count}</strong></div><div role="progressbar" aria-label={g.label} aria-valuenow={g.count} aria-valuemin={0} aria-valuemax={Math.max(1, metrics.stageCandidates.filter((c) => c.stage !== "rejected" && c.stage !== "withdrawn").length)} className="h-3 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-primary" style={{ width: `${g.count / Math.max(1, metrics.stageCandidates.filter((c) => c.stage !== "rejected" && c.stage !== "withdrawn").length) * 100}%` }} /></div></div>)}</div><p className="mt-4 text-xs text-muted-foreground">Shortlisted includes HR Screening. Interviewing includes Department Review and all interview stages. Offered counts offer-stage records only.{other > 0 && ` ${other} candidates are in other active stages.`}</p></Panel>
        <Panel title="Recent hires"><p className="mb-4 text-sm">Average time-to-hire: <strong>{metrics.average === null ? "Not enough data" : `${metrics.average} days`}</strong><span className="block text-xs text-muted-foreground">Application to hire, using hires with both dates recorded.</span></p>{metrics.hires.length ? <ul className="divide-y divide-border">{metrics.hires.slice(0, 5).map((h) => <li key={h.id} className="py-3"><div className="font-semibold">{h.name}</div><div className="text-sm text-muted-foreground">{h.employeeRole || h.appliedRole || "Role unavailable"} · {date(h.hiredAt)}</div></li>)}</ul> : <Empty>No hires yet.</Empty>}</Panel>
      </section>
      <section className="min-w-0 space-y-4" aria-labelledby="interview-section"><h2 id="interview-section" className="text-xl font-bold">Interview Management</h2>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Panel title="Scheduled interviews"><p className="mb-3 text-xs text-muted-foreground">This week · {date(weekStart(now))} – {date(addWeeks(weekStart(now), 1) - 1)} · Local time</p>{!error && !metrics.scheduled.length && <Empty>No interviews scheduled this week.</Empty>}<ol className="max-h-96 space-y-4 overflow-y-auto">{metrics.scheduled.map((b) => <li key={b.id} className="border-l-2 border-primary pl-4"><Booking booking={b} /><span className="text-xs text-muted-foreground">{b.status === "confirmed" ? "Confirmed" : "Awaiting confirmation"}</span></li>)}</ol></Panel>
        <Panel title="Interviewer availability">{staffLoading ? <Empty>Loading availability…</Empty> : availabilityError ? <p role="alert">{availabilityError}</p> : !availableStaff.length ? <Empty>No upcoming availability has been submitted.</Empty> : <ul className="max-h-64 divide-y divide-border overflow-y-auto">{availableStaff.map((p) => <li key={p.uid} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span><strong>{p.name}</strong><span className="block text-xs text-muted-foreground">{p.role}</span></span><span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800 dark:bg-green-900/40 dark:text-green-300">Availability updated</span></li>)}</ul>}<Button variant="ghost" className="mt-3" onClick={() => navigate(can(user?.role, "viewInterviewCalendar") ? "/schedule" : "/availability")}>View availability slots</Button></Panel>
        <Panel title="Pending approvals"><p className="mb-3 text-xs text-muted-foreground">Interview requests awaiting the assigned person's response.</p>{message && <p role="status" className="mb-3 text-sm">{message}</p>}{!error && !metrics.pending.length && <Empty>No pending approvals.</Empty>}<div className="grid gap-3 xl:grid-cols-2">{metrics.pending.map((b) => <div key={b.id} className="rounded-lg border border-border p-3"><Booking booking={b} /><div className="mt-3 flex gap-2"><Button disabled={!!busy || b.interviewerId !== user?.uid} onClick={() => respond(b, true)}>Approve</Button><Button variant="ghost" disabled={!!busy || b.interviewerId !== user?.uid} onClick={() => respond(b, false)}>Reject</Button></div>{b.interviewerId !== user?.uid && <p className="mt-2 text-xs text-muted-foreground">Only the assigned person can respond.</p>}</div>)}</div>{bookings.some((b) => b.status === "needs_attention") && <p className="mt-4 text-sm text-muted-foreground">{bookings.filter((b) => b.status === "needs_attention").length} interviews need reassignment. Open the relevant position to assign an interviewer.</p>}</Panel>
      </section>
    </div>
  </div>;
}
function Panel({ title, children }) { return <Card className="p-5"><h3 className="mb-4 text-base font-bold">{title}</h3>{children}</Card>; }
function Empty({ children }) { return <p className="py-3 text-sm text-muted-foreground">{children}</p>; }
function Booking({ booking: b }) { return <div className="space-y-1 text-sm"><p className="font-semibold">{b.positionTitle || b.positionId} · {b.stageLabel || b.stageId}</p><p>{date(b.scheduledAt)}{timeMs(b.scheduledAt) > 0 && ` · ${clock(b.scheduledAt)}–${clock(timeMs(b.scheduledAt) + (b.durationMs || 3600000))}`}</p><p className="text-muted-foreground">Interviewer: {b.interviewerName || "Not assigned"}</p><p className="text-muted-foreground">Candidate: {b.candidateName || (b.kind === "stage_assignment" ? "Stage assignment — no candidate yet" : "Not recorded")}</p></div>; }
function StatCard({ icon: Icon, label, value }) { return <Card className="flex items-center gap-4 p-5"><div className="rounded-xl bg-muted p-3 text-primary"><Icon size={22} /></div><div><div className="text-[26px] font-extrabold leading-none text-foreground">{value}</div><div className="mt-1.5 text-[13px] font-semibold">{label}</div></div></Card>; }


export function PositionChart({ positions, candidates }) {
  const counts = new Map();
  for (const candidate of activeCandidates(candidates)) {
    counts.set(candidate.positionId, (counts.get(candidate.positionId) || 0) + 1);
  }
  const bars = positions.map((p) => ({ ...p, count: counts.get(p.id) || 0 }));
  // Five equal integer intervals; small counts never occupy the entire chart.
  const step = Math.max(1, Math.ceil(Math.max(0, ...bars.map((p) => p.count)) / 5));
  const maximum = step * 5;
  return <>
    <p className="mb-4 text-sm text-muted-foreground">Active candidates across all open and closed positions. Hired, rejected and withdrawn applications are excluded. Updates live as applications change.</p>
    {!bars.length ? <Empty>No positions yet.</Empty> : <>
      <p className="mb-2 text-xs font-medium text-muted-foreground">Number of active candidates</p>
      <div className="flex min-w-0">
        <div aria-hidden="true" className="relative mt-6 h-40 w-8 shrink-0 border-r border-border text-xs text-muted-foreground">
          {Array.from({ length: 6 }, (_, i) => <span key={i} className="absolute right-2 translate-y-1/2" style={{ bottom: `${i * 20}%` }}>{i * step}</span>)}
        </div>
        <div tabIndex={0} role="region" aria-label="Candidates by position chart. Scroll horizontally to see more positions." className="min-w-0 flex-1 overflow-x-auto pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          <div className="flex w-max min-w-full items-start">
            {bars.map((p) => <div key={p.id} className="w-28 shrink-0 text-center" aria-label={`${p.title || p.id}, ${p.status}: ${p.count} active candidates`}>
              <div className="relative mt-6 h-40 border-b border-border">
                {Array.from({ length: 5 }, (_, i) => <div key={i} aria-hidden="true" className="absolute w-full border-t border-border" style={{ bottom: `${(i + 1) * 20}%` }} />)}
                <div className="absolute bottom-0 left-1/2 w-12 -translate-x-1/2 rounded-t bg-primary" style={{ height: `${p.count / maximum * 100}%` }}>
                  <span className="absolute -top-6 left-0 w-full text-sm font-bold">{p.count}</span>
                </div>
              </div>
              <div className="px-2 pt-3 text-xs font-semibold break-words">{p.title || p.id}</div>
              <div className="mt-1 text-xs text-muted-foreground">{p.status}</div>
            </div>)}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Scroll horizontally to see more positions. Each bar shows the current active candidate count, not vacancies.</p>
    </>}
  </>;
}
