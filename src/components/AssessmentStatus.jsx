import { assessmentEligibility } from "@/lib/scoreStaleness";

export default function AssessmentStatus({ score, position, candidate, detailed = false }) {
  const eligibility = assessmentEligibility(score, position, candidate);
  const labels = { meets: "Meets mandatory requirements", does_not_meet: "Mandatory requirement not met", needs_review: "Eligibility needs review" };
  const reasons = detailed ? eligibility.reasons : eligibility.reasons.slice(0, 1);
  return <div className="space-y-1 text-xs" role="status">
    <div className="font-semibold">{score?.status === "scored" ? `Score ${score.overallScore}/100 · ` : ""}{labels[eligibility.status]}</div>
    {reasons.map((r, i) => <p key={`${r.code}-${i}`} className="text-muted-foreground">{r.message}</p>)}
  </div>;
}
