// The standard CV application form. A candidate fills structured fields (so HR
// can filter/sort later) and attaches their CV file. No demographic fields.
// Every field is required (except the cover note) AND a CV must be attached —
// pressing Submit with anything missing scrolls to the top, shows a red summary
// naming what's missing, and outlines each empty field in red.
import { useRef, useState, useEffect, useMemo } from "react";
import { UploadCloud, FileText, CheckCircle2, X, AlertCircle, Wand2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { QUALIFICATIONS, EXPERIENCE_RANGES } from "@/lib/application";
import { fileToDataUrl, validateCvFile, humanSize, MAX_CV_BYTES, ACCEPTED_CV_TYPES } from "@/lib/file";
import { applyToPosition, useHyreData } from "@/data/store";
import { useAuth } from "@/context/AuthContext";

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  location: "",
  highestQualification: "",
  fieldOfStudy: "",
  experience: "",
  currentRole: "",
  currentCompany: "",
  skills: "",
  linkedIn: "",
  coverNote: "",
};

// Every field here is required. Order = the order we list missing fields in the
// red summary. `coverNote` is deliberately NOT here — it stays optional.
const REQUIRED = [
  ["name", "Full name"],
  ["email", "Email"],
  ["phone", "Phone number"],
  ["location", "Location"],
  ["highestQualification", "Highest qualification"],
  ["fieldOfStudy", "Field of study"],
  ["experience", "Years of experience"],
  ["currentRole", "Current / most recent role"],
  ["currentCompany", "Current / most recent company"],
  ["skills", "Key skills"],
];

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Build the form values from a previous application (or the auth user if none).
// The cover note is DELIBERATELY never carried over — it's role-specific and
// changes from application to application.
const prefillFrom = (app, user) => ({
  name: app?.name || user?.name || "",
  email: app?.email || user?.email || "",
  phone: app?.phone || "",
  location: app?.location || "",
  highestQualification: app?.highestQualification || "",
  fieldOfStudy: app?.fieldOfStudy || "",
  experience: app?.experience || "",
  currentRole: app?.currentRole || "",
  currentCompany: app?.currentCompany || "",
  skills: app?.skills || "",
  linkedIn: app?.linkedIn || "",
  coverNote: "", // never autofilled
});

