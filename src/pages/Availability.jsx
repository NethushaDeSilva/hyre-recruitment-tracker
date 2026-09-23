// A staff member's own recurring weekly availability TEMPLATE — 7 day tabs
// (Sun→Sat — the calendar week starts on Sunday), each with a single
// "Available times" section. Anything not
// listed as available is already treated as busy (src/lib/availability.js
// only ever reads declared slots as free) — there is no separate blocked-
// times list to maintain. Saturday and Sunday alone can be removed from the
// week entirely ("Remove this day") — a weekday expresses "not working" the
// ordinary way, zero available rows.
//
// This is a DIFFERENT feature from WS8 Part C's declared-slots-with-14-day-
// expiry model (src/lib/availability.js, still driving /schedule's booking
// calendar and the interview-assignment ranking) — see the collection-split
// note beside getWeeklyAvailability()/saveWeeklyAvailability() in
// src/data/store.js for why this couldn't reuse that shape.
import { useEffect, useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useToast } from "@/components/ui/ToastProvider";
import { getWeeklyAvailability, saveWeeklyAvailability } from "@/data/store";
import {
  DAY_KEYS, DAY_LABELS, WEEKEND_KEYS,
  emptyWeek, emptyDay, emptyAvailableRow,
  validateWeek, weekHasErrors, daySummaryChip,
  currentWeekDates, currentWeekByDayKey, formatShortDate, weekRangeLabel,
} from "@/lib/weeklyAvailability";
import { Button } from "@/components/ui/Button";
import DayPanel from "@/components/availability/DayPanel";

/** Ms until 5s after the next Sri-Lanka-time midnight — when "this week" rolls into the next one. */
function msUntilNextColomboMidnight() {
  const now = new Date();
  // Asia/Colombo is a fixed UTC+05:30 offset (no DST) — safe to compute directly.
  const colomboNow = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const nextMidnightColombo = Date.UTC(colomboNow.getUTCFullYear(), colomboNow.getUTCMonth(), colomboNow.getUTCDate() + 1, 0, 0, 5);
  return nextMidnightColombo - 5.5 * 3600 * 1000 - now.getTime();
}

export default function Availability() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [saved, setSaved] = useState(emptyWeek());
  const [days, setDays] = useState(emptyWeek());
  const [activeDay, setActiveDay] = useState("sun"); // Sunday is the first tab — the week starts there
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // THIS calendar week — Sunday through Saturday, in Sri Lanka time
  // (Asia/Colombo). Recomputed at Colombo midnight so a tab left open
  // overnight rolls into the next week on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setTimeout(() => setNow(Date.now()), msUntilNextColomboMidnight());
    return () => clearTimeout(t);
  }, [now]);
  const weekDates = useMemo(() => currentWeekDates(now), [now]);
  const datesByDayKey = useMemo(() => currentWeekByDayKey(now), [now]);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    getWeeklyAvailability(user.uid).then((week) => {
      if (!alive) return;
      setSaved(week);
      setDays(week);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [user?.uid, weekDates[0].year, weekDates[0].month, weekDates[0].day]);

  const validation = useMemo(() => validateWeek(days), [days]);
  const dirty = useMemo(() => JSON.stringify(days) !== JSON.stringify(saved), [days, saved]);
  const hasErrors = weekHasErrors(validation);

  const patchDay = (key, patch) => setDays((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  const addRow = () => patchDay(activeDay, { available: [...days[activeDay].available, emptyAvailableRow()] });
  const changeRow = (_list, index, patch) =>
    patchDay(activeDay, { available: days[activeDay].available.map((r, i) => (i === index ? { ...r, ...patch } : r)) });
  const removeRow = (_list, index) => patchDay(activeDay, { available: days[activeDay].available.filter((_, i) => i !== index) });

  const removeDay = async () => {
    const label = DAY_LABELS[activeDay];
    const ok = await confirm({
      title: `Remove ${label} from your weekly availability?`,
      message: "You can restore it later.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    patchDay(activeDay, { enabled: false, available: [] });
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
        Save your available dates for this week. These are the times HR sees when scheduling interviews.
      </p>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-foreground">
        <CalendarDays size={14} className="text-primary" />
        {weekRangeLabel(weekDates)}
      </p>

      {/* tab strip — Sunday..Saturday, fixed order, one panel visible at a time.
          The date under each name is that weekday's actual date THIS week,
          Sri Lanka time. */}
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
                {formatShortDate(datesByDayKey[key])} · {daySummaryChip(days[key])}
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
