// Open a position (choosing its interview stages), OR — when passed an
// existing `position` — edit one (WS1: a vacancy needs a real edit path, not
// just a one-shot create). Editing never touches stages/assignees; that's
// StageConfigModal's job, already a separate, working flow this doesn't
// duplicate — so the stage picker only renders in create mode.
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import StagePicker from "@/components/StagePicker";
import { buildPipeline } from "@/lib/stages";
import { QUALIFICATIONS, QUALIFICATION_TO_DEGREE_LEVEL } from "@/lib/application";
import { DEPARTMENT_NAMES } from "@/lib/departments";
import { addPosition, updatePosition } from "@/data/store";
import { useAuth } from "@/context/AuthContext";

// Sensible default process: HR screening → Department review → Initial interview → Final interview.
const DEFAULT_MIDDLE = ["screening", "dept", "interview", "final"];

// Local YYYY-MM-DD for today (the earliest selectable close date) and a ms timestamp
// at the END of a chosen day — the vacancy stays open through that whole day, then
// closes itself automatically.
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const endOfDayMs = (s) => { if (!s) return 0; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };
// The reverse, for prefilling the date input when editing an existing position.
const msToDateStr = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// WS5 5.2 — comma-separated is the same convention already used for a
// parsed CV's skills (see cv-profile.js) — no new input widget needed.
const parseList = (s) => s.split(",").map((v) => v.trim()).filter(Boolean);

