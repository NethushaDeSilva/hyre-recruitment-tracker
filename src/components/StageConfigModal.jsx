// Configure the interview pipeline for a vacancy — a STEP-BY-STEP wizard.
//
//  Step 0  "Pipeline"     — choose the stages. Applied + Hired are locked
//                           bookends; the middle stages can be renamed,
//                           reordered, removed, or added (built-in or custom).
//  Step 1..N "Assign"     — one screen PER stage. Management sees only that
//                           stage's eligible people and ticks the TEAM who will
//                           run it (multi-select checkboxes, with title +
//                           assignment count). Proceed moves to the next stage.
//
// Assignment is Management-only; HR can edit the pipeline structure but only sees
// step 0. A candidate in a custom stage is actioned by Management (deployed rules
// treat unknown stages as management-only) — per-role custom stages are Sprint 2.
import { useState, useEffect, useMemo } from "react";
import { Lock, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/firebase/config";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { STAGES, CONFIGURABLE_STAGES } from "@/lib/stages";
import { ROLES, ROLE_LABELS, can } from "@/lib/permissions";
import { ROLE_USERS, cleanTitle } from "@/context/auth-config";
import { savePipeline, useHyreData, subscribeInterviewBookings, getAvailabilityRecords } from "@/data/store";
import { useAuth } from "@/context/AuthContext";

import AssignStep from "./StageAssignmentStep";
import { BOOKED_STATUSES } from "@/lib/interviewSchedule";

const ADDABLE_BUILTIN = [...CONFIGURABLE_STAGES, "hold"];
const CUSTOM_PALETTE = [
  { dot: "#0D9488", badgeBg: "#CCFBF1", badgeFg: "#0F766E" },
  { dot: "#DB2777", badgeBg: "#FCE7F3", badgeFg: "#BE185D" },
  { dot: "#D97706", badgeBg: "#FEF3C7", badgeFg: "#B45309" },
  { dot: "#7C3AED", badgeBg: "#EDE9FE", badgeFg: "#6D28D9" },
  { dot: "#0EA5E9", badgeBg: "#E0F2FE", badgeFg: "#0369A1" },
];
function toRows(position) {
  const meta = position?.stageMeta || {};
  return (position?.stages || [])
    .filter((id) => id !== "applied" && id !== "hired")
    .map((id) => {
      const custom = !STAGES[id];
      const base = STAGES[id];
      return {
        id,
        custom,
        label: meta[id]?.label || base?.label || id,
        owner: custom ? ROLES.MANAGEMENT : base?.owner || ROLES.MANAGEMENT,
        color: custom ? { dot: meta[id]?.dot, badgeBg: meta[id]?.badgeBg, badgeFg: meta[id]?.badgeFg } : null,
      };
    });
}

export default function StageConfigModal({ open, position, onClose }) {
  const { user } = useAuth();
  const { positions, candidates } = useHyreData();
  const canAssign = can(user?.role, "manageStages"); // HR configures + assigns teams
  // Recruitment has "started" once any candidate has moved beyond Applied. From
  // that point the STAGE STRUCTURE is frozen (you can't add/remove/rename/reorder
  // stages mid-recruitment) — but the assigned team can still be changed.
  const started = useMemo(
    () => candidates.some((c) => c.positionId === position?.id && !["applied", "rejected"].includes(c.stage)),
    [candidates, position?.id]
  );
  const [step, setStep] = useState(0); // 0 = pipeline; 1..N = assign rows[step-1]
  const [rows, setRows] = useState([]);
  const [assign, setAssign] = useState({}); // stageId -> [{uid,name,role,title}]
  const [savedAssign, setSavedAssign] = useState({});
  const [personSlots, setPersonSlots] = useState({}); // stageId -> { uid -> {scheduledAt, durationMs} }
  const [availabilityByUid, setAvailabilityByUid] = useState({});
  const [bookings, setBookings] = useState([]);
  const [bookingError, setBookingError] = useState("");
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  // Initialise the editor ONLY when the modal opens (open flips false→true).
  // We deliberately do NOT depend on `position`: the store rebuilds every position
  // object on each Firestore snapshot, so a background snapshot during editing
  // would otherwise re-run this and wipe the user's in-progress picks, silently
  // reverting to the last-saved team. Snapshotting once at open time keeps the
  // edits stable until Save.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setRows(toRows(position));
    // normalise assignees to arrays (older data stored a single object)
    const src = position?.stageAssignees || {};
    const norm = {};
    for (const [k, v] of Object.entries(src)) norm[k] = Array.isArray(v) ? v : v ? [v] : [];
    setAssign(norm);
    setSavedAssign(norm);
    setPersonSlots({});
    setSaveStatus("");
    setSaveError("");
    setAdding(false);
    setNewLabel("");
    setQ("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load the staff directory (users collection is staff-only) for assignment.
  useEffect(() => {
    if (!open || !canAssign) return;
    let alive = true;
    setStaffError("");
    (async () => {
      if (firebaseReady) {
        setStaffLoading(true);
        try {
          const snap = await getDocs(collection(db, "users"));
          const raw = snap.docs
            .map((d) => {
              const x = d.data();
              return { uid: d.id, name: x.displayName || x.email || "Team member", role: x.role, title: cleanTitle(x.role, x.title), email: x.email || "" };
            })
            // staff only. Demo (@hyre.app) accounts are treated as NORMAL people —
            // they show in the picker and can be assigned/removed like anyone else.
            // (They're never auto-pinned to a stage; they only appear on a stage if
            // explicitly ticked.) They used to be hidden, which turned a demo person
            // already saved on a stage into an unremovable "ghost".
            .filter((u) => [ROLES.HR, ROLES.INTERVIEWER, ROLES.MANAGEMENT].includes(u.role));
          // Safety net: collapse any remaining same-name people within a role so a
          // person can never show twice (one with fewer assignments, one with more).
          const seen = new Set();
          const list = [];
          for (const u of raw) {
            const key = `${u.role}::${u.name.trim().toLowerCase()}`;
            if (seen.has(key)) continue;
            seen.add(key);
            list.push(u);
          }
          if (!alive) return;
          setStaff(list);
          if (list.length === 0) setStaffError("No staff found. Run scripts/seed-staff.mjs to add people.");
        } catch (e) {
          console.error("staff load:", e);
          if (alive) setStaffError(`Couldn't load staff: ${e.code || e.message}`);
        } finally {
          if (alive) setStaffLoading(false);
        }
      } else {
        setStaff([
          { uid: "hr", name: ROLE_USERS.HR.name, role: ROLES.HR, title: ROLE_USERS.HR.title },
          { uid: "int", name: ROLE_USERS.Interviewer.name, role: ROLES.INTERVIEWER, title: ROLE_USERS.Interviewer.title },
          { uid: "mgmt", name: ROLE_USERS.Management.name, role: ROLES.MANAGEMENT, title: ROLE_USERS.Management.title },
        ]);
      }
    })();
    return () => { alive = false; };
  }, [open, canAssign]);

  useEffect(() => {
    if (!open) return;
    setBookingsLoading(true);
    setBookingError("");
    return subscribeInterviewBookings((list) => { setBookings(list); setBookingsLoading(false); }, (error) => {
      setBookingError(`Couldn't check bookings: ${error.message}`);
      setBookingsLoading(false);
    });
  }, [open]);

  // Real declared availability for the whole staff directory, fetched once the
  // roster is known — the assignment step's per-person "available times"
  // dropdown reads from this rather than making its own Firestore call per row.
  useEffect(() => {
    if (!open || !staff.length) return;
    let alive = true;
    getAvailabilityRecords(staff.map((s) => s.uid)).then((records) => { if (alive) setAvailabilityByUid(records); });
    return () => { alive = false; };
  }, [open, staff]);

  // --- structure editing (step 0) ---
  const move = (i, dir) => setRows((prev) => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const rename = (id, label) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label } : r)));
  const remove = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setAssign((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };
  const addBuiltin = (id) => setRows((prev) => (prev.some((r) => r.id === id) ? prev : [...prev, { id, custom: false, label: STAGES[id].label, owner: STAGES[id].owner, color: null }]));
  const addCustom = () => {
    const label = newLabel.trim();
    if (!label) return;
    const id = `custom_${Date.now().toString(36)}${rows.length}`;
    const color = CUSTOM_PALETTE[rows.filter((r) => r.custom).length % CUSTOM_PALETTE.length];
    setRows((prev) => [...prev, { id, custom: true, label, owner: ROLES.MANAGEMENT, color }]);
    setNewLabel("");
    setAdding(false);
  };

  // --- assignment (steps 1..N) ---
  const toggle = (stageId, person) => setAssign((prev) => {
    const list = prev[stageId] ? [...prev[stageId]] : [];
    const i = list.findIndex((x) => x.uid === person.uid);
    if (i >= 0) list.splice(i, 1);
    else {
      list.push({ uid: person.uid, name: person.name, role: person.role, title: person.title || "", email: person.email || "" });
    }
    return { ...prev, [stageId]: list };
  });
  const setMany = (stageId, people) => setAssign((prev) => ({ ...prev, [stageId]: people.map((p) => ({ uid: p.uid, name: p.name, role: p.role, title: p.title || "", email: p.email || "" })) }));

  // Booking a specific person's real available window as their interview
  // slot for this stage — replaces the old manual "Book a time slot" typed
  // date/time, which applied one slot to the whole team. Only one pending
  // window per person per stage; picking a new one replaces the old pick.
  const setPersonSlot = (stageId, person, window) =>
    setPersonSlots((prev) => ({ ...prev, [stageId]: { ...prev[stageId], [person.uid]: window } }));
  const clearPersonSlot = (stageId, uid) =>
    setPersonSlots((prev) => {
      const next = { ...(prev[stageId] || {}) };
      delete next[uid];
      return { ...prev, [stageId]: next };
    });

  const save = async () => {
    setBusy(true);
    setSaveStatus("");
    setSaveError("");
    try {
      const stages = ["applied", ...rows.map((r) => r.id), "hired"];
      const stageMeta = {};
      for (const r of rows) {
        if (r.custom) stageMeta[r.id] = { label: r.label, owner: r.owner, dot: r.color?.dot, badgeBg: r.color?.badgeBg, badgeFg: r.color?.badgeFg };
        else if (r.label && r.label !== STAGES[r.id]?.label) stageMeta[r.id] = { label: r.label };
      }
      const ids = new Set(rows.map((r) => r.id));
      const stageAssignees = {};
      for (const [id, list] of Object.entries(assign)) if (ids.has(id) && list?.length) stageAssignees[id] = list;

      const pendingCount = rows.reduce((n, r) => n + Object.keys(personSlots[r.id] || {}).length, 0);
      if (pendingCount && (bookingsLoading || bookingError)) throw new Error("Wait until bookings can be checked before saving an interview slot.");
      const stageSlots = rows.flatMap((r) => Object.entries(personSlots[r.id] || {}).flatMap(([uid, window]) => {
        // Already a real, persisted booking for this exact person/stage/time — nothing new to write.
        const persisted = bookings.some((b) => b.positionId === position.id && b.stageId === r.id
          && b.interviewerId === uid && b.scheduledAt === window.scheduledAt && BOOKED_STATUSES.includes(b.status));
        if (persisted) return [];
        const person = (assign[r.id] || []).find((p) => p.uid === uid) || staff.find((s) => s.uid === uid);
        return [{ stageId: r.id, stageLabel: r.label, interviewerId: uid, interviewerName: person?.name || "", scheduledAt: window.scheduledAt, durationMs: window.durationMs }];
      }));

      await savePipeline(position.id, { stages, stageMeta, stageAssignees, stageSlots, actor: user });
      setSavedAssign(stageAssignees);
      setSaveStatus(stageSlots.length ? "Assignments and interview slots saved." : "Assignments saved.");
    } catch (error) { setSaveError(error.message || "Couldn't save assignments. Please try again."); }
    finally { setBusy(false); }
  };

  const assignable = canAssign ? rows : [];
  const lastStep = assignable.length; // step index of the final assignment screen (0 if none)
  const current = step > 0 ? assignable[step - 1] : null;
  const availableBuiltin = ADDABLE_BUILTIN.filter((id) => !rows.some((r) => r.id === id));
  const goTo = (s) => { if (busy) return; setQ(""); setStep(Math.max(0, Math.min(s, lastStep))); };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      width={880}
      title="Configure interview stages"
      subtitle={position ? position.title : ""}
      stickyFooter
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>{step > 0 && <Button variant="ghost" onClick={() => goTo(step - 1)}><ArrowLeft size={15} /> Back</Button>}</div>
          <div className="flex items-center gap-2">
            {step < lastStep && <Button onClick={() => goTo(step + 1)}>{step === 0 ? "Assign people" : "Proceed"} <ChevronRight size={15} /></Button>}
          </div>
        </div>
      }
    >
      <fieldset disabled={busy} className="min-w-0" onChange={() => setSaveStatus("")}>
      {/* progress breadcrumb */}
      {canAssign && assignable.length > 0 && (
        <div className="mb-2 flex items-center gap-1 overflow-x-auto pb-1">
          <StepChip active={step === 0} done={step > 0} onClick={() => goTo(0)}>Stages</StepChip>
          {assignable.map((r, i) => (
            <span key={r.id} className="flex items-center gap-1">
              <ChevronRight size={13} className="shrink-0 text-[#CBD5E1]" />
              <StepChip active={step === i + 1} done={step > i + 1} onClick={() => goTo(i + 1)}>{r.label}</StepChip>
            </span>
          ))}
        </div>
      )}
      {(saveStatus || saveError) && (
        <p role={saveError ? "alert" : "status"} className={`mb-3 text-sm font-medium ${saveError ? "text-[#DC2626]" : "text-[#15803D]"}`}>
          {saveError || saveStatus}
        </p>
      )}

      {step === 0 ? (
        <PipelineStep
          rows={rows} assign={assign} move={move} rename={rename} remove={remove}
          adding={adding} setAdding={setAdding} newLabel={newLabel} setNewLabel={setNewLabel}
          addCustom={addCustom} addBuiltin={addBuiltin} availableBuiltin={availableBuiltin} canAssign={canAssign}
          locked={started} onSave={save} busy={busy}
        />
      ) : (
        <AssignStep
          stage={current}
          staff={staff.filter((s) => s.role === current.owner)}
          selected={assign[current.id] || []}
          q={q} setQ={setQ}
          savedSelected={savedAssign[current.id] || []}
          assignments={assign} positions={positions} positionId={position.id}
          bookings={bookings} bookingsLoading={bookingsLoading} bookingError={bookingError}
          availabilityByUid={availabilityByUid} pendingSlots={personSlots[current.id] || {}}
          onSetPersonSlot={(person, window) => { setPersonSlot(current.id, person, window); setSaveStatus(""); }}
          onClearPersonSlot={(uid) => { clearPersonSlot(current.id, uid); setSaveStatus(""); }}
          loading={staffLoading} error={staffError}
          onToggle={(p) => { toggle(current.id, p); setSaveStatus(""); }}
          onSetMany={(people) => { setMany(current.id, people); setSaveStatus(""); }}
          stepInfo={`Step ${step} of ${lastStep}`}
          onSave={save} busy={busy}
        />
      )}
      </fieldset>
    </Modal>
  );
}

