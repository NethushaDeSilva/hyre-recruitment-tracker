// The standard CV application form. A candidate provides just enough to get
// started — email, phone, and their CV — and the system is responsible for
// getting everything else (qualifications, experience, skills…) out of the
// CV itself (WS4). No degree dropdown, no experience picker: whatever's on
// the CV is read from the CV, not typed twice.
//
// WS3: the moment a CV is selected, it's scanned (extraction + cheap checks +
// AI classification) before the candidate can submit at all. Submit is only
// ever enabled once that scan has actually PASSED — every other state (idle,
// scanning, failed, an infrastructure error) leaves it disabled, on purpose.
import { useRef, useState, useEffect, useMemo } from "react";
import { UploadCloud, FileText, CheckCircle2, X, AlertCircle, Wand2, Loader2, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { fileToDataUrl, validateCvFile, humanSize, MAX_CV_BYTES, ACCEPTED_CV_TYPES } from "@/lib/file";
import { validateCvContent, parseCvContent, healthCheckCvValidator, joinNicely } from "@/lib/cv-extract";
import { profileToCandidateFields } from "@/lib/cv-profile";
import { applyToPosition, logCvRejection, useHyreData } from "@/data/store";
import { useAuth } from "@/context/AuthContext";
import { isEmail, looksLikeEmail } from "@/lib/validate";
import { checkEmailDomain } from "@/lib/emailDomain";
import { cn } from "@/lib/utils";

const EMPTY = { email: "", phone: "" };

// Every field here is required. Order = the order we list missing fields in
// the red summary.
const REQUIRED = [
  ["email", "Email"],
  ["phone", "Phone number"],
];
// Light phone check: starts with a digit or "+", then at least 6 more digits/
// spaces/parens/hyphens — enough to catch empty or obviously-wrong input
// without policing exact international formats.
const isPhone = (v) => /^[+\d][\d\s().-]{6,}$/.test(v.trim());

// Build the form values from a previous application (or the auth user if none).
const prefillFrom = (app, user) => ({
  email: app?.email || user?.email || "",
  phone: app?.phone || "",
});

export default function ApplyModal({ open, onClose, position, onApplied }) {
  const { user } = useAuth();
  const { candidates } = useHyreData();
  const [form, setForm] = useState({ ...EMPTY, email: user?.email || "" });
  const [cvFile, setCvFile] = useState(null); // a NEWLY chosen File (uploaded on submit)
  const [existingCv, setExistingCv] = useState(null); // { dataUrl, name, size } carried from a previous application
  const [cvError, setCvError] = useState("");
  // WS3 scan state for a NEWLY chosen file only — a carried-over CV from a
  // previous application is treated as already-known-good, never re-scanned.
  const [scanState, setScanState] = useState("idle"); // idle | scanning | passed | failed | error
  const [scanResult, setScanResult] = useState(null);
  const scanTokenRef = useRef(0); // guards against a stale scan overwriting a newer one
  // WS4 — fills in automatically once the scan passes. Never blocks submission:
  // a failed parse just leaves the profile empty, same as before WS4 existed.
  const [parseState, setParseState] = useState("idle"); // idle | parsing | parsed | failed
  const [parsedProfile, setParsedProfile] = useState(null);
  const [nameOverride, setNameOverride] = useState(""); // the one field the candidate can correct
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

  // On open, autofill email/phone + the CV from the last application. Keyed on
  // `open` only, so a background data refresh can't wipe in-progress edits.
  useEffect(() => {
    if (!open) return;
    setForm(prefillFrom(lastApp, user));
    setExistingCv(lastApp?.cvDataUrl ? { dataUrl: lastApp.cvDataUrl, name: lastApp.cvFileName || "CV", size: lastApp.cvSize || 0 } : null);
    setCvFile(null);
    setScanState("idle");
    setScanResult(null);
    setParseState("idle");
    setParsedProfile(null);
    setNameOverride("");
    setErrors({});
    setSummary("");
    setCvError("");
    healthCheckCvValidator(); // console-only diagnostic — never affects the UI, just surfaces a misconfigured/undeployed Worker immediately
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
    setForm({ ...EMPTY, email: user?.email || "" });
    setCvFile(null);
    setExistingCv(null);
    setCvError("");
    setScanState("idle");
    setScanResult(null);
    setParseState("idle");
    setParsedProfile(null);
    setNameOverride("");
    setErrors({});
    setSummary("");
    onClose();
  };

  // Runs the WS3 pipeline on a freshly chosen file. Never throws — see
  // cv-extract.js's contract. A token guards against a scan for a file the
  // candidate has since replaced from overwriting the newer one's result.
  const runScan = async (file) => {
    const token = ++scanTokenRef.current;
    setScanState("scanning");
    setScanResult(null);
    setParseState("idle");
    setParsedProfile(null);
    const result = await validateCvContent(file);
    if (scanTokenRef.current !== token) return; // superseded by a newer file
    setScanResult(result);
    setScanState(result.outcome === "passed" ? "passed" : result.outcome === "blocked" ? "failed" : "error");
    if (result.outcome === "blocked") {
      logCvRejection({
        reason: result.reason,
        stage: result.stage,
        confidence: result.confidence,
        missingSections: result.missingSections,
        fileName: file.name,
        fileSize: file.size,
        positionId: position?.id,
        submittedByUid: user?.uid || "",
      }).catch((err) => console.error("logCvRejection:", err)); // demo evidence only — never blocks the UI
    }
    // WS4 — fill the profile in from the SAME extracted text, once validation has
    // passed. A parse failure never blocks or un-passes the scan above; the
    // candidate can still submit, they just won't have a filled-in profile yet.
    if (result.outcome === "passed") {
      setParseState("parsing");
      const profile = await parseCvContent(result.text);
      if (scanTokenRef.current !== token) return;
      if (profile) {
        setParsedProfile(profile);
        setNameOverride(profile.fullName || "");
        setParseState("parsed");
      } else {
        setParseState("failed");
      }
    }
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setCvError("");
    setSummary("");
    try {
      validateCvFile(file); // check type + size up front — content scan only runs after this passes
      setCvFile(file);
      setExistingCv(null); // a fresh upload replaces the carried-over CV
      runScan(file); // fire-and-forget — scanState/scanResult drive the UI
    } catch (err) {
      setCvFile(null);
      setCvError(err.message);
      // Not currently reachable as a submit-gating bug (cvReady already falls
      // to !!existingCv when cvFile is null), but leaving a stale "passed"
      // sitting unused in state is exactly the kind of thing that turns into
      // a real bug the next time this logic changes — clear it here too.
      setScanState("idle");
      setScanResult(null);
      setParseState("idle");
      setParsedProfile(null);
    }
  };

  const removeCv = () => {
    setCvFile(null);
    setExistingCv(null);
    setScanState("idle");
    setScanResult(null);
    setParseState("idle");
    setParsedProfile(null);
    setNameOverride("");
  };
  // What CV is currently attached (a new upload OR the one carried from last time).
  const attachedCv = cvFile
    ? { name: cvFile.name, size: cvFile.size, carried: false }
    : existingCv
    ? { name: existingCv.name, size: existingCv.size, carried: true }
    : null;

  // Submit is ready ONLY when: a freshly chosen file has actually PASSED its
  // scan AND its WS4 profile parse has settled, OR there's no new file and a
  // carried-over CV is in use. Idle, scanning, failed and errored all fall
  // through to "not ready" — the default is blocked, never allowed.
  //
  // parseState is part of this because the profile spread in submit() is
  // guarded on `parsedProfile` being present. Validation passing and the
  // profile parse finishing are TWO separate model calls, and the parse takes
  // several seconds longer — so submitting in that window silently dropped
  // the entire parsed profile AND the extracted CV text, writing an identity
  // with no name/skills/education/text at all. That candidate still scores
  // afterwards, as a clean 0/100 with every required skill "missing", so they
  // read as unqualified rather than unprocessed. Found live 2026-09-24.
  // A parse that genuinely FAILED must never block (that was always allowed
  // by design — the candidate just gets an empty profile); only one still in
  // flight does.
  const cvReady = cvFile ? scanState === "passed" && parseState !== "parsing" : !!existingCv;

  // Returns { fieldErrors, cvMessage } — empty when the form is valid.
  const validate = () => {
    const fieldErrors = {};
    for (const [key, label] of REQUIRED) {
      if (!String(form[key]).trim()) fieldErrors[key] = `${label} is required.`;
    }
    if (!fieldErrors.email && !isEmail(form.email.trim())) {
      fieldErrors.email = "Enter a valid email address.";
    }
    if (!fieldErrors.phone && !isPhone(form.phone)) {
      fieldErrors.phone = "Enter a valid phone number.";
    }
    // The one field the candidate can hand-edit (pre-filled from their CV) —
    // catch it if it ends up looking like an email rather than a name, the
    // same failure this field's autofill could otherwise let through.
    if (nameOverride.trim() && looksLikeEmail(nameOverride.trim())) {
      fieldErrors.nameOverride = "That looks like an email address, not a name.";
    }
    const cvMessage = cvReady
      ? ""
      : cvFile && scanState === "passed" && parseState === "parsing"
      ? "We're still reading your CV — this takes a few seconds. Please try again in a moment."
      : "Please attach a CV that passes the scan above before continuing.";
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
      if (fieldErrors.nameOverride) names.push("your full name");
      if (cvMessage) names.push("a validated CV");
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

    // Signup email validation, layer 1 — this typed email, not the account
    // email, is the address everything downstream (notifications, interview
    // invites) actually uses, so it gets the same domain check as signup.
    // Fails open on our own infra trouble; the only reject is an explicit
    // deliverable:false.
    const domainCheck = await checkEmailDomain(form.email.trim());
    if (domainCheck.deliverable === false) {
      setBusy(false);
      const msg = "This email domain cannot receive mail. Please check the address.";
      setErrors((er) => ({ ...er, email: msg }));
      setSummary(msg);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    try {
      // Use a freshly chosen file if there is one; otherwise reuse the CV
      // carried over from the candidate's previous application (already a
      // stored URL — no re-upload needed). This only ever runs once the scan
      // above has passed — a rejected file is never uploaded, so nothing is
      // ever left orphaned.
      //
      // TEMPORARY (as of 2026-09-12): Firebase Storage requires the project
      // to be on the Blaze plan just to provision a bucket at all — a Google
      // policy change, not something this codebase controls — and Blaze
      // isn't enabled here (no billing on this project). Every CV upload
      // falls back to the legacy base64-in-Firestore path (fileToDataUrl)
      // that already existed for pre-Storage candidates, with MAX_CV_BYTES
      // lowered accordingly (see file.js). Swap the branch below back to
      // uploadCv() once Storage is provisioned — nothing downstream of this
      // (Firestore writes, CandidateDetailModal's open/download, etc.) needs
      // to change either way, since both paths already produce a URL string.
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

      // WS4 — the profile parsed from this CV, if parsing succeeded this session.
      // A failed/skipped parse just contributes nothing here; the candidate's
      // profile stays empty rather than ever being guessed at.
      const typedEmail = form.email.trim().toLowerCase();
      const cvEmail = (parsedProfile?.email || "").trim().toLowerCase();
      const emailMismatch = !!(cvEmail && cvEmail !== typedEmail);

      // WS5 — NOT scored here. applicationScores is deliberately staff-write-only
      // (R3 — a candidate must never be able to forge their own match score,
      // and Firestore has no way to allow a write but not a read on the same
      // collection), so a candidate's own session can never durably write a
      // score no matter how it's computed — found live 2026-09-12: every
      // self-application to a position with requirements failed outright here.
      // Scoring happens staff-side instead: HR's "Re-score all" on the
      // shortlist (rescoreVacancy(), already staff-authenticated) picks up
      // every unscored application, including this one, the moment HR opens it.

      await applyToPosition({
        email: form.email.trim(),
        phone: form.phone.trim(),
        positionId: position.id,
        cvFileName: cvName,
        cvDataUrl: cvUrl, // Storage download URL (or a carried-over legacy data URL)
        cvSize,
        submittedByUid: user?.uid || "",
        // Only set when a fresh file was actually scanned this session — a
        // carried-over CV isn't re-flagged one way or the other.
        ...(cvFile && scanResult
          ? {
              needsReview: !!scanResult.needsReview,
              cvValidation: { confidence: scanResult.confidence ?? null, reason: scanResult.reason || "", checkedAt: Date.now() },
              // 5.9 — whether the Worker had to truncate this CV before the
              // model saw it. Surfaced to HR (CandidateDetailModal) so a long
              // CV never silently loses detail with no record of it.
              cvTruncation: { applied: !!scanResult.truncationApplied, strategy: scanResult.truncationStrategy || null },
            }
          : {}),
        // The extracted CV text is kept whenever the scan produced any, even
        // if the profile parse below didn't produce a profile. It's what WS5's
        // verification layer grounds matched skills against, and what HR reads
        // when a profile looks thin — it used to sit INSIDE the parsedProfile
        // guard and was thrown away along with everything else whenever
        // parsing didn't return one, leaving nothing to fall back on.
        ...(cvFile && scanResult?.text ? { cvExtractedText: scanResult.text } : {}),
        ...(cvFile && parsedProfile
          ? {
              ...profileToCandidateFields(parsedProfile),
              name: nameOverride.trim(), // the one field the candidate could correct in the confirmation step
              ...(emailMismatch ? { emailFromCv: parsedProfile.email, emailMismatch: true } : {}),
            }
          : {}),
      });
      close();
      onApplied?.(position);
    } catch (err) {
      console.error(err);
      setSummary(
        ["already-hired", "rejected-here", "already-applied-here", "position-closed"].includes(err?.code)
          ? err.message
          : "We couldn't upload your CV or submit the application. Please check your connection and try again."
      );
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setBusy(false);
    }
  };

  // Red outline for an invalid input.
  const errCls = (k) =>
    errors[k] ? "border-destructive focus:border-destructive focus:ring-destructive/20" : "";

  return (
    <Modal
      open={open}
      onClose={close}
      width={480}
      title={position ? `Apply — ${position.title}` : "Apply"}
      subtitle={position ? `${position.department} · just your contact details and your CV.` : ""}
      footer={
        <>
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !cvReady}>
            {busy ? "Submitting…" : cvFile && scanState === "passed" && parseState === "parsing" ? "Reading your CV…" : "Submit application"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div ref={topRef} />

        {/* Red summary banner — appears at the top when something's missing */}
        {summary && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm font-semibold text-destructive">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{summary}</span>
          </div>
        )}

        {/* Autofilled from the candidate's last application. */}
        {lastApp && (
          <div className="flex items-start gap-2 rounded-md border border-primary/25 bg-primary/5 px-3.5 py-3 text-[13px] font-medium text-foreground">
            <Wand2 size={16} className="mt-0.5 shrink-0 text-primary" />
            <span>We filled this in from your last application — just review it and update anything that changed.</span>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          We read your qualifications, experience and skills from your CV — you don't need to type them.
        </p>

        {/* Contact */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Email" required error={errors.email}>
            <Input type="email" value={form.email} onChange={set("email")} placeholder="name@email.com" autoComplete="email" className={errCls("email")} />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <Input value={form.phone} onChange={set("phone")} placeholder="+94 7X XXX XXXX" autoComplete="tel" className={errCls("phone")} />
          </Field>
        </div>

        {/* CV upload — mandatory, gated behind an automatic content scan */}
        <div className="space-y-1.5">
          <span className="text-[13px] font-semibold text-foreground">
            Attach your CV <span className="text-destructive">*</span>
          </span>

          {!cvFile && !existingCv ? (
            // IDLE — nothing selected yet.
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed bg-background px-4 py-6 text-center transition-colors hover:border-primary hover:bg-secondary",
                cvError ? "border-destructive" : "border-[#C7D2E0]"
              )}
            >
              <UploadCloud size={22} className="text-primary" />
              <span className="text-sm font-medium text-foreground">Click to upload your CV</span>
              <span className="text-xs text-muted-foreground">PDF, DOC or DOCX · up to {humanSize(MAX_CV_BYTES)}</span>
              <input type="file" accept={ACCEPTED_CV_TYPES} className="hidden" onChange={onFile} />
            </label>
          ) : existingCv && !cvFile ? (
            // Carried over from a previous application — already known-good, not re-scanned.
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <FileText size={18} className="shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{attachedCv.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {attachedCv.size ? `${humanSize(attachedCv.size)} · ` : ""}from your last application
                  </div>
                </div>
              </div>
              <button onClick={removeCv} className="text-muted-foreground hover:text-foreground" aria-label="Remove CV">
                <X size={16} />
              </button>
            </div>
          ) : (
            // A freshly chosen file — its box border/status reflect scanState.
            <div aria-busy={scanState === "scanning"} className={cn("rounded-md", scanState === "scanning" && "cv-scan-border")}>
              <div
                className={cn(
                  "space-y-2 rounded-md border bg-background px-3.5 py-2.5",
                  scanState === "passed" && "border-stage-hired",
                  scanState === "failed" && "border-destructive",
                  scanState === "scanning" && "border-transparent"
                  // "error" keeps the plain default border — deliberately not red or green
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FileText size={18} className="shrink-0 text-primary" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">{cvFile.name}</div>
                      <div className="text-xs text-muted-foreground">{humanSize(cvFile.size)}</div>
                    </div>
                  </div>
                  <label className="shrink-0 cursor-pointer text-xs font-semibold text-primary hover:underline">
                    Replace
                    <input type="file" accept={ACCEPTED_CV_TYPES} className="hidden" onChange={onFile} />
                  </label>
                </div>

                {/* aria-live so a screen reader announces every state change */}
                <div aria-live="polite">
                  {scanState === "scanning" && (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
                      <Loader2 size={14} className="animate-spin" /> Scanning your CV…
                    </span>
                  )}
                  {scanState === "passed" && (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-stage-hired">
                      <CheckCircle2 size={14} />
                      {scanResult?.needsReview
                        ? "We've flagged this for a quick recruiter review, but you're all set."
                        : "Looks good — this reads like a CV."}
                    </span>
                  )}
                  {scanState === "failed" && scanResult && (
                    <div className="space-y-1 text-[13px]">
                      <p className="font-semibold text-destructive">
                        {scanResult.missingSections?.length
                          ? `We couldn't find: ${joinNicely(scanResult.missingSections)}.`
                          : scanResult.reason}
                      </p>
                      <p className="text-muted-foreground">Please upload your CV as a PDF or Word document, then replace the file above.</p>
                    </div>
                  )}
                  {scanState === "error" && (
                    <div className="space-y-1.5 text-[13px]">
                      <p className="font-medium text-foreground">We couldn't check your CV right now — this is on our end, not your file.</p>
                      <button
                        type="button"
                        onClick={() => runScan(cvFile)}
                        className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                      >
                        <RotateCcw size={13} /> Try again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {cvError && <p className="text-sm font-medium text-destructive">{cvError}</p>}
        </div>

        {/* WS4 — filled in automatically once the scan above passes. Never blocks
            submission: a parse failure just leaves the profile empty, same as
            before this existed. */}
        {cvFile && parseState !== "idle" && (
          <div className="space-y-2.5 rounded-md border border-border bg-background px-3.5 py-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              <Wand2 size={14} className="text-primary" /> Here's what we read from your CV
            </div>
            {parseState === "parsing" && (
              <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Reading your qualifications and experience…
              </span>
            )}
            {parseState === "failed" && (
              <p className="text-[13px] text-muted-foreground">
                We couldn't automatically read your details this time — no problem, you can still submit and a recruiter can fill these in.
              </p>
            )}
            {parseState === "parsed" && parsedProfile && (
              <div className="space-y-2.5">
                <Field label="Full name" error={errors.nameOverride}>
                  <Input
                    value={nameOverride}
                    onChange={(e) => {
                      setNameOverride(e.target.value);
                      setErrors((er) => (er.nameOverride ? { ...er, nameOverride: "" } : er));
                    }}
                    placeholder="Your full name"
                    autoComplete="name"
                    className={errCls("nameOverride")}
                  />
                </Field>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {parsedProfile.education?.[0]?.awardType && (
                    <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">
                      {parsedProfile.education[0].awardType}{parsedProfile.education[0].field ? ` in ${parsedProfile.education[0].field}` : ""}
                    </span>
                  )}
                  {parsedProfile.totalYearsExperience > 0 && (
                    <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">{parsedProfile.totalYearsExperience} yrs experience</span>
                  )}
                  {parsedProfile.skills?.length > 0 && (
                    <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">
                      {parsedProfile.skills.slice(0, 4).join(", ")}{parsedProfile.skills.length > 4 ? "…" : ""}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">This is a review, not a form — fix your name above if we got it wrong, then submit.</p>
              </div>
            )}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md bg-[#EEF1F5] px-3 py-2.5 text-xs font-medium text-[#64748B] dark:bg-white/[0.05] dark:text-[#94A3B8]">
          <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
          Applications are reviewed on qualifications and experience only. We never ask for gender, age, race or religion.
        </div>
      </div>
    </Modal>
  );
}
