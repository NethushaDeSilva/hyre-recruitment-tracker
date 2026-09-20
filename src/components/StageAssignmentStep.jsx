import { useEffect, useRef, useState } from "react";
import { Search, Loader2, CheckCheck, ChevronDown, CalendarX2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ROLE_LABELS } from "@/lib/permissions";
import { STAGES } from "@/lib/stages";
import { bookingConflict, bookingDescription, selectedFirst, BOOKED_STATUSES } from "@/lib/interviewSchedule";
import { materializeSlots } from "@/lib/availability";
import { upcomingWeekBoundsMs } from "@/lib/weeklyAvailability";

const COLORS = ["#1F3A5F", "#2563EB", "#4F46E5", "#0D9488", "#DB2777", "#D97706", "#7C3AED", "#0EA5E9", "#16A34A", "#E0A422"];
const colorFor = (name = "") => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
};
const fmtDate = (ms, tz) => new Date(ms).toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
const fmtTime = (ms, tz) => new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

export default function StageAssignmentStep({ stage, staff, selected, savedSelected, assignments, positions, positionId, bookings, bookingsLoading, bookingError, availabilityByUid, pendingSlots, onSetPersonSlot, onClearPersonSlot, q, setQ, loading, error, onToggle, onSetMany, stepInfo, onSave, busy }) {
  const listRef = useRef(null);
  const selectionKey = selected.map((p) => p.uid).sort().join(",");
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [selectionKey, stage.id]);
  const selectedIds = new Set(selected.map((p) => p.uid));
  const savedIds = new Set(savedSelected.map((p) => p.uid));
  const roleLabel = ROLE_LABELS[stage.owner] || stage.owner;
  const byUid = new Map(staff.map((p) => [p.uid, p]));
  // Keep saved staff visible even when they are absent from the directory.
  for (const p of [...savedSelected, ...selected]) if (!byUid.has(p.uid)) byUid.set(p.uid, p);
  const roster = [...byUid.values()];
  const needle = q.trim().toLowerCase();
  const shown = selectedFirst(roster.filter((p) => selectedIds.has(p.uid) || !needle || `${p.name} ${p.title || ""}`.toLowerCase().includes(needle)), selected);
  const allSelected = shown.length > 0 && shown.every((p) => selectedIds.has(p.uid));
  const toggleAll = () => onSetMany(allSelected ? [] : shown);
  const stageBookings = bookings.filter((b) => b.positionId === positionId && b.stageId === stage.id && BOOKED_STATUSES.includes(b.status));

  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGES[stage.id]?.dot || stage.color?.dot || "#64748B" }} />
          <h4 className="text-[15px] font-bold text-foreground">{stage.label}</h4>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{roleLabel}</span>
        </div>
        <p className="mt-1 text-[12px] text-muted-foreground">{stepInfo} · Select the {roleLabel} staff who will run this stage. Expand a name to book them against their own declared availability.</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[12px] font-bold text-primary">{selected.length} selected</span>
        <button type="button" onClick={onSave} disabled={busy} className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
          {busy ? "Saving…" : "Save now"}
        </button>
      </div>
    </div>

    {bookingError && <p role="alert" className="text-xs text-[#DC2626]">{bookingError}</p>}
    {stageBookings.length > 0 && <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">{stageBookings.length} saved booking{stageBookings.length === 1 ? "" : "s"} for this stage</summary>
      {stageBookings.map((b) => <p key={b.id} className="mt-1">{b.interviewerName || roster.find((p) => p.uid === b.interviewerId)?.name || "Team member"} · {new Date(b.scheduledAt).toLocaleDateString()} · {bookingDescription(b)}</p>)}
    </details>}
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Search size={15} className="shrink-0 text-muted-foreground" />
      <input aria-label="Search staff" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${roleLabel} by name or title…`} className="w-full bg-transparent text-sm text-foreground placeholder:text-[#94A3B8] focus:outline-none" />
      <span className="text-[11px] text-muted-foreground">{shown.length}</span>
    </div>
    {shown.length > 0 && <button type="button" onClick={toggleAll} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"><CheckCheck size={14} />{allSelected ? "Clear all shown" : `Select all ${shown.length}`}</button>}
    <ul ref={listRef} className="max-h-[55vh] min-h-[220px] divide-y divide-border overflow-y-auto rounded-xl border border-border">
      {shown.map((p) => {
        const on = selectedIds.has(p.uid), saved = savedIds.has(p.uid);
        const otherPositions = positions.filter((pos) => pos.id !== positionId && Object.values(pos.stageAssignees || {}).some((v) => (Array.isArray(v) ? v : v ? [v] : []).some((a) => a.uid === p.uid)));
        const elsewhere = [...new Set([...otherPositions.map((pos) => pos.title), ...bookings.filter((b) => b.interviewerId === p.uid && b.positionId !== positionId && BOOKED_STATUSES.includes(b.status)).map((b) => b.positionTitle || b.positionId)])];
        const otherStage = Object.entries(assignments).some(([id, list]) => id !== stage.id && list.some((a) => a.uid === p.uid));
        const bookedHere = bookings.some((b) => b.positionId === positionId && b.interviewerId === p.uid && BOOKED_STATUSES.includes(b.status));
        const status = on ? (saved ? "Assigned to this position · Saved" : "Selected · Unsaved change") : saved ? "Deselected · Unsaved change" : otherStage ? "Assigned to another stage here" : bookedHere ? "Booked for this position" : "No assignments for this position";
        return <li key={p.uid}>
          <button type="button" aria-label={`Select ${p.name}`} aria-pressed={on} onClick={() => onToggle(p)}
            className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left transition-colors ${on ? "bg-primary/5" : "hover:bg-secondary/60"}`}>
            <input type="checkbox" tabIndex={-1} aria-hidden="true" readOnly checked={on} className="pointer-events-none h-4 w-4 shrink-0 accent-primary" />
            <Avatar name={p.name} color={p.avatarColor || colorFor(p.name)} size={34} />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-[12px] text-muted-foreground">{p.title || roleLabel}</span></span>
            <span className="flex max-w-full flex-col items-end gap-1 text-[11px]">
              <span className={on ? "font-semibold text-primary" : "text-muted-foreground"}>{status}</span>
              {elsewhere.length > 0 && <span className="text-muted-foreground">Assigned elsewhere · {elsewhere.join(", ")}</span>}
            </span>
          </button>
          <AvailabilityDropdown
            person={p} positionId={positionId} stage={stage} bookings={bookings}
            record={availabilityByUid?.[p.uid] || null}
            pendingSlot={pendingSlots?.[p.uid] || null}
            onSet={(window) => onSetPersonSlot(p, window)}
            onClear={() => onClearPersonSlot(p.uid)}
            onSave={onSave} busy={busy}
          />
        </li>;
      })}
      {loading && <li className="flex justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Loading team…</li>}
      {!loading && error && <li className="px-3 py-6 text-center text-sm text-[#DC2626]">{error}</li>}
      {!loading && !error && shown.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{roster.length ? "No matching staff." : `No ${roleLabel} staff yet.`}</li>}
    </ul>
  </div>;
}

