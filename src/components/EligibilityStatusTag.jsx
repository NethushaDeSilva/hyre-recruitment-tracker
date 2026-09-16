// A compact, at-a-glance read of the REAL WS5 mandatory-eligibility verdict —
// score.eligibility.status via assessmentEligibility(), the same source
// AssessmentStatus reads. Never a qualification-level guess (that was
// EligibilityTag's mistake: "Bachelor's Degree" >= "Bachelor's Degree" said
// Meets for a 0/100 candidate missing four mandatory skills). This is the
// same verdict as AssessmentStatus, just pill-sized for a table row.
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { assessmentEligibility } from "@/lib/scoreStaleness";
import { Tooltip } from "@/components/ui/Tooltip";

const LABELS = { meets: "Meets mandatory requirements", does_not_meet: "Mandatory requirement not met", needs_review: "Eligibility needs review" };
const STYLES = {
  meets: { icon: CheckCircle2, short: "Meets", cls: "bg-[#E7F6EC] text-[#16A34A] dark:bg-[#16A34A]/15" },
  does_not_meet: { icon: XCircle, short: "Does not meet", cls: "bg-[#FBE9E9] text-[#DC2626] dark:bg-[#DC2626]/15" },
  needs_review: { icon: AlertTriangle, short: "Needs review", cls: "bg-[#FEF3C7] text-[#B45309] dark:bg-[#F59E0B]/15 dark:text-[#FBBF24]" },
};

export default function EligibilityStatusTag({ score, position, candidate, className = "" }) {
  const eligibility = assessmentEligibility(score, position, candidate);
  const { icon: Icon, short, cls } = STYLES[eligibility.status];
  const reason = eligibility.reasons?.[0]?.message || "";

  return (
    <Tooltip label={reason ? `${LABELS[eligibility.status]} — ${reason}` : LABELS[eligibility.status]} className="shrink-0">
      <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold ${cls} ${className}`}>
        <Icon size={12} strokeWidth={2.5} /> {short}
      </span>
    </Tooltip>
  );
}
