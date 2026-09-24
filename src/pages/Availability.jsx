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
  dayTimeState, colomboTodayIndex, colomboNowHHMM, validateWeekTiming, mergeValidation,
} from "@/lib/weeklyAvailability";
import { Button } from "@/components/ui/Button";
import DayPanel from "@/components/availability/DayPanel";

// How often the page re-reads the clock. This drives BOTH the Colombo-midnight
// roll into the next week AND the per-minute gating of today's already-passed
// times, so a page left open doesn't keep offering times that have since
// gone by. (It replaced a single timer that only fired at midnight, which was
// enough for the week window but not for a within-day time check.)
const CLOCK_TICK_MS = 30_000;

export default function Availability() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [saved, setSaved] = useState(emptyWeek());
  const [days, setDays] = useState(emptyWeek());
  // Opens on TODAY, not on Sunday: Sunday is the first tab, but by midweek it's
  // a past day and therefore disabled — landing the user on a tab they can't
  // edit would read as the page being broken.
  const [activeDay, setActiveDay] = useState(() => DAY_KEYS[colomboTodayIndex()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // THIS calendar week — Sunday through Saturday, in Sri Lanka time
  // (Asia/Colombo), re-read on a tick so a tab left open rolls into the next
  // week overnight and stops offering times that have since passed.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(t);
  }, []);
  const weekDates = useMemo(() => currentWeekDates(now), [now]);
  const datesByDayKey = useMemo(() => currentWeekByDayKey(now), [now]);
  // "past" | "today" | "future" per tab, recomputed on every tick.
  const dayStates = useMemo(
    () => Object.fromEntries(DAY_KEYS.map((k) => [k, dayTimeState(k, now)])),
    [now]
  );
  const nowLabel = colomboNowHHMM(now);

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

  // Shape checks (bad/overlapping times) merged with clock checks (past day
  // edited, past time on today). Both re-run on every tick, so a row that was
  // fine when typed starts showing "This time has already passed" once it is.
  const validation = useMemo(
    () => mergeValidation(validateWeek(days), validateWeekTiming(days, saved, now)),
    [days, saved, now]
  );
  const dirty = useMemo(() => JSON.stringify(days) !== JSON.stringify(saved), [days, saved]);
  const hasErrors = weekHasErrors(validation);
  const readOnlyDay = dayStates[activeDay] === "past";
  const pastDays = DAY_KEYS.filter((k) => dayStates[k] === "past");

  // Midnight rollover can turn the tab you're sitting on into a past day —
  // move to today rather than leaving an editable panel open on it.
  useEffect(() => {
    if (dayStates[activeDay] === "past") setActiveDay(DAY_KEYS[colomboTodayIndex(now)]);
  }, [dayStates, activeDay, now]);

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
          const past = dayStates[key] === "past";
          return (
            <button
              key={key}
              type="button"
              // A day earlier than today this week can't be selected or edited
              // at all — its saved slots stay readable via the panel below,
              // but there is nothing left to decide about a day that's gone.
              disabled={past}
              aria-disabled={past}
              title={past ? "This day has already passed." : undefined}
              onClick={() => { if (!past) setActiveDay(key); }}
              className={`flex flex-col items-center gap-0.5 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                past
                  ? "cursor-not-allowed border-transparent text-muted-foreground/40"
                  : active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {DAY_LABELS[key]}
              <span className={`text-[10px] font-medium ${past ? "text-muted-foreground/40" : active ? "text-primary/70" : "text-muted-foreground/70"}`}>
                {formatShortDate(datesByDayKey[key])} · {daySummaryChip(days[key])}{past ? " · passed" : ""}
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
          readOnly={readOnlyDay}
          // Today only: the native pickers refuse earlier values, and the
          // authoritative check is validateWeekTiming() via `validation`.
          minTime={dayStates[activeDay] === "today" ? nowLabel : undefined}
          onAddRow={addRow}
          onChangeRow={changeRow}
          onRemoveRow={removeRow}
          onRemoveDay={removeDay}
          onRestoreDay={restoreDay}
        />

        {dayStates[activeDay] === "today" && (
          <p className="mt-2 text-xs text-muted-foreground">
            It's {nowLabel} — times earlier than this today can't be added.
          </p>
        )}

        {/* Past days are not selectable above, so this is where their saved
            times stay readable — historical availability is never hidden,
            just frozen. */}
        {pastDays.length > 0 && (
          <div className="mt-6 rounded-lg border border-border bg-secondary/30 p-4">
            <h3 className="text-[13px] font-bold text-foreground">Earlier this week (read-only)</h3>
            <ul className="mt-2 space-y-1.5">
              {pastDays.map((key) => (
                <li key={key} className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground/70">{DAY_LABELS[key]}</span>
                  <span>{formatShortDate(datesByDayKey[key])}</span>
                  <span>
                    {saved[key]?.enabled === false
                      ? "Not working"
                      : (saved[key]?.available || []).length === 0
                      ? "No available times"
                      : (saved[key].available || []).map((r) => `${r.start}–${r.end}`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

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
