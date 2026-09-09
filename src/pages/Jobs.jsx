// Candidate portal — browse open roles and apply. Card colours carry the meaning:
//   • no application yet    → "Apply" button (available).
//   • an application is LIVE → YELLOW "In hiring process" — you're in the pipeline
//                              FOR THAT ROLE. You can hold a live application to
//                              any number of other roles at the same time (WS1).
//   • it gets REJECTED       → RED "Not selected" (can't reapply to that posting).
//   • the person is HIRED    → GREEN "Hired" on the role they landed (shown even if
//                              that vacancy has since closed); every OTHER role is
//                              a neutral GRAY "Applications closed" — being hired
//                              is terminal, globally, regardless of role.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Briefcase, MapPin, CheckCircle2, ArrowRight, Ban, Lock, BadgeCheck, Clock } from "lucide-react";
import { useHyreData } from "@/data/store";
import { isOpenNow } from "@/lib/positions";
import { useAuth } from "@/context/AuthContext";
import { useStaggerReveal } from "@/hooks/useStaggerReveal";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import ApplyModal from "@/components/ApplyModal";
import { cn } from "@/lib/utils";

export default function Jobs() {
  const { user } = useAuth();
  const { positions, candidates, loading } = useHyreData();
  const [applyTo, setApplyTo] = useState(null);
  const [justApplied, setJustApplied] = useState(null);
  const [searchParams] = useSearchParams();

  // Only genuinely-open vacancies — anything past its auto-close date is hidden.
  const openPositions = useMemo(() => positions.filter((p) => isOpenNow(p)), [positions]);

  // This person's own applications (by uid or verified email).
  const myApps = useMemo(
    () => candidates.filter((c) => (c.submittedByUid && c.submittedByUid === user?.uid) || c.email === user?.email),
    [candidates, user]
  );
  // A HIRED record, if any. Being hired is TERMINAL — once hired every other
  // role is simply closed, regardless of any application still sitting active
  // elsewhere (WS1: hiring one role doesn't retroactively withdraw the others).
  const hiredApp = useMemo(() => myApps.find((c) => c.stage === "hired") || null, [myApps]);
  // Every LIVE (still-in-progress) application, one per vacancy — WS1: "one
  // person may apply to any number of jobs." Keyed by positionId for O(1)
  // per-card lookup below.
  const activeApps = useMemo(
    () => (hiredApp ? [] : myApps.filter((c) => c.stage !== "rejected" && c.stage !== "hired")),
    [myApps, hiredApp]
  );
  const activeByPosition = useMemo(() => new Map(activeApps.map((c) => [c.positionId, c])), [activeApps]);

  // The role a person was HIRED into should always appear here (in green), even
  // after its vacancy closed — so they can see where they landed. Prepend it if it
  // isn't already in the open list; fall back to the hire record if the position
  // itself is gone.
  const displayPositions = useMemo(() => {
    if (!hiredApp) return openPositions;
    if (openPositions.some((p) => p.id === hiredApp.positionId)) return openPositions;
    const hp =
      positions.find((p) => p.id === hiredApp.positionId) || {
        id: hiredApp.positionId || `hired-${hiredApp.id}`,
        title: hiredApp.employeeRole || hiredApp.appliedRole || "Your role",
        department: hiredApp.employeeDept || "",
        description: "",
      };
    return [hp, ...openPositions];
  }, [openPositions, positions, hiredApp]);

  // A shared "application link" (WS1 step 3) — /jobs?position=<id> — jumps
  // straight into applying for that one role, unless the person is hired
  // (globally terminal) or already has a row (active or rejected) for it.
  useEffect(() => {
    if (loading || hiredApp) return;
    const id = searchParams.get("position");
    if (!id) return;
    const pos = displayPositions.find((p) => p.id === id);
    if (!pos) return;
    const already = myApps.some((c) => c.positionId === id);
    if (!already) setApplyTo(pos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, hiredApp, myApps, displayPositions.length]);

  const gridRef = useStaggerReveal(!loading && displayPositions.length > 0);

  return (
    <div className="p-4 sm:p-7">
      <div className="space-y-1.5">
        <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Open roles</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {loading
            ? "Loading…"
            : `${openPositions.length} open ${openPositions.length === 1 ? "role" : "roles"}${hiredApp ? "" : " · apply with the standard application"}`}
        </p>
      </div>

      {justApplied && (
        <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-[#BBE7C9] bg-[#E7F6EC] px-4 py-3 text-sm font-medium text-[#16A34A] dark:border-[#16A34A]/40 dark:bg-[#16A34A]/10 dark:text-[#4ADE80]">
          <CheckCircle2 size={18} />
          Application submitted for {justApplied.title}. You can track it under{" "}
          <Link to="/applications" className="font-semibold underline">My Applications</Link>.
        </div>
      )}

      {/* Status banner — hired (green) or N live applications (yellow). */}
      {!justApplied && hiredApp ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[#BBE7C9] bg-[#E7F6EC] px-4 py-3.5 text-sm text-[#166534] dark:border-[#16A34A]/40 dark:bg-[#16A34A]/10 dark:text-[#86EFAC]">
          <BadgeCheck size={18} className="mt-0.5 shrink-0 text-[#16A34A] dark:text-[#4ADE80]" />
          <span><b className="font-bold">You've been hired.</b> Applications are now closed for you — welcome aboard.</span>
        </div>
      ) : !justApplied && activeApps.length > 0 ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[#F0D48A] bg-[#FBF3DC] px-4 py-3.5 text-sm text-[#8A6D1F] dark:border-[#E0A422]/40 dark:bg-[#E0A422]/10 dark:text-[#F5D77E]">
          <Clock size={17} className="mt-0.5 shrink-0 text-[#E0A422]" />
          <span>
            <b className="font-bold">
              You're in the hiring process for {activeApps.length === 1 ? "one role" : `${activeApps.length} roles`}.
            </b>{" "}
            You can apply to as many other roles as you like. Track them under{" "}
            <Link to="/applications" className="font-semibold underline">My Applications</Link>.
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-16 text-center text-sm text-muted-foreground">Loading roles…</div>
      ) : displayPositions.length === 0 ? (
        <div className="mt-16 text-center text-sm text-muted-foreground">There are no open roles right now — check back soon.</div>
      ) : (
        <div ref={gridRef} className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
          {displayPositions.map((pos) => {
            const hiredHere = hiredApp && hiredApp.positionId === pos.id;         // GREEN
            const appliedHere = activeByPosition.get(pos.id) || null;             // YELLOW
            const rejectedHere = myApps.some((c) => c.positionId === pos.id && c.stage === "rejected"); // RED
            // Blocked only when hired elsewhere — being hired is the one thing
            // that closes every OTHER role; an active application to a
            // different vacancy never blocks this one (WS1: apply to many).
            const blocked = !!hiredApp && !hiredHere;

            const tint = hiredHere
              ? "border-[#16A34A]/45 bg-[#16A34A]/[0.07] dark:bg-[#16A34A]/[0.10]"
              : appliedHere
              ? "border-[#E0A422]/55 bg-[#E0A422]/[0.08] dark:bg-[#E0A422]/[0.10]"
              : rejectedHere
              ? "border-[#DC2626]/40 bg-[#DC2626]/[0.05] dark:bg-[#DC2626]/[0.10]"
              : blocked
              ? "border-border opacity-55"
              : "";

            return (
              <Card key={pos.id} className={cn("flex h-full flex-col gap-4 p-5 transition-all", tint)}>
                <div className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-xl",
                  hiredHere ? "bg-[#16A34A]/12 text-[#16A34A] dark:text-[#4ADE80]"
                    : appliedHere ? "bg-[#E0A422]/15 text-[#B4801A] dark:text-[#F5D77E]"
                    : "bg-secondary text-primary"
                )}>
                  <Briefcase size={20} />
                </div>
                <div className="space-y-1">
                  <div className="text-[17px] font-bold text-foreground">{pos.title}</div>
                  <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                    <MapPin size={13} /> {pos.department}
                  </div>
                </div>
                {pos.description && (
                  <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{pos.description}</p>
                )}
                <div className="mt-auto pt-1">
                  {hiredHere ? (
                    <div className="flex items-center justify-center gap-1.5 rounded-md bg-[#16A34A]/12 py-2.5 text-sm font-semibold text-[#16A34A] dark:text-[#4ADE80]">
                      <BadgeCheck size={16} /> Hired here
                    </div>
                  ) : appliedHere ? (
                    <div className="flex items-center justify-center gap-1.5 rounded-md bg-[#E0A422]/15 py-2.5 text-sm font-semibold text-[#B4801A] dark:text-[#F5D77E]">
                      <Clock size={16} /> In hiring process
                    </div>
                  ) : rejectedHere ? (
                    <div className="flex items-center justify-center gap-1.5 rounded-md bg-[#DC2626]/10 py-2.5 text-sm font-semibold text-[#DC2626] dark:text-[#F87171]">
                      <Ban size={16} /> Not selected — can't reapply
                    </div>
                  ) : blocked ? (
                    <div className="flex items-center justify-center gap-1.5 rounded-md bg-[#EDEFF2] py-2.5 text-sm font-semibold text-[#8A94A6] dark:bg-white/[0.05] dark:text-[#7C8592]">
                      <Lock size={15} /> Applications closed
                    </div>
                  ) : (
                    <Button className="w-full" onClick={() => setApplyTo(pos)}>
                      Apply now <ArrowRight size={16} />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ApplyModal
        open={!!applyTo}
        onClose={() => setApplyTo(null)}
        position={applyTo}
        onApplied={(pos) => {
          setJustApplied(pos);
          setApplyTo(null);
        }}
      />
    </div>
  );
}