export default function OpenPositionModal({ open, onClose, position = null }) {
  const isEdit = !!position;
  const nav = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [minQualification, setMinQualification] = useState("");
  // WS5 5.2/5.3 — field of study is still a distinct input; degree LEVEL is
  // no longer a separate dropdown, it's derived from minQualification below
  // (see QUALIFICATION_TO_DEGREE_LEVEL) so there's a single qualification
  // input instead of two that could disagree.
  const [qualField, setQualField] = useState("");
  const [requiredSkillsText, setRequiredSkillsText] = useState("");
  const [minYearsExperience, setMinYearsExperience] = useState("0");
  const [niceToHaveText, setNiceToHaveText] = useState("");
  // Candidate-facing job detail page — free text, HR-entered only, optional.
  // Never computed, estimated or fetched (see JobDetail.jsx).
  const [salaryRange, setSalaryRange] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [selected, setSelected] = useState(DEFAULT_MIDDLE);
  // WS5 5.3 — derived, not chosen: Bachelor's/Master's/PhD map onto the
  // engine's 6/7/8 scale, everything else leaves requiredQualification null
  // (not applicable), scored on the existing nullable/normalised path.
  const degreeLevel = QUALIFICATION_TO_DEGREE_LEVEL[minQualification] || null;

  // Prefill from the position being edited. Keyed on `open` (not `position`)
  // so a background data refresh mid-edit can't clobber in-progress changes —
  // same convention ApplyModal uses for its own prefill.
  useEffect(() => {
    if (!open) return;
    if (!position) return;
    setTitle(position.title || "");
    setDepartment(position.department || "");
    setDescription(position.description || "");
    setMinQualification(position.minQualification || "");
    setQualField(position.requirements?.requiredQualification?.field || "");
    setRequiredSkillsText((position.requirements?.requiredSkills || []).join(", "));
    setMinYearsExperience(String(position.requirements?.minYearsExperience ?? 0));
    setNiceToHaveText((position.requirements?.niceToHave || []).join(", "));
    setSalaryRange(position.salaryRange || "");
    setCloseDate(msToDateStr(position.closesAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position?.id]);

  const reset = () => {
    setTitle("");
    setDepartment("");
    setDescription("");
    setMinQualification("");
    setQualField("");
    setRequiredSkillsText("");
    setMinYearsExperience("0");
    setNiceToHaveText("");
    setSalaryRange("");
    setCloseDate("");
    setSelected(DEFAULT_MIDDLE);
  };
  const close = () => {
    reset();
    onClose();
  };
  // 5.5 — a position can't be Open without enough for WS5 to score against.
  // Only required skills gates this; requiredQualification stays optional
  // (5.2/5.3 — a role can genuinely have no degree-level minimum). Applies to
  // both create and edit — store.js enforces it again server-side either way.
  const canSubmit = title.trim() && department.trim() && closeDate && parseList(requiredSkillsText).length > 0;
  const submit = async () => {
    if (!canSubmit) return;
    const requirements = {
      requiredQualification: degreeLevel ? { level: degreeLevel, field: qualField.trim() || null } : null,
      requiredSkills: parseList(requiredSkillsText),
      minYearsExperience: Math.max(0, Number(minYearsExperience) || 0),
      niceToHave: parseList(niceToHaveText),
    };
    // headcount, hiringManagerUid/Name and shortlistThreshold no longer have a
    // UI control in this modal (section 2/4) but updatePosition() overwrites
    // whatever it's given — passing the position's own current value through
    // unchanged is what stops an unrelated edit from silently wiping them.
    if (isEdit) {
      await updatePosition(position.id, {
        title, department, description, minQualification,
        closesAt: endOfDayMs(closeDate),
        headcount: position.headcount || 1,
        hiringManagerUid: position.hiringManagerUid || "",
        hiringManagerName: position.hiringManagerName || "",
        requirements,
        shortlistThreshold: position.shortlistThreshold ?? 0,
        salaryRange,
      });
      close();
      return;
    }
    const pos = await addPosition({
      title, department, description, minQualification,
      closesAt: endOfDayMs(closeDate),
      headcount: 1,
      stages: buildPipeline(selected),
      createdByRole: user?.role,
      createdByUid: user?.uid || "",
      createdByName: user?.name || "",
      requirements,
      shortlistThreshold: 0,
      salaryRange,
    });
    close();
    nav(`/positions/${pos.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      width={720}
      title={isEdit ? "Edit position" : "Open a position"}
      subtitle={isEdit ? "Update this vacancy's details and scoring requirements." : "Create a vacancy and choose its interview stages."}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>{isEdit ? "Save changes" : "Create & open"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Job title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Backend Developer" autoFocus />
          </Field>
          <Field label="Department">
            <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
              <option value="">Select a department…</option>
              {DEPARTMENT_NAMES.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Short summary of the role and responsibilities…" />
        </Field>

        <Field label="Minimum qualification (optional)">
          <Select value={minQualification} onChange={(e) => setMinQualification(e.target.value)}>
            <option value="">No minimum — accept everyone</option>
            {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">Applicants below this get a ⚠️ hint on their card — they're never auto-rejected.</p>
        </Field>

        <div className="space-y-4 rounded-lg border border-border bg-secondary/40 p-4">
          <div className="space-y-1">
            <div className="text-[13px] font-semibold text-foreground">Scoring requirements</div>
            <p className="text-xs text-muted-foreground">
              What every submitted CV is compared against for the initial shortlist. Required skills is the one thing that can't be left blank — without it there's nothing to score CVs against.
            </p>
            {isEdit && (
              <p className="text-xs font-medium text-[#B45309] dark:text-[#FBBF24]">
                Changing anything below marks this position's already-computed scores as stale — they'll need re-scoring.
              </p>
            )}
          </div>

          <Field label="Required skills" required>
            <Input
              value={requiredSkillsText}
              onChange={(e) => setRequiredSkillsText(e.target.value)}
              placeholder="e.g. React, TypeScript, Node.js"
            />
            <p className="mt-1 text-xs text-muted-foreground">Comma-separated. At least one is required to open the position.</p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Minimum years of experience">
              <Input type="number" min={0} value={minYearsExperience} onChange={(e) => setMinYearsExperience(e.target.value)} />
            </Field>
            <Field label="Nice-to-have skills (optional)">
              <Input value={niceToHaveText} onChange={(e) => setNiceToHaveText(e.target.value)} placeholder="e.g. GraphQL" />
            </Field>
          </div>

          <Field label="Field of study (optional)">
            <Input
              value={qualField}
              onChange={(e) => setQualField(e.target.value)}
              placeholder="e.g. Computer Science"
              disabled={!degreeLevel}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {degreeLevel
                ? "Optional — leave blank to accept any field at this degree level."
                : "Only applies when \"Minimum qualification\" above is Bachelor's, Master's or PhD."}
            </p>
          </Field>
        </div>

        <Field label="Salary range (optional)">
          <Input
            value={salaryRange}
            onChange={(e) => setSalaryRange(e.target.value)}
            maxLength={120}
            placeholder="e.g. LKR 150,000 – 200,000 per month"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Shown on the candidate's job detail page exactly as typed. Leave blank to omit the salary section entirely — never guessed or estimated.
          </p>
        </Field>

        <Field label="Auto-close date">
          <Input type="date" value={closeDate} min={todayStr()} onChange={(e) => setCloseDate(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Required. The position stays open through this day, then closes itself automatically — and a closed position can’t be reopened.</p>
        </Field>

        {!isEdit && (
          <div className="space-y-1.5">
            <div className="text-[13px] font-semibold text-foreground">Interview stages</div>
            <p className="text-xs text-muted-foreground">Tick the stages this position uses — junior roles can skip later rounds.</p>
            <StagePicker value={selected} onChange={setSelected} />
          </div>
        )}
      </div>
    </Modal>
  );
}
