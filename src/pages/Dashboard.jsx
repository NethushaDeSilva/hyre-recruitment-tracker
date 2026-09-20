// Role-tabbed staff landing dashboard — re-enabled and rebuilt (previously
// Management-only analytics charts, unrouted since 2026-07-28 as Sprint 2
// scope; see accessDashboard in src/lib/permissions.js). Any staff member
// (HR, Interviewer, Management) can open it; the three tabs frame the same
// org-wide numbers with role-relevant copy, and the quick actions always
// reflect what the SIGNED-IN user can actually do (never a fake affordance
// just because a tab is being previewed).
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, CalendarClock, ClipboardCheck, Plus, CalendarPlus, Users, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useHyreData, subscribeInterviewBookings } from "@/data/store";
import { can, ROLES } from "@/lib/permissions";
import { BOOKED_STATUSES } from "@/lib/interviewSchedule";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const TABS = [
  { role: ROLES.HR, label: "HR", blurb: "Open positions, configure interview stages, and keep the pipeline moving." },
  { role: ROLES.INTERVIEWER, label: "Interviewer", blurb: "See what's scheduled and keep your own availability current." },
  { role: ROLES.MANAGEMENT, label: "Management", blurb: "Oversee final-stage interviews and the hiring decisions that close a role." },
];

const QUICK_ACTIONS = [
  { key: "create", label: "Create Position", icon: Plus, permission: "managePositions", to: "/positions?create=1", requiresLabel: "HR" },
  { key: "schedule", label: "Schedule Interview", icon: CalendarPlus, permission: "viewInterviewCalendar", to: "/schedule", requiresLabel: "HR or Management" },
  { key: "candidates", label: "View Candidates", icon: Users, permission: "viewCandidatesTable", to: "/candidates", requiresLabel: "HR or Management" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { positions, candidates, loading } = useHyreData();
  const [bookings, setBookings] = useState([]);

  useEffect(() => subscribeInterviewBookings(setBookings, () => {}), []);

  // Default to the signed-in user's own role tab (falls back to the first
  // tab for anyone whose role isn't one of the three, e.g. a stray demo).
  const [activeRole, setActiveRole] = useState(() => TABS.some((t) => t.role === user?.role) ? user.role : TABS[0].role);
  const activeTab = TABS.find((t) => t.role === activeRole) || TABS[0];

  const metrics = useMemo(() => {
    const openPositions = positions.filter((p) => p.status === "Open").length;
    const scheduledInterviews = bookings.filter((b) => BOOKED_STATUSES.includes(b.status)).length;
    const pendingApprovals = bookings.filter((b) => b.status === "needs_attention").length;
    return { openPositions, scheduledInterviews, pendingApprovals };
  }, [positions, bookings]);

  if (loading) {
    return <div className="grid h-full place-items-center p-4 text-sm text-muted-foreground sm:p-7">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-7">
      <div className="space-y-1.5">
        <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {candidates.length} candidate{candidates.length === 1 ? "" : "s"} across {positions.length} position{positions.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* role tabs */}
      <div role="tablist" aria-label="Dashboard role" className="flex flex-wrap gap-1.5 border-b border-border">
        {TABS.map((t) => {
          const active = t.role === activeRole;
          return (
            <button
              key={t.role}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveRole(t.role)}
              className={`rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{activeTab.blurb}</p>

      {/* key metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Briefcase} tone="#1F3A5F" label="Open positions" value={metrics.openPositions} />
        <StatCard icon={CalendarClock} tone="#2563EB" label="Scheduled interviews" value={metrics.scheduledInterviews} />
        <StatCard icon={ClipboardCheck} tone="#E0A422" label="Pending approvals" value={metrics.pendingApprovals} />
      </div>

      {/* quick actions — always reflect what the SIGNED-IN user can do */}
      <div>
        <h2 className="mb-3 text-base font-bold text-foreground">Quick actions</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {QUICK_ACTIONS.map((a) => {
            const allowed = can(user?.role, a.permission);
            return (
              <Card key={a.key} className="p-4">
                <Button
                  variant={allowed ? "primary" : "ghost"}
                  disabled={!allowed}
                  onClick={() => navigate(a.to)}
                  className="w-full justify-center"
                  title={allowed ? undefined : `Requires ${a.requiresLabel} access`}
                >
                  {allowed ? <a.icon size={16} /> : <Lock size={14} />}
                  {a.label}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, tone, label, value }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tone}14`, color: tone }}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-[26px] font-extrabold leading-none text-foreground">{value}</div>
        <div className="mt-1.5 text-[13px] font-semibold text-foreground">{label}</div>
      </div>
    </Card>
  );
}
