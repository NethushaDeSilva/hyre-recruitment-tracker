// A staff member's own recurring weekly availability TEMPLATE — 7 day tabs
// (Mon→Sun), each with an "Available times" and a "Restricted / blocked
// times" section. Saturday and Sunday alone can be removed from the week
// entirely ("Remove this day") — a weekday expresses "not working" the
// ordinary way, zero available rows.
//
// This is a DIFFERENT feature from WS8 Part C's declared-slots-with-14-day-
// expiry model (src/lib/availability.js, still driving /schedule's booking
// calendar and the interview-assignment ranking) — see the collection-split
// note beside getWeeklyAvailability()/saveWeeklyAvailability() in
// src/data/store.js for why this couldn't reuse that shape.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { getWeeklyAvailability, saveWeeklyAvailability } from "@/data/store";
import {
  DAY_KEYS, DAY_LABELS, WEEKEND_KEYS,
  emptyWeek, emptyDay, emptyAvailableRow, emptyBlockedRow,
  validateWeek, weekHasErrors, daySummaryChip,
} from "@/lib/weeklyAvailability";
import { Button } from "@/components/ui/Button";
import DayPanel from "@/components/availability/DayPanel";

export default function Availability() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [saved, setSaved] = useState(emptyWeek());
  const [days, setDays] = useState(emptyWeek());
  const [activeDay, setActiveDay] = useState("mon");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    getWeeklyAvailability(user.uid).then((week) => {
      if (!alive) return;
      setSaved(week);
      setDays(week);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.uid]);

  const validation = useMemo(() => validateWeek(days), [days]);
  const dirty = useMemo(() => JSON.stringify(days) !== JSON.stringify(saved), [days, saved]);
  const hasErrors = weekHasErrors(validation);

  const patchDay = (key, patch) => setDays((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const addRow = (list) => patchDay(activeDay, { [list]: [...days[activeDay][list], list === "available" ? emptyAvailableRow() : emptyBlockedRow()] });
  const changeRow = (list, index, patch) =>
    patchDay(activeDay, { [list]: days[activeDay][list].map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  const removeRow = (list, index) => patchDay(activeDay, { [list]: days[activeDay][list].filter((_, i) => i !== index) });

  const removeDay = async () => {
    const label = DAY_LABELS[activeDay];
    const ok = await confirm({
      title: `Remove ${label} from your weekly availability?`,
      message: "You can restore it later.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    patchDay(activeDay, { enabled: false, available: [], blocked: [] });
  };
  const restoreDay = () => patchDay(activeDay, emptyDay());

  const save = async () => {
    if (hasErrors) return;
    setBusy(true);
    try {
      await saveWeeklyAvailability(user.uid, days);
      setSaved(days);
      toast.success("Availability saved.");
    } catch (e) {
      toast.error(e.message || "Couldn't save availability — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground sm:p-7">Loading…</div>;
  }

  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Schedule availability</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Your own recurring week. This is what HR sees when scheduling interviews.
      </p>

      {/* tab strip — Monday..Sunday, fixed order, one panel visible at a time */}
      <div className="mt-6 flex flex-wrap gap-1.5 border-b border-border">
        {DAY_KEYS.map((key) => {
          const active = key === activeDay;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveDay(key)}
              className={`flex flex-col items-center gap-0.5 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {DAY_LABELS[key]}
              <span className={`text-[10px] font-medium ${active ? "text-primary/70" : "text-muted-foreground/70"}`}>
                {daySummaryChip(days[key])}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 max-w-2xl">
        <DayPanel
          dayKey={activeDay}
          day={days[activeDay]}
          validation={validation[activeDay]}
          onAddRow={addRow}
          onChangeRow={changeRow}
          onRemoveRow={removeRow}
          onRemoveDay={removeDay}
          onRestoreDay={restoreDay}
        />

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={save} disabled={!dirty || hasErrors || busy}>
            {busy ? "Saving…" : "Save availability"}
          </Button>
          {hasErrors && <span className="text-xs font-medium text-[#DC2626]">Fix the highlighted times before saving.</span>}
        </div>
      </div>
    </div>
  );
}
