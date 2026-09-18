// Candidate-facing job detail page — one per position, built entirely from
// what HR already entered in OpenPositionModal. Reached by clicking any card
// on /jobs (Jobs.jsx), or directly by URL. The apply form at the bottom
// reuses ApplyModal exactly as it already exists — its CV scan/validation/
// submission logic is not touched, only launched, same as Jobs.jsx already did.
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Briefcase, Calendar, Clock, Ban, Lock, BadgeCheck, GraduationCap, Wallet } from "lucide-react";
import { useHyreData } from "@/data/store";
import { isOpenNow } from "@/lib/positions";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import ApplyModal from "@/components/ApplyModal";

// Matches the Sidebar's own label for this destination (Sidebar.jsx — "Open
// Roles"), so the back control names the page the way the rest of the app's
// navigation already does, not a label invented for this page alone.
const LIST_LABEL = "Open Roles";

export default function JobDetail() {
  const { positionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { positions, candidates, loading } = useHyreData();
  const [applyOpen, setApplyOpen] = useState(false);

  const position = useMemo(() => positions.find((p) => p.id === positionId), [positions, positionId]);

  // Same status derivation Jobs.jsx uses for its card pills (hiredHere /
  // appliedHere / rejectedHere / blocked), scoped to just this one position —
  // so a candidate who already has a relationship with this role sees the
  // same true status here, not a blank apply form.
  const myApps = useMemo(
    () => candidates.filter((c) => (c.submittedByUid && c.submittedByUid === user?.uid) || c.email === user?.email),
    [candidates, user]
  );
  const hiredApp = useMemo(() => myApps.find((c) => c.stage === "hired") || null, [myApps]);
  const hiredHere = !!(hiredApp && position && hiredApp.positionId === position.id);
  const appliedHere = useMemo(() => {
    if (hiredApp || !position) return null;
    return myApps.find((c) => c.positionId === position.id && c.stage !== "rejected" && c.stage !== "hired") || null;
  }, [myApps, hiredApp, position]);
  const rejectedHere = !!(position && myApps.some((c) => c.positionId === position.id && c.stage === "rejected"));
  // Hired at a DIFFERENT role — being hired is terminal, closes every other one.
  const blocked = !!hiredApp && !hiredHere;

  const backToList = () => navigate("/jobs");

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground sm:p-7">Loading…</div>;
  }

  // Not found covers three cases identically: a genuinely nonexistent id, a
  // draft position (Firestore rules never let a candidate read one at all —
  // "draft never leaks" is enforced there, not here), and a position HR has
  // manually closed (rules only allow a candidate to read status "Open",
  // rejecting the read outright — see firestore.rules "positions" — so a
  // manually-closed role 404s here rather than showing "this role has
  // closed" with full detail; only a role still raw-status "Open" but past
  // its own closesAt date gets that richer treatment, below).
  if (!position) {
    return (
      <div className="p-4 sm:p-7">
        <BackControl onClick={backToList} />
        <div className="mt-16 text-center text-sm text-muted-foreground">
          This role isn't available — it may have closed or been removed.
        </div>
      </div>
    );
  }

  const req = position.requirements || {};
  const skills = req.requiredSkills || [];
  const niceToHave = req.niceToHave || [];
  const minYears = Number(req.minYearsExperience) || 0;
  const fieldOfStudy = req.requiredQualification?.field || "";
  const open = isOpenNow(position);
  const hasFacts = minYears > 0 || !!position.minQualification || !!fieldOfStudy || !!position.salaryRange;

  return (
    <div className="p-4 sm:p-7">
      <BackControl onClick={backToList} />

      <div className="mx-auto mt-5 max-w-2xl">
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-foreground sm:text-[30px]">
            {position.title}
          </h1>
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <Briefcase size={14} /> {position.department}
          </div>
        </div>

        {position.description && (
          <div className="mt-8 space-y-2">
            <SectionLabel>About the role</SectionLabel>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{position.description}</p>
          </div>
        )}

        {skills.length > 0 && (
          <div className="mt-8 space-y-2.5">
            <SectionLabel>Core skills required</SectionLabel>
            <ChipList items={skills} tone="primary" />
          </div>
        )}

        {niceToHave.length > 0 && (
          <div className="mt-8 space-y-2.5">
            <SectionLabel>Nice to have</SectionLabel>
            <ChipList items={niceToHave} tone="secondary" />
          </div>
        )}

        {hasFacts && (
          <div className="mt-8 grid grid-cols-1 gap-5 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
            {minYears > 0 && (
              <Fact icon={Clock} label="Minimum experience" value={`${minYears} year${minYears === 1 ? "" : "s"}`} />
            )}
            {position.minQualification && <Fact icon={GraduationCap} label="Minimum qualification" value={position.minQualification} />}
            {fieldOfStudy && <Fact icon={GraduationCap} label="Field of study" value={fieldOfStudy} />}
            {position.salaryRange && <Fact icon={Wallet} label="Salary range" value={position.salaryRange} />}
          </div>
        )}

        <div className="mt-8 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Calendar size={14} /> Closes {formatDate(position.closesAt)}
        </div>

        {/* apply — status-gated, reuses ApplyModal unchanged */}
        <div className="mt-10 border-t border-border pt-8">
          {hiredHere ? (
            <StatusBox icon={BadgeCheck} tone="green">You were hired into this role. Congratulations!</StatusBox>
          ) : appliedHere ? (
            <StatusBox icon={Clock} tone="amber">
              You've already applied for this role — it's in the hiring process. Track it under{" "}
              <Link to="/applications" className="font-semibold underline">My Applications</Link>.
            </StatusBox>
          ) : rejectedHere ? (
            <StatusBox icon={Ban} tone="red">
              You applied for this role and weren't selected, so you can't reapply. See{" "}
              <Link to="/applications" className="font-semibold underline">My Applications</Link> for the record.
            </StatusBox>
          ) : blocked ? (
            <StatusBox icon={Lock} tone="gray">
              You've been hired into another role — applications are now closed for you.
            </StatusBox>
          ) : !open ? (
            <StatusBox icon={Lock} tone="gray">This role has closed and is no longer accepting applications.</StatusBox>
          ) : (
            <div className="rounded-lg border border-primary/25 bg-primary/[0.04] p-5 text-center">
              <p className="text-sm text-muted-foreground">Ready to apply? You'll need your CV.</p>
              <Button className="mt-3" onClick={() => setApplyOpen(true)}>Apply for this role</Button>
            </div>
          )}
        </div>
      </div>

      <ApplyModal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        position={position}
        onApplied={() => { setApplyOpen(false); navigate("/applications"); }}
      />
    </div>
  );
}

