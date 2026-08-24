// Side-by-side candidate comparison (HR & Interviewer only). Puts 2–3 applicants
// in columns and their attributes in rows, so a recruiter can scan across a row
// ("Experience: 5–8 vs 1–3 vs 3–5") and decide who to move forward. Read-only —
// it's a decision aid, not an action surface.
import { ExternalLink, Download, Linkedin } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import EligibilityTag from "@/components/EligibilityTag";
import { resolveStage } from "@/lib/stages";
import { formatDate } from "@/lib/format";
import { openDataUrl, downloadDataUrl } from "@/lib/file";

// Most recent review score left on a candidate (any stage), or null.
const lastScore = (c) => {
  const scored = (c.comments || []).filter((cm) => cm.score != null);
  return scored.length ? scored[scored.length - 1].score : null;
};

const Skills = ({ value }) => {
  const list = String(value || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((s, i) => (
        <span key={i} className="rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-foreground">{s}</span>
      ))}
    </div>
  );
};

const val = (v) => (v ? <span className="text-foreground">{v}</span> : <span className="text-muted-foreground">—</span>);

export default function CompareModal({ open, onClose, candidates = [], position }) {
  if (!open) return null;
  const people = candidates.filter(Boolean).slice(0, 3);

  // Each row = one attribute; render(c) draws that attribute's cell for candidate c.
  const ROWS = [
    { label: "Candidate ID", render: (c) => c.candidateId
        ? <span className="font-mono text-xs font-bold text-foreground">{c.candidateId}</span>
        : <span className="text-muted-foreground">—</span> },
    { label: "Current stage", render: (c) => {
        const st = resolveStage(position, c.stage);
        return <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: st.badgeFg }}>
          <span className="h-2 w-2 rounded-full" style={{ background: st.dot }} /> {st.label}
        </span>;
      } },
    { label: "Eligibility", render: (c) =>
        position?.minQualification && c.highestQualification
          ? <EligibilityTag candidateQual={c.highestQualification} minQual={position.minQualification} />
          : <span className="text-muted-foreground">—</span> },
    { label: "Highest qualification", render: (c) => val(c.highestQualification) },
    { label: "Field of study", render: (c) => val(c.fieldOfStudy) },
    { label: "Experience", render: (c) => val(c.experience) },
    { label: "Current / recent role", render: (c) => val(c.currentRole) },
    { label: "Current / recent company", render: (c) => val(c.currentCompany) },
    { label: "Location", render: (c) => val(c.location) },
    { label: "Key skills", render: (c) => <Skills value={c.skills} /> },
    { label: "Latest review score", render: (c) => {
        const s = lastScore(c);
        return s == null ? <span className="text-muted-foreground">Not reviewed</span>
          : <span className="font-bold text-foreground">{s}<span className="text-muted-foreground">/100</span></span>;
      } },
    { label: "Applied", render: (c) => val(c.appliedAt ? formatDate(c.appliedAt) : "") },
    { label: "LinkedIn", render: (c) => c.linkedIn
        ? <a href={c.linkedIn} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><Linkedin size={13} /> Profile</a>
        : <span className="text-muted-foreground">—</span> },
    { label: "CV", render: (c) => c.cvDataUrl
        ? <div className="flex flex-wrap gap-1.5">
            <button onClick={() => openDataUrl(c.cvDataUrl)} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary"><ExternalLink size={12} /> View</button>
            <button onClick={() => downloadDataUrl(c.cvDataUrl, c.cvFileName || "cv")} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:bg-secondary"><Download size={12} /> CV</button>
          </div>
        : <span className="text-muted-foreground">No CV</span> },
  ];

  const colW = people.length >= 3 ? "min-w-[190px]" : "min-w-[230px]";

  return (
    <Modal open={open} onClose={onClose} width={people.length >= 3 ? 940 : 720} title="Compare candidates" subtitle={position ? position.title : ""}>
      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-[150px] min-w-[150px] bg-card" />
              {people.map((c) => (
                <th key={c.id} className={`${colW} border-b border-border p-3 text-left align-bottom`}>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={c.name} color={c.avatarColor} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{c.name}</div>
                      <div className="truncate text-xs font-medium text-muted-foreground">{c.appliedRole || "Candidate"}</div>
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, ri) => (
              <tr key={row.label} className={ri % 2 ? "bg-secondary/40" : ""}>
                <td className={`sticky left-0 z-10 border-b border-border p-3 align-top text-[12px] font-semibold text-muted-foreground ${ri % 2 ? "bg-[#F1F4F8] dark:bg-[#1b1b1e]" : "bg-card"}`}>
                  {row.label}
                </td>
                {people.map((c) => (
                  <td key={c.id} className="border-b border-border p-3 align-top text-[13px] leading-relaxed">
                    {row.render(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
