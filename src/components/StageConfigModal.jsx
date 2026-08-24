// Configure the interview pipeline for a vacancy — a STEP-BY-STEP wizard.
//
//  Step 0  "Pipeline"     — choose the stages. Applied + Hired are locked
//                           bookends; the middle stages can be renamed,
//                           reordered, removed, or added (built-in or custom).
//  Step 1..N "Assign"     — one screen PER stage. Management sees only that
//                           stage's eligible people and ticks the TEAM who will
//                           run it (multi-select checkboxes, with title +
//                           availability). Proceed moves to the next stage.
//
// Assignment is Management-only; HR can edit the pipeline structure but only sees
// step 0. A candidate in a custom stage is actioned by Management (deployed rules
// treat unknown stages as management-only) — per-role custom stages are Sprint 2.
import { useState, useEffect, useMemo } from "react";
import { Lock, Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, ArrowLeft, Search, Loader2, Users, CheckCheck } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db, firebaseReady } from "@/firebase/config";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { STAGES, CONFIGURABLE_STAGES } from "@/lib/stages";
import { ROLES, ROLE_LABELS, can } from "@/lib/permissions";
import { ROLE_USERS, cleanTitle } from "@/context/auth-config";
import { savePipeline, useHyreData } from "@/data/store";
import { useAuth } from "@/context/AuthContext";

