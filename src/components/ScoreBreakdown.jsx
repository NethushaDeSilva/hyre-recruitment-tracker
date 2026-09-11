// WS5 5.7/5.8 — the per-requirement breakdown behind one candidate's score.
// "Every score opens to its breakdown... a recruiter must be able to check
// the machine, not trust it." Renders exactly the engine's output schema —
// nothing here recomputes or reinterprets a number the engine already gave.
import { CheckCircle2, XCircle, AlertTriangle, Zap, Type } from "lucide-react";
import { formatDate } from "@/lib/format";

function Bar({ score, max }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

// The layer-firing indicator (5.4's open decision, WS6.1): exact/normalised
// matches vs an embedding-backed one, right on the term that used it — the
// most legible place to demonstrate traceability, not a separate report.
function LayerTag({ layer, similarity }) {
  const isEmbedding = layer === "embedding";
  return (
    <span
      title={isEmbedding ? `Matched by embedding similarity (${similarity?.toFixed(3)})` : "Exact match after normalisation"}
      className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
        isEmbedding ? "bg-[#7C3AED]/12 text-[#7C3AED] dark:text-[#C4B5FD]" : "bg-[#16A34A]/12 text-[#16A34A] dark:text-[#4ADE80]"
      }`}
    >
      {isEmbedding ? <Zap size={9} /> : <Type size={9} />}
      {isEmbedding ? "embed" : "exact"}
    </span>
  );
}

function SkillRow({ m }) {
  const statusIcon =
    m.status === "verified" ? <CheckCircle2 size={12} className="shrink-0 text-[#16A34A]" /> :
    m.status === "inferred" ? <AlertTriangle size={12} className="shrink-0 text-[#A9781A]" /> :
    <XCircle size={12} className="shrink-0 text-[#DC2626]" />;
  return (
    <li className="flex items-center gap-1.5 text-[12px]">
      {statusIcon}
      <span className="font-medium text-foreground">{m.required}</span>
      {m.found !== m.required && <span className="text-muted-foreground">({m.found})</span>}
      <LayerTag layer={m.layer} similarity={m.similarity} />
      {m.status === "inferred" && <span className="text-[10px] text-[#A9781A]">inferred, not literal</span>}
    </li>
  );
}

function SkillsBlock({ title, block }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">{title}</span>
        <span className="text-xs font-bold text-foreground">{block.score}/{block.max}</span>
      </div>
      <Bar score={block.score} max={block.max} />
      {block.matched?.length > 0 && <ul className="space-y-1 pt-1">{block.matched.map((m, i) => <SkillRow key={i} m={m} />)}</ul>}
      {block.missing?.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Missing: <span className="text-[#DC2626]">{block.missing.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

export default function ScoreBreakdown({ score }) {
  const { overallScore, capApplied, breakdown, meta } = score;
  const qual = breakdown.qualifications;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">Score breakdown</span>
        <span className="text-lg font-extrabold text-primary">{overallScore}<span className="text-xs font-medium text-muted-foreground">/100</span></span>
      </div>

      {capApplied && (
        <div className="flex items-start gap-1.5 rounded-md bg-[#FBF1DC] px-2.5 py-2 text-[12px] font-medium text-[#8A6314] dark:bg-[#3a2f0f] dark:text-[#F5D77E]">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Degree-level requirement not met — the total score is capped, not clamped, so rank order among affected candidates is preserved.
        </div>
      )}

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Qualifications</span>
          <span className="text-xs font-bold text-foreground">{qual.applicable === false ? "N/A" : `${qual.score}/${qual.max}`}</span>
        </div>
        {qual.applicable === false ? (
          <p className="text-[12px] text-muted-foreground">This vacancy has no qualification requirement — the remaining 75 points are rescaled to 100 (5.3).</p>
        ) : (
          <>
            <Bar score={qual.score} max={qual.max} />
            <p className="text-[12px] text-muted-foreground">
              {qual.levelMet ? "Level met" : "Level not met"}
              {qual.matched?.length > 0 && <> — {qual.matched.join(", ")}</>}
              {qual.fieldSimilarity != null && <> · field similarity {qual.fieldSimilarity.toFixed(3)}</>}
            </p>
            {qual.needsReview && qual.reviewReason === "field-not-extracted" && (
              <p className="flex items-center gap-1 text-[12px] font-semibold text-[#B91C1C]">
                <AlertTriangle size={12} /> Qualification field not extracted — review. The level was met, but no field of study was found to compare against this requirement — this may be a parse gap, not a genuine mismatch.
              </p>
            )}
            {qual.needsReview && qual.reviewReason === "unverifiable" && (
              <p className="flex items-center gap-1 text-[12px] font-semibold text-[#B91C1C]">
                <AlertTriangle size={12} /> Flagged: "{qual.flaggedQualification}" isn't grounded in the CV text — treated as an extraction failure, not a silently dropped field.
              </p>
            )}
          </>
        )}
      </div>

      <SkillsBlock title="Core required skills" block={breakdown.coreSkills} />
      <SkillsBlock title="Nice-to-have skills" block={breakdown.preferredSkills} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#94A3B8]">Experience</span>
          <span className="text-xs font-bold text-foreground">{breakdown.experience.score}/{breakdown.experience.max}</span>
        </div>
        <Bar score={breakdown.experience.score} max={breakdown.experience.max} />
        <p className="text-[12px] text-muted-foreground">
          {breakdown.experience.candidateYears} year{breakdown.experience.candidateYears === 1 ? "" : "s"} against a {breakdown.experience.requiredYears}-year minimum
        </p>
      </div>

      {meta && (
        <p className="border-t border-border pt-2.5 text-[11px] text-muted-foreground">
          Engine v{meta.engineVersion} · scored {formatDate(meta.scoredAt)} · skill threshold {meta.skillThreshold?.toFixed(4)} · qual threshold {meta.qualThreshold?.toFixed(4)}
        </p>
      )}
    </div>
  );
}
