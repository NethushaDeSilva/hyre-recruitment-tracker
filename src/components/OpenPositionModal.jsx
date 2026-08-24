// Open a position and choose its interview stages (configurable per vacancy).
// Applied & Hired always bookend the pipeline; the middle stages are chosen here.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Textarea, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import StagePicker from "@/components/StagePicker";
import { buildPipeline } from "@/lib/stages";
import { QUALIFICATIONS } from "@/lib/application";
import { DEPARTMENT_NAMES } from "@/lib/departments";
import { addPosition } from "@/data/store";
import { useAuth } from "@/context/AuthContext";

// Sensible default process: HR screening → Department review → Initial interview → Final interview.
const DEFAULT_MIDDLE = ["screening", "dept", "interview", "final"];

// Local YYYY-MM-DD for today (the earliest selectable close date) and a ms timestamp
// at the END of a chosen day — the vacancy stays open through that whole day, then
// closes itself automatically.
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const endOfDayMs = (s) => { if (!s) return 0; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999).getTime(); };

export default function OpenPositionModal({ open, onClose }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [description, setDescription] = useState("");
  const [minQualification, setMinQualification] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [selected, setSelected] = useState(DEFAULT_MIDDLE);

  const reset = () => {
    setTitle("");
    setDepartment("");
    setDescription("");
    setMinQualification("");
    setCloseDate("");
    setSelected(DEFAULT_MIDDLE);
  };
  const close = () => {
    reset();
    onClose();
  };
  const canSubmit = title.trim() && department.trim() && closeDate;
  const submit = async () => {
    if (!canSubmit) return;
    const pos = await addPosition({
      title, department, description, minQualification,
      closesAt: endOfDayMs(closeDate),
      stages: buildPipeline(selected),
      createdByRole: user?.role,
      createdByUid: user?.uid || "",
      createdByName: user?.name || "",
    });
    close();
    nav(`/positions/${pos.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      width={520}
      title="Open a position"
      subtitle="Create a vacancy and choose its interview stages."
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>Create &amp; open</Button>
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
            {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q} or above</option>)}
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">Applicants below this get a ⚠️ hint on their card — they're never auto-rejected.</p>
        </Field>

        <Field label="Auto-close date">
          <Input type="date" value={closeDate} min={todayStr()} onChange={(e) => setCloseDate(e.target.value)} />
          <p className="mt-1 text-xs text-muted-foreground">Required. The position stays open through this day, then closes itself automatically — and a closed position can’t be reopened.</p>
        </Field>

        <div className="space-y-1.5">
          <div className="text-[13px] font-semibold text-foreground">Interview stages</div>
          <p className="text-xs text-muted-foreground">Tick the stages this position uses — junior roles can skip later rounds.</p>
          <StagePicker value={selected} onChange={setSelected} />
        </div>
      </div>
    </Modal>
  );
}