export default function ApplyModal({ open, onClose, position, onApplied }) {
  const { user } = useAuth();
  const { candidates } = useHyreData();
  const [form, setForm] = useState({ ...EMPTY, name: user?.name || "", email: user?.email || "" });
  const [cvFile, setCvFile] = useState(null); // a NEWLY chosen File (uploaded on submit)
  const [existingCv, setExistingCv] = useState(null); // { dataUrl, name, size } carried from a previous application
  const [cvError, setCvError] = useState("");
  const [errors, setErrors] = useState({}); // per-field messages
  const [summary, setSummary] = useState(""); // red banner at the top
  const [busy, setBusy] = useState(false);
  const topRef = useRef(null);

  // This candidate's OWN previous applications, newest first — so we can autofill
  // the form from the most recent one. (Scoped by uid or verified email, matching
  // how the rest of the portal identifies the candidate's rows.)
  const lastApp = useMemo(() => {
    const uid = user?.uid;
    const email = (user?.email || "").toLowerCase();
    return (candidates || [])
      .filter((c) => (uid && c.submittedByUid === uid) || (email && (c.email || "").toLowerCase() === email))
      .sort((a, b) => (b.appliedAt || 0) - (a.appliedAt || 0))[0] || null;
  }, [candidates, user?.uid, user?.email]);

  // On open, autofill every field (except the cover note) + the CV from the last
  // application. Keyed on `open` only, so a background data refresh can't wipe
  // the candidate's in-progress edits.
  useEffect(() => {
    if (!open) return;
    setForm(prefillFrom(lastApp, user));
    setExistingCv(lastApp?.cvDataUrl ? { dataUrl: lastApp.cvDataUrl, name: lastApp.cvFileName || "CV", size: lastApp.cvSize || 0 } : null);
    setCvFile(null);
    setErrors({});
    setSummary("");
    setCvError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Update a field and clear its error (and the summary) as the user fixes it.
  const set = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((er) => {
      if (!er[k]) return er;
      const n = { ...er };
      delete n[k];
      return n;
    });
    setSummary("");
  };

  const close = () => {
    setForm({ ...EMPTY, name: user?.name || "", email: user?.email || "" });
    setCvFile(null);
    setExistingCv(null);
    setCvError("");
    setErrors({});
    setSummary("");
    onClose();
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setCvError("");
    setSummary("");
    try {
      validateCvFile(file); // check type + size up front; the actual upload is on submit
      setCvFile(file);
      setExistingCv(null); // a fresh upload replaces the carried-over CV
    } catch (err) {
      setCvFile(null);
      setCvError(err.message);
    }
  };

  const removeCv = () => {
    setCvFile(null);
    setExistingCv(null);
  };
  // What CV is currently attached (a new upload OR the one carried from last time).
  const attachedCv = cvFile
    ? { name: cvFile.name, size: cvFile.size, carried: false }
    : existingCv
    ? { name: existingCv.name, size: existingCv.size, carried: true }
    : null;

  // Returns { fieldErrors, cvMessage } — empty when the form is valid.
  const validate = () => {
    const fieldErrors = {};
    for (const [key, label] of REQUIRED) {
      if (!String(form[key]).trim()) fieldErrors[key] = `${label} is required.`;
    }
    // Email must also be a real address, not just non-empty.
    if (!fieldErrors.email && !isEmail(form.email.trim())) {
      fieldErrors.email = "Enter a valid email address.";
    }
    const cvMessage = cvFile || existingCv ? "" : "Please attach your CV (PDF, DOC or DOCX) to continue.";
    return { fieldErrors, cvMessage };
  };

  const submit = async () => {
    const { fieldErrors, cvMessage } = validate();
    const missingKeys = Object.keys(fieldErrors);

    if (missingKeys.length || cvMessage) {
      setErrors(fieldErrors);
      setCvError(cvMessage);
      // Build a plain-language red summary naming exactly what's missing.
      const names = REQUIRED.filter(([k]) => fieldErrors[k]).map(([, label]) => label);
      if (fieldErrors.email === "Enter a valid email address." && !names.includes("Email")) names.push("Email");
      if (cvMessage) names.push("CV upload");
      setSummary(
        names.length === 1
          ? `${names[0]} is required before you can submit.`
          : `Please fill in the required fields before submitting: ${names.join(", ")}.`
      );
      // Scroll the form back to the top so the red banner is the first thing seen.
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    setBusy(true);
    setSummary("");
    try {
      // Use a freshly chosen file if there is one; otherwise reuse the CV carried
      // over from the candidate's previous application (already a stored data URL).
      let cvUrl, cvName, cvSize;
      if (cvFile) {
        const d = await fileToDataUrl(cvFile);
        cvUrl = d.dataUrl;
        cvName = d.name;
        cvSize = d.size;
      } else {
        cvUrl = existingCv.dataUrl;
        cvName = existingCv.name;
        cvSize = existingCv.size;
      }

      await applyToPosition({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        location: form.location.trim(),
        positionId: position.id,
        highestQualification: form.highestQualification,
        fieldOfStudy: form.fieldOfStudy.trim(),
        experience: form.experience,
        currentRole: form.currentRole.trim(),
        currentCompany: form.currentCompany.trim(),
        skills: form.skills.trim(),
        linkedIn: form.linkedIn.trim(),
        coverNote: form.coverNote.trim(),
        cvFileName: cvName,
        cvDataUrl: cvUrl, // Storage download URL (or a data URL in demo mode)
        cvSize,
        submittedByUid: user?.uid || "",
      });
      close();
      onApplied?.(position);
    } catch (err) {
      console.error(err);
      setSummary(
        ["already-hired", "rejected-here", "has-active-application", "position-closed"].includes(err?.code)
          ? err.message
          : "We couldn't upload your CV or submit the application. Please check your connection and try again."
      );
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setBusy(false);
    }
  };

  // Red outline for an invalid input/select.
  const errCls = (k) =>
    errors[k] ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]/20" : "";

  return (
    <Modal
      open={open}
      onClose={close}
      width={620}
      title={position ? `Apply — ${position.title}` : "Apply"}
      subtitle={position ? `${position.department} · complete the standard application below.` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div ref={topRef} />

        {/* Red summary banner — appears at the top when something's missing */}
        {summary && (
          <div className="flex items-start gap-2 rounded-md border border-[#DC2626]/40 bg-[#FBE9E9] px-3.5 py-3 text-sm font-semibold text-[#B23A2E]">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{summary}</span>
          </div>
        )}

        {/* Autofilled from the candidate's last application (cover note stays fresh). */}
        {lastApp && (
          <div className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 px-3.5 py-3 text-[13px] font-medium text-foreground">
            <Wand2 size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>We filled this in from your last application — just review it, update anything that changed, and add a fresh cover note.</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Fields marked <span className="font-semibold text-[#DC2626]">*</span> are required. LinkedIn and the cover note are optional.
        </p>

        {/* Contact */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.name}>
            <Input value={form.name} onChange={set("name")} placeholder="e.g. Amara Jayasuriya" className={errCls("name")} />
          </Field>
          <Field label="Email" required error={errors.email}>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="name@email.com" className={errCls("email")} />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <Input value={form.phone} onChange={set("phone")} placeholder="+94 7X XXX XXXX" className={errCls("phone")} />
          </Field>
          <Field label="Location" required error={errors.location}>
            <Input value={form.location} onChange={set("location")} placeholder="e.g. Colombo, Sri Lanka" className={errCls("location")} />
          </Field>
        </div>

        {/* Qualifications & experience */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Highest qualification" required error={errors.highestQualification}>
            <Select value={form.highestQualification} onChange={set("highestQualification")} className={errCls("highestQualification")}>
              <option value="">Select…</option>
              {QUALIFICATIONS.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </Select>
          </Field>
          <Field label="Field of study" required error={errors.fieldOfStudy}>
            <Input value={form.fieldOfStudy} onChange={set("fieldOfStudy")} placeholder="e.g. Computer Science" className={errCls("fieldOfStudy")} />
          </Field>
          <Field label="Years of experience" required error={errors.experience}>
            <Select value={form.experience} onChange={set("experience")} className={errCls("experience")}>
              <option value="">Select…</option>
              {EXPERIENCE_RANGES.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </Select>
          </Field>
          <Field label="Current / most recent role" required error={errors.currentRole}>
            <Input value={form.currentRole} onChange={set("currentRole")} placeholder="e.g. Frontend Developer" className={errCls("currentRole")} />
          </Field>
          <Field label="Current / most recent company" required error={errors.currentCompany}>
            <Input value={form.currentCompany} onChange={set("currentCompany")} placeholder="e.g. your current company" className={errCls("currentCompany")} />
          </Field>
          <Field label={<>LinkedIn / portfolio <span className="font-normal text-muted-foreground/60">(optional)</span></>}>
            <Input value={form.linkedIn} onChange={set("linkedIn")} placeholder="https://…" />
          </Field>
        </div>

        <Field label="Key skills" required error={errors.skills}>
          <Input value={form.skills} onChange={set("skills")} placeholder="e.g. React, TypeScript, Figma (comma separated)" className={errCls("skills")} />
        </Field>

        <Field label={<>Cover note <span className="font-normal text-muted-foreground/60">(optional)</span></>}>
          <Textarea rows={3} value={form.coverNote} onChange={set("coverNote")} placeholder="A short note on why you're a good fit." />
        </Field>

        {/* CV upload — mandatory */}
        <div className="space-y-1.5">
          <span className="text-[13px] font-semibold text-foreground">
            Attach your CV <span className="text-[#DC2626]">*</span>
          </span>
          {attachedCv ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText size={18} className="shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{attachedCv.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {attachedCv.size ? humanSize(attachedCv.size) : ""}{attachedCv.carried ? `${attachedCv.size ? " · " : ""}from your last application` : ""}
                  </div>
                </div>
              </div>
              <button onClick={removeCv} className="text-muted-foreground hover:text-foreground" aria-label="Remove CV">
                <X size={16} />
              </button>
            </div>
          ) : (
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-background px-4 py-6 text-center transition-colors hover:border-primary hover:bg-secondary ${
                cvError ? "border-[#DC2626]" : "border-[#C7D2E0]"
              }`}
            >
              <UploadCloud size={22} className="text-primary" />
              <span className="text-sm font-medium text-foreground">Click to upload your CV</span>
              <span className="text-xs text-muted-foreground">PDF, DOC or DOCX · up to {humanSize(MAX_CV_BYTES)}</span>
              <input type="file" accept={ACCEPTED_CV_TYPES} className="hidden" onChange={onFile} />
            </label>
          )}
          {cvError && <p className="text-sm font-medium text-[#DC2626]">{cvError}</p>}
        </div>

        <div className="flex items-start gap-2 rounded-md bg-[#EEF1F5] px-3 py-2.5 text-xs font-medium text-[#64748B] dark:bg-white/[0.05] dark:text-[#94A3B8]">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          Applications are reviewed on qualifications and experience only. We never ask for gender, age, race or religion.
        </div>
      </div>
    </Modal>
  );
}
