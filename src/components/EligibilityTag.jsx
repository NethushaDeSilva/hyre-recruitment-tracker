// A tiny at-a-glance flag: does this applicant clear the position's minimum
// qualification? Green ✅ = meets the bar, amber ⚠️ = below it. It's a hint for
// the recruiter only — nobody is auto-rejected on the strength of this.
// Renders nothing when there's no minimum set or the candidate didn't say.
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { meetsQualification } from "@/lib/application";
import { Tooltip } from "@/components/ui/Tooltip";

export default function EligibilityTag({ candidateQual, minQual, className = "" }) {
  const ok = meetsQualification(candidateQual, minQual);
  if (ok === null) return null;

  return ok ? (
    <Tooltip label={`This candidate's qualification meets this role's minimum requirement (${minQual}).`}>
      <span className={`inline-flex items-center gap-1 rounded-md bg-[#E7F6EC] px-1.5 py-0.5 text-[11px] font-bold text-[#16A34A] dark:bg-[#16A34A]/15 ${className}`}>
        <CheckCircle2 size={12} strokeWidth={2.5} /> Meets
      </span>
    </Tooltip>
  ) : (
    <Tooltip label={`This candidate's qualification is below this role's minimum requirement (needs ${minQual}). It's only a hint — they aren't auto-rejected.`}>
      <span className={`inline-flex items-center gap-1 rounded-md bg-[#FEF3C7] px-1.5 py-0.5 text-[11px] font-bold text-[#B45309] dark:bg-[#F59E0B]/15 dark:text-[#FBBF24] ${className}`}>
        <AlertTriangle size={12} strokeWidth={2.5} /> Below bar
      </span>
    </Tooltip>
  );
}