function BackControl({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft size={16} /> {LIST_LABEL}
    </button>
  );
}

function SectionLabel({ children }) {
  return <div className="text-xs font-bold uppercase tracking-wide text-[#94A3B8]">{children}</div>;
}

function ChipList({ items, tone }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => (
        <span
          key={s}
          className={
            tone === "primary"
              ? "rounded-full bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary"
              : "rounded-full bg-secondary px-3 py-1.5 text-sm font-medium text-foreground"
          }
        >
          {s}
        </span>
      ))}
    </div>
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{label}</div>
        <div className="text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}

const TONE = {
  green: "border-[#16A34A]/30 bg-[#E7F6EC] text-[#166534] dark:border-[#16A34A]/40 dark:bg-[#16A34A]/10 dark:text-[#86EFAC]",
  amber: "border-[#F0D48A] bg-[#FBF3DC] text-[#8A6D1F] dark:border-[#E0A422]/40 dark:bg-[#E0A422]/10 dark:text-[#F5D77E]",
  red: "border-[#DC2626]/30 bg-[#FBE9E9] text-[#B91C1C] dark:border-[#DC2626]/30 dark:bg-[#DC2626]/10 dark:text-[#F87171]",
  gray: "border-border bg-secondary text-muted-foreground",
};

function StatusBox({ icon: Icon, tone, children }) {
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3.5 text-sm ${TONE[tone]}`}>
      <Icon size={17} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
