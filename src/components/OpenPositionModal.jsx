import { Sparkles, Undo2, Check } from "lucide-react";
import { scoringHeaders } from "@/lib/scoringAuth";
import { parseSkills } from "@/lib/organizeSkills";
// Open a position (choosing its interview stages), OR — when passed an
// existing `position` — edit one (WS1: a vacancy needs a real edit path, not
// just a one-shot create). Editing never touches stages/assignees; that's
// StageConfigModal's job, already a separate, working flow this doesn't
// duplicate — so the stage picker only renders in create mode.
import { useState, useEffect, useId, useMemo } from "react";
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
const parseList = parseSkills;

export default function OpenPositionModal({ open, onClose, position = null }) {
  const isEdit = !!position;
  const departmentListId = useId();
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
  const [skillsBeforeOrganizing, setSkillsBeforeOrganizing] = useState(null);
  const [organizing, setOrganizing] = useState(false);
  const [skillsPreview, setSkillsPreview] = useState(null);
  const [organizeError, setOrganizeError] = useState("");

  // Live candidate-facing chip preview — entirely local, zero AI cost. Runs
  // the SAME deterministic parser (parseSkills -> requirementEntries) that
  // decides what candidates actually see, so a heading HR accidentally
  // pasted in ("Nice-to-Haves / Edge Factors") or an orphaned "and .../or
  // ..." fragment from a hard-wrapped paste shows up as a bad chip right
  // here, before publishing — not after a candidate sees it. Debounced
  // 600ms purely so the chip row doesn't re-render on every keystroke;
  // there is no network call here to debounce the COST of, this is just
  // local regex parsing.
  const [requiredSkillsTextDebounced, setRequiredSkillsTextDebounced] = useState("");
  const [niceToHaveTextDebounced, setNiceToHaveTextDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setRequiredSkillsTextDebounced(requiredSkillsText), 600);
    return () => clearTimeout(t);
  }, [requiredSkillsText]);
  useEffect(() => {
    const t = setTimeout(() => setNiceToHaveTextDebounced(niceToHaveText), 600);
    return () => clearTimeout(t);
  }, [niceToHaveText]);
  const requiredChipsPreview = useMemo(() => parseList(requiredSkillsTextDebounced), [requiredSkillsTextDebounced]);
  const niceChipsPreview = useMemo(() => parseList(niceToHaveTextDebounced), [niceToHaveTextDebounced]);

  const organize = async () => {
    setOrganizing(true); setOrganizeError(""); setSkillsPreview(null);
    const original = { required: requiredSkillsText, nice: niceToHaveText };
    try {
      const response = await fetch("/api/organize-skills", { method: "POST", headers: await scoringHeaders(), body: JSON.stringify({ ...original, role: { title, description } }), signal: AbortSignal.timeout(55000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Could not organize skills.");
      setSkillsPreview({ ...result, original });
    } catch (error) { setOrganizeError(error.message || "Could not organize skills. Your text is unchanged."); }
    finally { setOrganizing(false); }
  };
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
    setSkillsPreview(null); setOrganizeError("");
    setSkillsBeforeOrganizing(null);
    setDescription(position.description || "");
    setMinQualification(position.minQualification || "");
    setQualField(position.requirements?.requiredQualification?.field || position.requirements?.fieldOfStudy || "");
    { const req = position.requirements?.requiredSkillsDisplay ?? (position.requirements?.requiredSkills || []).join(", "); setRequiredSkillsText(req); setRequiredSkillsTextDebounced(req); }
    setMinYearsExperience(String(position.requirements?.minYearsExperience ?? 0));
    { const nice = position.requirements?.niceToHaveDisplay ?? (position.requirements?.niceToHave || []).join(", "); setNiceToHaveText(nice); setNiceToHaveTextDebounced(nice); }
    setSalaryRange(position.salaryRange || "");
    setCloseDate(msToDateStr(position.closesAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position?.id]);

  const reset = () => {
    setSkillsPreview(null); setOrganizeError("");
    setSkillsBeforeOrganizing(null);
    setTitle("");
    setDepartment("");
    setDescription("");
    setMinQualification("");
    setQualField("");
    setRequiredSkillsText(""); setRequiredSkillsTextDebounced("");
    setMinYearsExperience("0");
    setNiceToHaveText(""); setNiceToHaveTextDebounced("");
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
  const canSubmit = !organizing && !skillsPreview && title.trim() && department.trim() && closeDate && parseList(requiredSkillsText).length > 0;
  const submit = async () => {
    if (!canSubmit) return;
    setOrganizing(true); setOrganizeError("");
    try {
    const original = { required: requiredSkillsText, nice: niceToHaveText };
    const previous = position?.requirements?.skillExtraction;
    let extracted;
    if (previous?.version === 1 && previous.requiredSource === requiredSkillsText && previous.niceSource === niceToHaveText && title === position.title && description === position.description) {
      extracted = { required: previous.required, nice: previous.nice };
    } else {
    const response = await fetch("/api/organize-skills", { method: "POST", headers: await scoringHeaders(), body: JSON.stringify({ ...original, extract: true, role: { title, description } }), signal: AbortSignal.timeout(105000) });
    extracted = await response.json();
    if (!response.ok || !extracted.ok) throw new Error(extracted.error || "Could not extract skills. Your text is unchanged; please retry.");
    }
    const requirements = {
      fieldOfStudy: qualField.trim() || null,
      requiredQualification: degreeLevel ? { level: degreeLevel, field: qualField.trim() || null } : null,
      requiredSkills: parseList(extracted.required),
      skillExtraction: { version: 1, requiredSource: requiredSkillsText, niceSource: niceToHaveText, required: extracted.required, nice: extracted.nice },
      requiredSkillsDisplay: requiredSkillsText,
      niceToHaveDisplay: niceToHaveText,
      minYearsExperience: Math.max(0, Number(minYearsExperience) || 0),
      niceToHave: parseList(extracted.nice),
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
    } catch (error) { setOrganizeError(error.message || "Could not save position."); }
    finally { setOrganizing(false); }
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
          <Button onClick={submit} disabled={!canSubmit}>{organizing ? "Analyzing skills..." : isEdit ? "Save changes" : "Create & open"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Job title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Backend Developer" autoFocus />
          </Field>
          <Field label="Department">
            <Input
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              list={departmentListId}
              autoComplete="off"
              placeholder="Select or type a department"
              aria-describedby={`${departmentListId}-hint`}
            />
            <datalist id={departmentListId}>
              {DEPARTMENT_NAMES.map((d) => <option key={d} value={d} />)}
            </datalist>
            <p id={`${departmentListId}-hint`} className="text-xs text-muted-foreground">
              Choose a suggestion or type your own department.
            </p>
          </Field>
        </div>
        <Field label="Description">
          <Textarea autoGrow className="min-h-[200px]" value={description} onChange={(e) => setDescription(e.target.value)} rows={8} maxLength={20000} placeholder="Describe the actual responsibilities, business domain and company-specific work..." />
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
              CVs are compared with these explicit requirements and company-specific responsibilities in your description. Requirements contribute 90% and description fit 10% when concrete responsibilities are present. Skills are assessed by role coverage and alternative stacks. Mark non-negotiable skills explicitly as mandatory. Nice-to-have skills add bonus credit.
            </p>
            {isEdit && (
              <p className="text-xs font-medium text-[#B45309] dark:text-[#FBBF24]">
                Changing the description or scoring requirements updates Applied-stage scores automatically. Later-stage assessments remain historical.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <label htmlFor={`${departmentListId}-skills`} className="text-[13px] font-semibold text-foreground">Required skills <span className="text-red-600">*</span></label>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50" disabled={organizing || !!skillsPreview || (!requiredSkillsText.trim() && !niceToHaveText.trim())} onClick={organize}>
                <Sparkles size={13} aria-hidden="true" />{organizing ? "Organizing..." : "Organize skills with AI"}
              </button>
              {skillsPreview && <button type="button" className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs font-semibold text-primary hover:bg-secondary" onClick={() => {
                setSkillsBeforeOrganizing(skillsPreview.original);
                setRequiredSkillsText(skillsPreview.required); setNiceToHaveText(skillsPreview.nice); setSkillsPreview(null);
              }}><Check size={13} aria-hidden="true" />Apply</button>}
              {(skillsPreview || skillsBeforeOrganizing) && <button type="button" disabled={organizing} className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:underline disabled:opacity-50" onClick={() => {
                const original = skillsPreview?.original || skillsBeforeOrganizing;
                setRequiredSkillsText(original.required); setNiceToHaveText(original.nice);
                setSkillsPreview(null); setSkillsBeforeOrganizing(null); setOrganizeError("");
              }}><Undo2 size={13} aria-hidden="true" />Undo organization</button>}
            </div>
            {organizeError && <p role="alert" className="text-sm text-red-600">{organizeError}</p>}
            <Textarea id={`${departmentListId}-skills`} autoGrow className="min-h-[110px]" rows={5} disabled={organizing}
              value={skillsPreview ? skillsPreview.required : requiredSkillsText}
              onChange={e => skillsPreview ? setSkillsPreview(p => ({ ...p, required: e.target.value })) : setRequiredSkillsText(e.target.value)}
              placeholder="e.g. React, TypeScript, Node.js"
            />
            <p className="mt-1 text-xs text-muted-foreground">{skillsPreview ? "Review the organized text here, then Apply or Undo." : "Separate skills with commas or new lines. At least one is required to open the position."}</p>
            {!skillsPreview && <ChipPreview chips={requiredChipsPreview} />}
          </div>

          <Field label="Nice-to-have skills (optional)">
            <Textarea autoGrow className="min-h-[110px]" rows={5} disabled={organizing} value={skillsPreview ? skillsPreview.nice : niceToHaveText} onChange={e => skillsPreview ? setSkillsPreview(p => ({ ...p, nice: e.target.value })) : setNiceToHaveText(e.target.value)} placeholder="e.g. GraphQL" />
            {!skillsPreview && <ChipPreview chips={niceChipsPreview} />}
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Field of study (optional)">
              <Input
                value={qualField}
                onChange={(e) => setQualField(e.target.value)}
                placeholder="e.g. Computer Science"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Optional. Saved with this position; used for qualification matching when
                a Bachelor's, Master's or PhD minimum is selected.
              </p>
            </Field>
            <Field label="Minimum years of experience">
              <Input type="number" min={0} value={minYearsExperience} onChange={(e) => setMinYearsExperience(e.target.value)} />
            </Field>
          </div>
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

// The exact candidate-facing chips this text will produce, right now — so a
// leaked section heading or an orphaned "and .../or ..." fragment is obvious
// before publishing, not after a candidate sees it.
function ChipPreview({ chips }) {
  if (!chips.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map((skill, i) => (
        <span key={`${skill}-${i}`} className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground">
          {skill}
        </span>
      ))}
    </div>
  );
}