const ADDABLE_BUILTIN = [...CONFIGURABLE_STAGES, "hold"];
const CUSTOM_PALETTE = [
  { dot: "#0D9488", badgeBg: "#CCFBF1", badgeFg: "#0F766E" },
  { dot: "#DB2777", badgeBg: "#FCE7F3", badgeFg: "#BE185D" },
  { dot: "#D97706", badgeBg: "#FEF3C7", badgeFg: "#B45309" },
  { dot: "#7C3AED", badgeBg: "#EDE9FE", badgeFg: "#6D28D9" },
  { dot: "#0EA5E9", badgeBg: "#E0F2FE", badgeFg: "#0369A1" },
];
const AV_PALETTE = ["#1F3A5F", "#2563EB", "#4F46E5", "#0D9488", "#DB2777", "#D97706", "#7C3AED", "#0EA5E9", "#16A34A", "#E0A422"];
const colorFor = (name = "") => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
};

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
          // person can never show twice (one "available", one "busy").
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

  // Workload across ALL positions (fewest-first ordering + Available/Busy status).
  const workload = useMemo(() => {
    const m = {};
    for (const p of positions) {
      const src = p.id === position?.id ? assign : p.stageAssignees || {};
      for (const v of Object.values(src)) {
        const arr = Array.isArray(v) ? v : v ? [v] : [];
        for (const a of arr) if (a?.uid) m[a.uid] = (m[a.uid] || 0) + 1;
      }
    }
    return m;
  }, [positions, assign, position?.id]);

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
  // A person may run only ONE stage of a given vacancy. `assignedElsewhere` maps a
  // uid → the OTHER stage they're already on in this pipeline, so the current
  // stage's list can lock (grey out) them and never double-book one person.
  const assignedElsewhere = useMemo(() => {
    const m = {};
    if (step <= 0) return m;
    const currentId = (canAssign ? rows : [])[step - 1]?.id;
    if (!currentId) return m;
    for (const r of rows) {
      if (r.id === currentId) continue;
      for (const a of assign[r.id] || []) if (a?.uid && !m[a.uid]) m[a.uid] = r.label;
    }
    return m;
  }, [assign, rows, step, canAssign]);

  const toggle = (stageId, person) => setAssign((prev) => {
    const list = prev[stageId] ? [...prev[stageId]] : [];
    const i = list.findIndex((x) => x.uid === person.uid);
    if (i >= 0) list.splice(i, 1);
    else {
      if (assignedElsewhere[person.uid]) return prev; // already on another stage — block
      list.push({ uid: person.uid, name: person.name, role: person.role, title: person.title || "", email: person.email || "" });
    }
    return { ...prev, [stageId]: list };
  });
  const setMany = (stageId, people) => setAssign((prev) => ({ ...prev, [stageId]: people.map((p) => ({ uid: p.uid, name: p.name, role: p.role, title: p.title || "", email: p.email || "" })) }));

  const save = async () => {
    setBusy(true);
    const stages = ["applied", ...rows.map((r) => r.id), "hired"];
    const stageMeta = {};
    for (const r of rows) {
      if (r.custom) stageMeta[r.id] = { label: r.label, owner: r.owner, dot: r.color?.dot, badgeBg: r.color?.badgeBg, badgeFg: r.color?.badgeFg };
      else if (r.label && r.label !== STAGES[r.id]?.label) stageMeta[r.id] = { label: r.label };
    }
    const ids = new Set(rows.map((r) => r.id));
    const stageAssignees = {};
    for (const [id, list] of Object.entries(assign)) if (ids.has(id) && list?.length) stageAssignees[id] = list;
    await savePipeline(position.id, { stages, stageMeta, stageAssignees });
    setBusy(false);
    onClose();
  };

  const assignable = canAssign ? rows : [];
  const lastStep = assignable.length; // step index of the final assignment screen (0 if none)
  const current = step > 0 ? assignable[step - 1] : null;
  const availableBuiltin = ADDABLE_BUILTIN.filter((id) => !rows.some((r) => r.id === id));
  const goTo = (s) => { setQ(""); setStep(Math.max(0, Math.min(s, lastStep))); };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={880}
      title="Configure interview stages"
      subtitle={position ? position.title : ""}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <div>{step > 0 && <Button variant="ghost" onClick={() => goTo(step - 1)}><ArrowLeft size={15} /> Back</Button>}</div>
          <div className="flex items-center gap-2">
            {step < lastStep && <Button variant="ghost" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save now"}</Button>}
            {step < lastStep ? (
              <Button onClick={() => goTo(step + 1)}>{step === 0 ? "Assign people" : "Proceed"} <ChevronRight size={15} /></Button>
            ) : (
              <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save stages"}</Button>
            )}
          </div>
        </div>
      }
    >
      {/* progress breadcrumb */}
      {canAssign && assignable.length > 0 && (
        <div className="mb-4 flex items-center gap-1 overflow-x-auto pb-1">
          <StepChip active={step === 0} done={step > 0} onClick={() => goTo(0)}>Stages</StepChip>
          {assignable.map((r, i) => (
            <span key={r.id} className="flex items-center gap-1">
              <ChevronRight size={13} className="shrink-0 text-[#CBD5E1]" />
              <StepChip active={step === i + 1} done={step > i + 1} onClick={() => goTo(i + 1)}>{r.label}</StepChip>
            </span>
          ))}
        </div>
      )}

      {step === 0 ? (
        <PipelineStep
          rows={rows} assign={assign} move={move} rename={rename} remove={remove}
          adding={adding} setAdding={setAdding} newLabel={newLabel} setNewLabel={setNewLabel}
          addCustom={addCustom} addBuiltin={addBuiltin} availableBuiltin={availableBuiltin} canAssign={canAssign}
          locked={started}
        />
      ) : (
        <AssignStep
          stage={current}
          staff={staff.filter((s) => s.role === current.owner)}
          selected={assign[current.id] || []}
          lockedElsewhere={assignedElsewhere}
          q={q} setQ={setQ}
          workload={workload} loading={staffLoading} error={staffError}
          onToggle={(p) => toggle(current.id, p)}
          onSetMany={(people) => setMany(current.id, people)}
          stepInfo={`Step ${step} of ${lastStep}`}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- step 0
function PipelineStep({ rows, assign, move, rename, remove, adding, setAdding, newLabel, setNewLabel, addCustom, addBuiltin, availableBuiltin, canAssign, locked }) {
  return (
    <div className="space-y-2.5">
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

// ---------------------------------------------------------------- steps 1..N
function AssignStep({ stage, staff, selected, lockedElsewhere = {}, q, setQ, workload, loading, error, onToggle, onSetMany, stepInfo }) {
  const roleLabel = ROLE_LABELS[stage.owner] || stage.owner;
  const selIds = new Set(selected.map((s) => s.uid));
  const needle = q.trim().toLowerCase();
  // Always include people already assigned to THIS stage, even if the directory
  // fetch wouldn't otherwise surface them (deleted account, filtered, etc.). This
  // guarantees a saved assignee is never an unremovable "ghost" — there's always a
  // row (with a ticked box) you can click to remove them.
  const roster = (() => {
    const byUid = new Map(staff.map((s) => [s.uid, s]));
    for (const s of selected) if (s.uid && !byUid.has(s.uid)) byUid.set(s.uid, { uid: s.uid, name: s.name, role: s.role, title: s.title || "", email: s.email || "" });
    return [...byUid.values()];
  })();
  // A person locked to another stage of this pipeline isn't selectable here.
  const isLocked = (s) => !!lockedElsewhere[s.uid] && !selIds.has(s.uid);
  const shown = (needle ? roster.filter((s) => s.name.toLowerCase().includes(needle) || (s.title || "").toLowerCase().includes(needle)) : roster.slice())
    .sort((a, b) => {
      // selectable first, then least-busy, then alphabetical
      const lockDiff = (isLocked(a) ? 1 : 0) - (isLocked(b) ? 1 : 0);
      if (lockDiff) return lockDiff;
      const la = workload[a.uid] || 0, lb = workload[b.uid] || 0;
      if (la !== lb) return la - lb;
      return a.name.localeCompare(b.name);
    });
  const selectable = shown.filter((s) => !isLocked(s));
  const allShownSelected = selectable.length > 0 && selectable.every((s) => selIds.has(s.uid));

  const toggleAllShown = () => {
    if (allShownSelected) {
      const drop = new Set(selectable.map((s) => s.uid));
      onSetMany(selected.filter((s) => !drop.has(s.uid)));
    } else {
      const merged = [...selected];
      for (const s of selectable) if (!selIds.has(s.uid)) merged.push(s);
      onSetMany(merged);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGES[stage.id]?.dot || stage.color?.dot || "#64748B" }} />
            <h4 className="text-[15px] font-bold text-foreground">{stage.label}</h4>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{roleLabel}</span>
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">{stepInfo} · tick everyone who will run this stage. Only {roleLabel} staff are shown.</p>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-bold text-primary">{selected.length} selected</span>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
        <Search size={15} className="shrink-0 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${roleLabel} by name or title…`} className="w-full bg-transparent text-sm text-foreground placeholder:text-[#94A3B8] focus:outline-none" />
        <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{loading ? "…" : shown.length}</span>
      </div>

      {selectable.length > 0 && (
        <button onClick={toggleAllShown} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
          <CheckCheck size={14} /> {allShownSelected ? "Clear all shown" : `Select all ${selectable.length} available`}
        </button>
      )}

      <ul className="max-h-[52vh] min-h-[220px] divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {shown.map((s) => {
          const on = selIds.has(s.uid);
          const busy = workload[s.uid] || 0;
          const lockedStage = isLocked(s) ? lockedElsewhere[s.uid] : null;
          return (
            <li key={s.uid}>
              <button
                type="button"
                onClick={() => !lockedStage && onToggle(s)}
                disabled={!!lockedStage}
                title={lockedStage ? `Already assigned to “${lockedStage}” — one person runs one stage per vacancy` : undefined}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${lockedStage ? "cursor-not-allowed opacity-55" : on ? "bg-primary/5" : "hover:bg-secondary/60"}`}
              >
                <input type="checkbox" readOnly checked={on} disabled={!!lockedStage} className="h-4 w-4 shrink-0 accent-primary" />
                <Avatar name={s.name} color={colorFor(s.name)} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">{s.name}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{s.title || roleLabel}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[11px]">
                  {lockedStage ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-muted-foreground">On “{lockedStage}”</span>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: busy ? "#D97706" : "#16A34A" }} />
                      <span className={busy ? "text-[#B45309]" : "text-[#16A34A]"}>{busy ? `Busy · ${busy}` : "Available"}</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {loading && <li className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground"><Loader2 size={15} className="animate-spin" /> Loading team…</li>}
        {!loading && error && <li className="px-3 py-6 text-center text-[13px] font-medium text-[#DC2626]">{error}</li>}
        {!loading && !error && roster.length === 0 && <li className="flex flex-col items-center gap-1 py-6 text-center text-[13px] text-muted-foreground"><Users size={18} /> No {roleLabel} staff yet.</li>}
        {!loading && !error && roster.length > 0 && shown.length === 0 && <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">No matches for “{q}”.</li>}
      </ul>
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
