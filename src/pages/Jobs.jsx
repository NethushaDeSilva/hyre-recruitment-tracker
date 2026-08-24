// Candidate portal — browse open roles and apply. Card colours carry the meaning:
//   • no application yet    → "Apply" button (available).
//   • an application is LIVE → YELLOW "In hiring process" — you're in the pipeline.
//   • it gets REJECTED       → RED "Not selected" (can't reapply); others unlock.
//   • the person is HIRED    → GREEN "Hired" on the role they landed (shown even if
//                              that vacancy has since closed); every OTHER role is
//                              a neutral GRAY "Applications closed" (not available).
// Only ONE application at a time, and being hired is terminal.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

  // Only genuinely-open vacancies — anything past its auto-close date is hidden.
  const openPositions = useMemo(() => positions.filter((p) => isOpenNow(p)), [positions]);

  // This person's own applications (by uid or verified email).
  const myApps = useMemo(
    () => candidates.filter((c) => (c.submittedByUid && c.submittedByUid === user?.uid) || c.email === user?.email),
    [candidates, user]
  );
  // At most one of each: a LIVE (still-in-progress) application, and a HIRED record.
  // Being hired is TERMINAL — once hired we ignore any leftover in-progress row, so a
  // hired person never shows an "in-process" card (every other role is simply closed).
  const hiredApp = useMemo(() => myApps.find((c) => c.stage === "hired") || null, [myApps]);
  const activeApp = useMemo(
    () => (hiredApp ? null : myApps.find((c) => c.stage !== "rejected" && c.stage !== "hired") || null),
    [myApps, hiredApp]
  );
  // While one application is live OR the person is hired, every OTHER role is
  // blocked — you can only ever hold one application at a time.
  const locked = !!activeApp || !!hiredApp;

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

  const gridRef = useStaggerReveal(!loading && displayPositions.length > 0);

  return (
    <div className="p-4 sm:p-7">
      <div className="space-y-1.5">
        <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Open roles</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {loading
            ? "Loading…"
            : `${openPositions.length} open ${openPositions.length === 1 ? "role" : "roles"}${locked ? "" : " · apply with the standard application"}`}
        </p>
      </div>

      {justApplied && (
        <div className="mt-5 flex items-center gap-2.5 rounded-lg border border-[#BBE7C9] bg-[#E7F6EC] px-4 py-3 text-sm font-medium text-[#16A34A] dark:border-[#16A34A]/40 dark:bg-[#16A34A]/10 dark:text-[#4ADE80]">
          <CheckCircle2 size={18} />
          Application submitted for {justApplied.title}. You can track it under{" "}
          <Link to="/applications" className="font-semibold underline">My Applications</Link>.
        </div>
      )}

      {/* Status banner — hired (green) or one live application (yellow). */}
      {!justApplied && hiredApp ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[#BBE7C9] bg-[#E7F6EC] px-4 py-3.5 text-sm text-[#166534] dark:border-[#16A34A]/40 dark:bg-[#16A34A]/10 dark:text-[#86EFAC]">
          <BadgeCheck size={18} className="mt-0.5 shrink-0 text-[#16A34A] dark:text-[#4ADE80]" />
          <span><b className="font-bold">You've been hired.</b> Applications are now closed for you — welcome aboard.</span>
        </div>
      ) : !justApplied && activeApp ? (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-[#F0D48A] bg-[#FBF3DC] px-4 py-3.5 text-sm text-[#8A6D1F] dark:border-[#E0A422]/40 dark:bg-[#E0A422]/10 dark:text-[#F5D77E]">
          <Clock size={17} className="mt-0.5 shrink-0 text-[#E0A422]" />
          <span>
            <b className="font-bold">You're in the hiring process for one role.</b> You can apply to another once a decision is made on it. Track it under{" "}
            <Link to="/applications" className="font-semibold underline">My Applications</Link>.
          </span>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-16 text-center text-sm text-muted-foreground">Loading roles…</div>
      ) : displayPositions.length === 0 ? (
        <div className="mt-16 text-center text-sm text-muted-foreground">There are no open roles right now — check back soon.</div>
      ) : (
        <div ref={gridRef} className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {displayPositions.map((pos) => {
            const hiredHere = hiredApp && hiredApp.positionId === pos.id;         // GREEN
            const appliedHere = activeApp && activeApp.positionId === pos.id;     // YELLOW
            const rejectedHere = myApps.some((c) => c.positionId === pos.id && c.stage === "rejected"); // RED
            // A blocked "other" card: something is live/terminal and this isn't it.
            const blocked = locked && !hiredHere && !appliedHere;

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
                      <Lock size={15} /> {hiredApp ? "Applications closed" : "Not available — one at a time"}
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