// ---------------------------------------------------------------- step 0
function PipelineStep({ rows, assign, move, rename, remove, adding, setAdding, newLabel, setNewLabel, addCustom, addBuiltin, availableBuiltin, canAssign, locked, onSave, busy }) {
  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        {locked ? (
          <div className="flex items-start gap-2 rounded-lg border border-[#F0C4C4] bg-[#FBE9E9] px-3 py-2.5 text-[12px] font-medium text-[#B91C1C]">
            <Lock size={14} className="mt-0.5 shrink-0" />
            <span>Recruitment has started — candidates have moved past Applied, so the stages are locked and can’t be added, removed, renamed or reordered. {canAssign ? "You can still change who’s assigned to each stage." : ""}</span>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Every vacancy starts at <b className="text-foreground">Applied</b> and ends at <b className="text-foreground">Hired</b>. Rename,
            reorder, remove or add the stages in between{canAssign ? ", then continue to assign a team to each one." : "."}
          </p>
        )}
        {canAssign && (
          <button type="button" onClick={onSave} disabled={busy} className="shrink-0 rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
            {busy ? "Saving…" : "Save now"}
          </button>
        )}
      </div>
      <LockedRow label="Applied" />
      {rows.map((r, i) => {
        const n = (assign[r.id] || []).length;
        return (
          <div key={r.id} className="rounded-xl border border-border bg-card p-2.5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.custom ? r.color?.dot || "#64748B" : STAGES[r.id]?.dot }} />
              <Input value={r.label} onChange={(e) => rename(r.id, e.target.value)} disabled={locked} className="h-9 py-1.5 disabled:cursor-not-allowed disabled:opacity-70" />
              {!locked && (
                <div className="flex shrink-0 items-center">
                  <IconBtn onClick={() => move(i, -1)} disabled={i === 0} title="Move up"><ChevronUp size={16} /></IconBtn>
                  <IconBtn onClick={() => move(i, 1)} disabled={i === rows.length - 1} title="Move down"><ChevronDown size={16} /></IconBtn>
                  <IconBtn onClick={() => remove(r.id)} title="Remove stage" danger><Trash2 size={15} /></IconBtn>
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-[18px]">
              <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {ROLE_LABELS[r.owner] || r.owner}{r.custom ? " · custom" : ""}
              </span>
              {canAssign && (
                <span className="text-[11px] font-medium text-muted-foreground">
                  {n > 0 ? `${n} assigned` : "no team yet"}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <LockedRow label="Hired" />

      {!locked && (adding ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-2.5">
          <Input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} placeholder="Custom stage name — e.g. Technical Task" className="h-9 py-1.5" />
          <Button onClick={addCustom} disabled={!newLabel.trim()}>Add</Button>
          <Button variant="ghost" onClick={() => { setAdding(false); setNewLabel(""); }}>Cancel</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 px-3 py-2 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/10">
            <Plus size={15} /> Add custom stage
          </button>
          {availableBuiltin.length > 0 && (
            <Select value="" onChange={(e) => e.target.value && addBuiltin(e.target.value)} className="h-9 w-auto py-1.5 pr-8 text-[13px]">
              <option value="">+ Add a built-in stage…</option>
              {availableBuiltin.map((id) => (<option key={id} value={id}>{STAGES[id].label}</option>))}
            </Select>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- bits
function StepChip({ active, done, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
        active ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary hover:bg-primary/25" : "bg-secondary text-muted-foreground hover:bg-[#E5EBF3]"
      }`}
    >
      {children}
    </button>
  );
}

function LockedRow({ label }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/50 px-3 py-2.5">
      <Lock size={13} className="text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-[11px] font-medium text-muted-foreground">· locked</span>
    </div>
  );
}

function IconBtn({ children, onClick, disabled, title, danger }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-30 ${danger ? "text-[#DC2626] hover:bg-[#FBE9E9]" : "text-muted-foreground hover:bg-secondary"}`}>
      {children}
    </button>
  );
}