// Per-person "available times" panel — real declared availability materialized
// onto the actual upcoming calendar week (never a manually-typed date/time,
// see the removed "Book a time slot" section this replaces). Each free window
// gets a "Set Interview" button; once set, that specific window locks so
// nothing can be pressed again. No checkboxes here — a slot is either open,
// booked, or busy, never a multi-select.
function AvailabilityDropdown({ person, positionId, stage, bookings, record, pendingSlot, onSet, onClear, onSave, busy }) {
  const [open, setOpen] = useState(false);
  const tz = record?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { fromMs, toMs } = upcomingWeekBoundsMs();
  const windows = open ? materializeSlots(record, fromMs, toMs) : [];

  return (
    <div className="border-t border-border/70 bg-secondary/30">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground">
        <span>{pendingSlot ? `Interview set · ${fmtDate(pendingSlot.scheduledAt, tz)}, ${fmtTime(pendingSlot.scheduledAt, tz)}` : "Available times"}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-1.5 px-3 pb-3">
          {windows.length === 0 ? (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarX2 size={13} /> No available times.</p>
          ) : (
            windows.map((w) => {
              const durationMs = w.endMs - w.startMs;
              const isThisSlot = pendingSlot && pendingSlot.scheduledAt === w.startMs;
              const otherSlotPending = pendingSlot && !isThisSlot;
              const persisted = bookings.some((b) => b.positionId === positionId && b.stageId === stage.id
                && b.interviewerId === person.uid && b.scheduledAt === w.startMs && BOOKED_STATUSES.includes(b.status));
              const conflict = !isThisSlot && bookingConflict(bookings, { interviewerId: person.uid, scheduledAt: w.startMs, durationMs });
              const label = `${fmtDate(w.startMs, tz)} · ${fmtTime(w.startMs, tz)}–${fmtTime(w.endMs, tz)}`;
              return (
                <div key={w.startMs} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-[12px] ${
                  isThisSlot ? "border-[#86EFAC] bg-[#DCFCE7]" : conflict ? "border-[#F0C4C4] bg-[#FBE9E9] opacity-70" : "border-[#BBF0CE] bg-[#F0FBF4]"
                }`}>
                  <span className={isThisSlot ? "font-semibold text-[#166534]" : conflict ? "text-[#B91C1C]" : "text-[#166534]"}>{label}</span>
                  {isThisSlot ? (
                    persisted ? (
                      <span className="text-[11px] font-semibold text-[#166534]">Interview set · Saved</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <button type="button" onClick={onClear} className="text-[11px] font-semibold text-[#166534] underline decoration-dotted hover:text-[#14532D]">Unselect</button>
                        <button type="button" onClick={onSave} disabled={busy} className="rounded-md bg-[#16A34A] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#15803D] disabled:opacity-50">
                          {busy ? "Saving…" : "Save now"}
                        </button>
                      </span>
                    )
                  ) : conflict ? (
                    <span className="text-[11px] text-[#B91C1C]">{bookingDescription(conflict)}</span>
                  ) : (
                    <button type="button" disabled={!!otherSlotPending} onClick={() => onSet({ scheduledAt: w.startMs, durationMs })}
                      title={otherSlotPending ? "Unselect the current interview for this stage first" : undefined}
                      className="rounded-md bg-[#16A34A] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#15803D] disabled:cursor-not-allowed disabled:opacity-40">
                      Set Interview
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
