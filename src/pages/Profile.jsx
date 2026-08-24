// Profile — every signed-in user (any role) can change their display name,
// avatar colour, and upload a profile picture. Saves to their Firestore profile.
// Candidates also see their own read-only Candidate ID here — it's their core
// identifier across Hyre (the same CAND-#### recruiters see in the candidates table).
import { useState, useMemo } from "react";
import { Upload, Trash2, Check, Fingerprint, Copy, BadgeCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useHyreData } from "@/data/store";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { fileToDataUrl } from "@/lib/image";

const COLORS = ["#1F3A5F", "#2563EB", "#4F46E5", "#E0A422", "#16A34A", "#DC2626", "#0EA5E9", "#DB2777", "#64748B"];

// Numeric part of a CAND-#### id (0 if none), so we can pick a person's FIRST id.
const candNum = (s) => parseInt(String(s || "").replace(/\D/g, ""), 10) || 0;

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const { candidates } = useHyreData();
  const [name, setName] = useState(user?.name || "");
  const [color, setColor] = useState(user?.avatarColor || "#1F3A5F");
  const [photo, setPhoto] = useState(user?.photoURL || "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // All of this person's own candidate rows (a person may apply more than once).
  const isCandidate = user?.role === "Candidate";
  const myRows = useMemo(() => {
    if (!isCandidate) return [];
    const uid = user?.uid;
    const email = (user?.email || "").toLowerCase();
    return (candidates || []).filter(
      (c) => (uid && c.submittedByUid === uid) || (email && (c.email || "").toLowerCase() === email)
    );
  }, [candidates, isCandidate, user?.uid, user?.email]);

  // Canonical candidate ID = the FIRST (lowest-numbered) one they were issued.
  const myCandidateId = useMemo(() => {
    const withId = myRows.filter((c) => c.candidateId);
    if (!withId.length) return "";
    return withId.sort((a, b) => candNum(a.candidateId) - candNum(b.candidateId))[0].candidateId;
  }, [myRows]);

  // If they've been HIRED anywhere, they're now an employee — surface that row
  // (its employee ID, role and department become their primary identity). If they
  // were promoted (more than one hire on record), the MOST RECENT one wins, so a
  // leftover old-role record can never show the wrong current role.
  const hire = useMemo(() => {
    const hired = myRows.filter((c) => c.stage === "hired");
    if (!hired.length) return null;
    return hired.slice().sort((a, b) => (b.hiredAt || 0) - (a.hiredAt || 0))[0];
  }, [myRows]);
  const employeeId = hire?.employeeId || "";

  const copyText = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setPhoto(await fileToDataUrl(f));
    } catch {
      /* ignore bad image */
    }
    e.target.value = ""; // allow re-selecting the same file
  };

  const save = async () => {
    setBusy(true);
    await updateProfile({ name: name.trim() || user.name, avatarColor: color, photoURL: photo });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Your profile</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Update how you appear across Hyre.</p>

      <div className="mt-6 max-w-2xl space-y-6 rounded-lg border border-[#E9EEF4] bg-card p-6 shadow-card">
        {/* photo */}
        <div className="flex items-center gap-5">
          <Avatar name={name || "User"} color={color} src={photo} size={80} />
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
                <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-background">
                  <Upload size={15} /> Upload photo
                </span>
              </label>
              {photo && (
                <button
                  onClick={() => setPhoto("")}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3.5 py-2 text-sm font-semibold text-[#DC2626] transition-colors hover:bg-background"
                >
                  <Trash2 size={15} /> Remove
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG or JPG — we resize it for you, so file size doesn't matter.</p>
          </div>
        </div>

        {/* identity card — candidates only. Once HIRED, the employee ID takes over
            as the primary identity (green); the candidate ID drops to a footnote. */}
        {isCandidate && employeeId && (
          <div className="rounded-lg border border-[#16A34A]/40 bg-[#16A34A]/10 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <BadgeCheck size={15} className="text-[#16A34A]" /> Your employee ID
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-lg font-bold tracking-tight text-foreground">{employeeId}</span>
              <button
                type="button"
                onClick={() => copyText(employeeId)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-background"
              >
                {copied ? <><Check size={13} className="text-[#16A34A]" /> Copied</> : <><Copy size={13} /> Copy</>}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              You've been hired as <span className="font-semibold text-foreground">{hire?.employeeRole || "—"}</span>
              {hire?.employeeDept ? <> in <span className="font-semibold text-foreground">{hire.employeeDept}</span></> : null}.
              Your ID combines the department code, your job role, and your employee number.
              {myCandidateId ? <> Former candidate ID: <span className="font-mono">{myCandidateId}</span>.</> : null}
            </p>
          </div>
        )}

        {/* candidate ID — shown while still an applicant (not yet hired) */}
        {isCandidate && !employeeId && (
          <div className="rounded-lg border border-[#E0A422]/45 bg-[#E0A422]/10 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Fingerprint size={15} className="text-[#B4791A]" /> Your candidate ID
            </div>
            {myCandidateId ? (
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-lg font-bold tracking-tight text-foreground">{myCandidateId}</span>
                <button
                  type="button"
                  onClick={() => copyText(myCandidateId)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-background"
                >
                  {copied ? <><Check size={13} className="text-[#16A34A]" /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Assigned automatically the moment you submit your first application.
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              This is your unique ID across Hyre — recruiters see the same number. When you're hired this becomes an employee ID.
            </p>
          </div>
        )}

        {/* staff USER ID — HR / Interviewer / Management each carry a readable User
            ID (a system-account id, SEPARATE from an employee ID). The users doc
            stays keyed by the auth uid; this is a field on it. */}
        {!isCandidate && (
          <div className="rounded-lg border border-[#4F46E5]/30 bg-[#4F46E5]/[0.07] p-4 dark:border-[#4F46E5]/40 dark:bg-[#4F46E5]/10">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Fingerprint size={15} className="text-[#4F46E5] dark:text-[#A5B4FC]" /> Your User ID
            </div>
            {user?.userId ? (
              <div className="mt-2 flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-lg font-bold tracking-tight text-foreground">{user.userId}</span>
                <button
                  type="button"
                  onClick={() => copyText(user.userId)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:bg-background"
                >
                  {copied ? <><Check size={13} className="text-[#16A34A]" /> Copied</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your User ID is being issued — it'll appear here in a moment (refresh if not).
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Your unique account ID across Hyre as {user?.title} · {user?.role}. It identifies you as a system user — separate from any employee ID.
            </p>
          </div>
        )}

        {/* name */}
        <Field label="Display name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </Field>

        {/* role + email (read-only) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-[13px] font-semibold text-foreground">Role</div>
            <div className="mt-1.5 rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
              {employeeId ? <>Employee · {hire?.employeeRole || user?.title}</> : <>{user?.title} · {user?.role}</>}
            </div>
          </div>
          <div>
            <div className="text-[13px] font-semibold text-foreground">Email</div>
            <div className="mt-1.5 truncate rounded-md border border-border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
              {user?.email}
            </div>
          </div>
        </div>

        {/* avatar colour */}
        <div>
          <div className="text-[13px] font-semibold text-foreground">Avatar colour</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 transition-transform hover:scale-105"
                style={{ background: c }}
                aria-label={`Colour ${c}`}
              >
                {color === c && <Check size={16} strokeWidth={3} className="text-white" />}
              </button>
            ))}
          </div>
          {photo && <p className="mt-2 text-xs text-muted-foreground">Your colour shows when no photo is set.</p>}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-[#16A34A]">
              <Check size={16} /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
