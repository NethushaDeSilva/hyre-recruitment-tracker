// Management dashboard — live hiring analytics built from Firestore data.
// Pure CSS + SVG (no chart library, per our guardrails). Management-only route.
import { useEffect, useMemo, useState } from "react";
import { Briefcase, Users, UserCheck, TrendingUp, Activity } from "lucide-react";
import { useHyreData } from "@/data/store";
import { STAGES } from "@/lib/stages";
import { Card } from "@/components/ui/Card";
import { computeKpis, stageCounts, weeklyApplications, byDepartment } from "@/lib/analytics";

const FUNNEL_STAGES = ["applied", "screening", "interview", "final", "hired"];
const DONUT_STAGES = ["applied", "screening", "interview", "final", "hired", "rejected"];

export default function Dashboard() {
  const { positions, candidates, loading } = useHyreData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const kpis = useMemo(() => computeKpis(positions, candidates), [positions, candidates]);
  const funnel = useMemo(() => stageCounts(candidates, FUNNEL_STAGES), [candidates]);
  const donut = useMemo(() => stageCounts(candidates, DONUT_STAGES).filter((s) => s.count > 0), [candidates]);
  const weekly = useMemo(() => weeklyApplications(candidates, 8, Date.now()), [candidates]);
  const depts = useMemo(() => byDepartment(positions, candidates), [positions, candidates]);

  if (loading) {
    return <div className="grid h-full place-items-center p-4 sm:p-7 text-sm text-muted-foreground">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-7">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm font-medium text-muted-foreground">
            Live hiring overview across {positions.length} positions
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[#BBE7C9] bg-[#E7F6EC] px-3 py-1.5 text-xs font-bold text-[#16A34A]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#16A34A] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#16A34A]" />
          </span>
          Live data
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon={Briefcase} tone="#1F3A5F" label="Open positions" value={kpis.openPositions} sub={`${positions.length} total`} />
        <StatCard icon={Users} tone="#2563EB" label="Active candidates" value={kpis.inPipeline} sub={`${kpis.totalCandidates} candidates`} />
        <StatCard icon={UserCheck} tone="#16A34A" label="Hired" value={kpis.hired} sub={`${kpis.rejected} rejected`} />
        <StatCard icon={TrendingUp} tone="#E0A422" label="Offer rate" value={`${kpis.hireRate}%`} sub="of decided candidates" />
      </div>

      {/* funnel + donut */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Hiring funnel</h2>
            <span className="text-xs font-medium text-muted-foreground">Candidates by stage</span>
          </div>
          <Funnel data={funnel} mounted={mounted} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-bold text-foreground">Stage mix</h2>
          <Donut data={donut} total={kpis.totalCandidates} mounted={mounted} />
        </Card>
      </div>

      {/* trend + departments */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground">Applications over time</h2>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Activity size={13} /> Last 8 weeks
            </span>
          </div>
          <AreaChart data={weekly} mounted={mounted} />
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-bold text-foreground">By department</h2>
          <Departments data={depts} mounted={mounted} />
        </Card>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function StatCard({ icon: Icon, tone, label, value, sub }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${tone}14`, color: tone }}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-[26px] font-extrabold leading-none text-foreground">{value}</div>
        <div className="mt-1.5 text-[13px] font-semibold text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </Card>
  );
}

function Funnel({ data, mounted }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-3.5">
      {data.map((d) => {
        const s = STAGES[d.id];
        const pct = Math.round((d.count / max) * 100);
        return (
          <div key={d.id} className="flex items-center gap-3">
            <div className="flex w-24 shrink-0 items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.dot }} />
              <span className="text-[13px] font-semibold text-foreground">{s.label}</span>
            </div>
            <div className="h-8 flex-1 overflow-hidden rounded-lg bg-[#F1F5FA]">
              <div
                className="flex h-full items-center justify-end rounded-lg px-2.5 text-xs font-bold text-white transition-[width] duration-700 ease-out"
                style={{ width: mounted ? `${Math.max(pct, d.count ? 8 : 0)}%` : "0%", background: s.dot }}
              >
                {d.count > 0 && d.count}
              </div>
            </div>
            <span className="w-8 shrink-0 text-right text-sm font-bold text-foreground">{d.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ data, total, mounted }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const sum = data.reduce((a, d) => a + d.count, 0) || 1;
  let offset = 0;
  const segments = data.map((d) => {
    const frac = d.count / sum;
    const seg = { ...d, frac, dash: frac * C, offset };
    offset += frac * C;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative h-[150px] w-[150px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#F1F5FA" strokeWidth="16" />
          {segments.map((s) => (
            <circle
              key={s.id}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={STAGES[s.id].dot}
              strokeWidth="16"
              strokeLinecap="butt"
              strokeDasharray={`${mounted ? s.dash : 0} ${C}`}
              strokeDashoffset={-s.offset}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-foreground">{total}</span>
          <span className="text-[11px] font-medium text-muted-foreground">candidates</span>
        </div>
      </div>
      <div className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: STAGES[s.id].dot }} />
              {STAGES[s.id].label}
            </span>
            <span className="text-xs font-bold text-foreground">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AreaChart({ data, mounted }) {
  const W = 640;
  const H = 180;
  const P = 8;
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const x = (i) => (n === 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const pts = data.map((d, i) => [x(i), y(d.count)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
  const area = `${line} L${x(n - 1)},${H} L${x(0)},${H} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="hyreArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1F3A5F" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1F3A5F" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="#EEF2F7" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#hyreArea)" className="transition-opacity duration-700" style={{ opacity: mounted ? 1 : 0 }} />
        <path
          d={line}
          fill="none"
          stroke="#1F3A5F"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-opacity duration-700"
          style={{ opacity: mounted ? 1 : 0 }}
        />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="#fff" stroke="#E0A422" strokeWidth="2.5"
            className="transition-opacity duration-700" style={{ opacity: mounted ? 1 : 0 }} />
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] font-medium text-muted-foreground">
        {data.map((d, i) => (
          <span key={i}>{d.weeksAgo === 0 ? "This wk" : `${d.weeksAgo}w`}</span>
        ))}
      </div>
    </div>
  );
}

function Departments({ data, mounted }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No candidate data yet.</p>;
  const max = Math.max(1, ...data.map((d) => d.count));
  const TONES = ["#1F3A5F", "#2563EB", "#4F46E5", "#E0A422", "#16A34A", "#0EA5E9"];
  return (
    <div className="space-y-3.5">
      {data.map((d, i) => (
        <div key={d.department} className="space-y-1.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold text-foreground">{d.department}</span>
            <span className="font-bold text-muted-foreground">{d.count}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#F1F5FA]">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: mounted ? `${(d.count / max) * 100}%` : "0%", background: TONES[i % TONES.length] }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
