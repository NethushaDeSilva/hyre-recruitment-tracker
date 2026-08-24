// Positions page — grid of position cards with live candidate counts + progress.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ChevronRight } from "lucide-react";
import { useHyreData, deletePosition } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { useStaggerReveal } from "@/hooks/useStaggerReveal";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { can } from "@/lib/permissions";
import { visiblePositions } from "@/lib/stages";
import { effectiveStatus } from "@/lib/positions";
import { formatDate } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CountUp } from "@/components/ui/CountUp";
import { StatusPill } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import OpenPositionModal from "@/components/OpenPositionModal";
import { cn } from "@/lib/utils";

const FILTERS = ["All", "Open", "Pending", "Closed"];

// How far along the pipeline this position's candidates are, on average (0–1).
function progressOf(pos, cands) {
  if (effectiveStatus(pos) === "Closed") return 1;
  if (!cands.length) return 0;
  const p = pos.stages;
  const sum = cands.reduce((acc, c) => {
    const i = p.indexOf(c.stage);
    return acc + (i < 0 ? 0 : i / (p.length - 1));
  }, 0);
  return sum / cands.length;
}

export default function Positions() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const { positions: allPositions, candidates, loading } = useHyreData();
  const [filter, setFilter] = useState("All");
  const [openModal, setOpenModal] = useState(false);
  const canManage = can(user?.role, "managePositions");
  const canDeletePos = can(user?.role, "deletePositions"); // HR only
  // HR & Interviewers see only positions they're assigned to; Management sees all.
  const positions = useMemo(() => visiblePositions(allPositions, user), [allPositions, user]);

  // Run a card action without letting the click navigate the wrapping <Link>.
  const act = (e, fn) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  const confirmDelete = async (e, pos) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      title: `Delete “${pos.title}”?`,
      message: "This removes the vacancy. Candidates already in it are not deleted.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) deletePosition(pos.id);
  };

  const shown = useMemo(
    () => (filter === "All" ? positions : positions.filter((p) => effectiveStatus(p) === filter)),
    [positions, filter]
  );
  const gridRef = useStaggerReveal(!loading && shown.length > 0);
  const visibleIds = new Set(positions.map((p) => p.id));
  const totalCandidates = candidates.filter((c) => visibleIds.has(c.positionId)).length;

  return (
    <div className="p-4 sm:p-7">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Positions</h1>
          <p className="text-sm font-medium text-muted-foreground">
            {loading ? "Loading…" : (
              <><CountUp value={positions.length} /> positions · <CountUp value={totalCandidates} /> candidates</>
            )}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setOpenModal(true)}>
            <Plus size={16} /> Open position
          </Button>
        )}
      </div>

      {/* filter tabs */}
      <div className="mt-6 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-4 py-2 text-[13px] font-semibold transition-colors",
              filter === f ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:bg-background"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* grid */}
      {loading ? (
        <div className="mt-16 text-center text-sm text-muted-foreground">Loading positions…</div>
      ) : shown.length === 0 ? (
        <div className="mt-16 text-center text-sm text-muted-foreground">
          {positions.length === 0 && user?.role !== "HR"
            ? user?.role === "Management"
              ? "No positions yet — you’ll see positions you’re assigned to or that you open."
              : "You haven’t been assigned to any positions yet. You’ll see them here once a manager assigns you to a stage."
            : "No positions match this filter."}
        </div>
      ) : (
        <div ref={gridRef} className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((pos) => {
          const cands = candidates.filter((c) => c.positionId === pos.id);
          const pct = Math.round(progressOf(pos, cands) * 100);
          const stack = cands.slice(0, 3);
          const eff = effectiveStatus(pos);
          return (
            <Link key={pos.id} to={`/positions/${pos.id}`}>
              <Card className="h-full space-y-4 p-5 transition-shadow hover:shadow-pop">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[17px] font-bold text-foreground">{pos.title}</div>
                    <div className="text-[13px] font-medium text-muted-foreground">{pos.department}</div>
                    {pos.closesAt ? (
                      <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                        {eff === "Closed" ? "Closed" : "Auto-closes"} {formatDate(pos.closesAt)}
                      </div>
                    ) : null}
                  </div>
                  <StatusPill status={eff} />
                </div>

                <div className="flex items-center gap-5">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-extrabold text-foreground">{cands.length}</span>
                    <span className="text-[13px] text-muted-foreground">candidates</span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-extrabold text-foreground">{pos.stages.length}</span>
                    <span className="text-[13px] text-muted-foreground">stages</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Progress</span>
                    <span className="text-xs font-bold text-foreground">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#EEF2F7] dark:bg-white/[0.08]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? "#16A34A" : "#E0A422" }} />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center">
                    {stack.map((c) => (
                      <div key={c.id} className="-ml-2 first:ml-0">
                        <div className="rounded-full ring-2 ring-card">
                          <Avatar name={c.name} color={c.avatarColor} size={26} />
                        </div>
                      </div>
                    ))}
                    {cands.length > 3 && (
                      <div className="-ml-2 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-muted-foreground ring-2 ring-card">
                        +{cands.length - 3}
                      </div>
                    )}
                    {cands.length === 0 && <span className="text-[13px] text-muted-foreground">No candidates yet</span>}
                  </div>
                  <span className="flex items-center gap-0.5 text-[13px] font-semibold text-primary">
                    View board <ChevronRight size={15} />
                  </span>
                </div>

                {/* Only Delete. Positions have NO manual close/reopen — they close
                    automatically on their auto-close date and can never be reopened. */}
                {canDeletePos && (
                  <div className="flex items-center justify-end border-t border-border pt-3">
                    <button
                      onClick={(e) => confirmDelete(e, pos)}
                      className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[#DC2626] transition-colors hover:bg-[#FBE9E9] dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </Card>
            </Link>
          );
        })}
        </div>
      )}

      <OpenPositionModal open={openModal} onClose={() => setOpenModal(false)} />
    </div>
  );
}
