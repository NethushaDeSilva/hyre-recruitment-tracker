// One grouped-by-person row on the Candidates table — extracted from
// CandidatesTable.jsx to keep both files under the ~300-line component limit.
// Each application a person has open renders as its own chip/row-slice in the
// Position, Match and Applied columns, in the same order, so multiple
// applications from the same person never look like a single blended record.
import { useState } from "react";
import { ChevronDown, ChevronUp, AlertCircle, Download } from "lucide-react";
import { StageBadge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate, displayName } from "@/lib/format";
import { downloadDataUrl } from "@/lib/file";
import EligibilityTag from "@/components/EligibilityTag";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { HoverScrollText } from "@/components/ui/HoverScrollText";
import { isScoreStale, staleReason, notScoredReason, scorePillClass } from "@/lib/scoreStaleness";
import { cn } from "@/lib/utils";

// Match pill for one application — reads applicationScores only (WS5 5.7/5.8).
// Never computes or requests a score; a missing/failed doc is its own
// explicit state per 10.1, never a 0 and never blank.
function MatchPill({ position, scoreDoc, isOpen, onToggle }) {
  const scored = scoreDoc?.status === "scored";
  if (!scored) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <AlertCircle size={10} /> Not scored — {notScoredReason(scoreDoc, position)}
      </span>
    );
  }
  const stale = isScoreStale(scoreDoc);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold transition-opacity hover:opacity-80"
    >
      <span className={cn("rounded-full px-1.5 py-0.5", scorePillClass(scoreDoc.overallScore))}>
        {scoreDoc.overallScore}
      </span>
      {stale && (
        <span title={staleReason(scoreDoc)} className="rounded bg-[#FBF1DC] px-1 py-0.5 text-[9px] font-bold uppercase text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]">
          Stale
        </span>
      )}
      {isOpen ? <ChevronUp size={11} className="text-muted-foreground" /> : <ChevronDown size={11} className="text-muted-foreground" />}
    </button>
  );
}

export default function CandidatesTableRow({ c, checked, toggleGroup, titleFor, positionFor, minQualFor, scores, onOpenCandidate }) {
  const [openScoreId, setOpenScoreId] = useState(null); // which application's breakdown is expanded

  return (
    <tr
      onClick={() => onOpenCandidate(c.applications[0])}
      className={cn(
        "cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-background",
        c.applications.some((a) => checked.has(a.id)) && "bg-primary/5"
      )}
    >
      <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={c.applications.every((a) => checked.has(a.id))}
          onChange={() => toggleGroup(c)}
          aria-label={`Select ${displayName(c)}`}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2.5">
          <Avatar name={displayName(c)} color={c.avatarColor} size={34} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <HoverScrollText text={displayName(c)} className="min-w-0 flex-1 text-sm font-semibold text-foreground" />
              {c.source === "Role change" && (
                <span className="shrink-0 rounded bg-[#EEF2FF] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#4F46E5] dark:bg-[#4F46E5]/15 dark:text-[#A5B4FC]" title={`Internal role change from ${c.fromRole || "current role"}${c.fromEmployeeId ? ` (${c.fromEmployeeId})` : ""}`}>
                  Role change
                </span>
              )}
              {c.needsReview && (
                <span className="shrink-0 rounded bg-[#FBF1DC] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#A9781A] dark:bg-[#A9781A]/20 dark:text-[#F5D77E]" title={c.cvValidation?.reason || "CV validation was borderline — worth a second look"}>
                  Needs review
                </span>
              )}
            </div>
            <HoverScrollText text={c.email || "—"} className="text-xs text-muted-foreground" />
          </div>
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <HoverScrollText text={c.candidateId || "—"} className="font-mono text-xs font-semibold text-muted-foreground" />
      </td>
      {/* One self-contained "chip" per application — title, eligibility and
          stage live together, so a longer title or a second application never
          desyncs which stage belongs to which position. The Match and Applied
          columns list one entry per application in the SAME order, so they
          still line up with these top to bottom. */}
      <td className="px-4 py-3 align-top text-muted-foreground">
        <div className="space-y-1.5">
          {c.applications.map((a) => (
            <div
              key={a.id}
              onClick={(e) => { e.stopPropagation(); onOpenCandidate(a); }}
              className="rounded-md border border-border/60 bg-background px-2.5 py-1.5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-center gap-2">
                <HoverScrollText text={titleFor(a.positionId)} className="min-w-0 max-w-[45%] shrink font-medium text-foreground" />
                <StageBadge stageId={a.stage} />
                <EligibilityTag candidateQual={c.highestQualification} minQual={minQualFor(a.positionId)} />
              </div>
              {a.stage === "rejected" && a.rejection?.reason && (
                <div className="mt-1 text-[11px] font-medium text-[#DC2626]">{a.rejection.reason}</div>
              )}
            </div>
          ))}
        </div>
      </td>
      {/* Match — reads applicationScores only, one pill per application,
          expands in place to the SAME ScoreBreakdown used on the Shortlist. */}
      <td className="px-4 py-3 align-top text-muted-foreground">
        <div className="space-y-1.5">
          {c.applications.map((a) => {
            const position = positionFor(a.positionId);
            const scoreDoc = scores.get(a.id);
            const isOpen = openScoreId === a.id;
            return (
              <div key={a.id} className="py-1.5">
                <MatchPill
                  position={position}
                  scoreDoc={scoreDoc}
                  isOpen={isOpen}
                  onToggle={() => setOpenScoreId(isOpen ? null : a.id)}
                />
                {isOpen && scoreDoc?.status === "scored" && (
                  <div className="mt-2 w-72" onClick={(e) => e.stopPropagation()}>
                    <ScoreBreakdown score={scoreDoc} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </td>
      <td className="px-4 py-3 align-top text-muted-foreground">
        <HoverScrollText text={c.highestQualification || "—"} />
      </td>
      <td className="px-4 py-3 align-top text-muted-foreground">{c.experience || "—"}</td>
      <td className="px-4 py-3 align-top text-muted-foreground">
        <div className="space-y-1.5">
          {c.applications.map((a) => (
            <div key={a.id} className="py-1.5 leading-none">{formatDate(a.appliedAt)}</div>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        {c.cvDataUrl ? (
          <button
            onClick={(e) => { e.stopPropagation(); downloadDataUrl(c.cvDataUrl, c.cvFileName || "cv"); }}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-secondary"
            title={c.cvFileName}
          >
            <Download size={13} /> CV
          </button>
        ) : (
          <span className="text-xs text-[#94A3B8]">—</span>
        )}
      </td>
    </tr>
  );
}
