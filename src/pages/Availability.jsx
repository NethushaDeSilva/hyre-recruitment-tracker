// WS8 §8.2 — staff declare their OWN availability here. Nobody else can edit
// it (firestore.rules enforces this, not just this screen) — declared
// availability is a person's own claim about their own schedule; HR's real
// power over a booking is the manual override on the interview itself (§15),
// not silently editing someone else's calendar.
import { useEffect, useState } from "react";
import { Check, Clock, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getAvailability, saveAvailability } from "@/data/store";
import { AVAILABILITY_VALIDITY_MS } from "@/lib/availability";
import { timeAgo } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Select, Input } from "@/components/ui/Field";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const emptySlot = () => ({ dayOfWeek: 1, startTime: "09:00", endTime: "17:00" });
const emptyException = () => ({ date: todayStr(), type: "leave", reason: "" });

export default function Availability() {
  const { user } = useAuth();
  const [slots, setSlots] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [declaredAt, setDeclaredAt] = useState(0);
  const [validUntil, setValidUntil] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    getAvailability(user.uid)
      .then((rec) => {
        if (!alive) return;
        setSlots(rec?.slots?.length ? rec.slots : []);
        setExceptions(rec?.exceptions || []);
        setDeclaredAt(rec?.declaredAt || 0);
        setValidUntil(rec?.validUntil || 0);
      })
      .catch((e) => console.error("getAvailability:", e))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const updateSlot = (i, patch) => setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeSlot = (i) => setSlots((prev) => prev.filter((_, idx) => idx !== i));
  const updateException = (i, patch) => setExceptions((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const removeException = (i) => setExceptions((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true);
    try {
      await saveAvailability(user.uid, { slots, exceptions });
      setDeclaredAt(Date.now());
      setValidUntil(Date.now() + AVAILABILITY_VALIDITY_MS);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("save availability:", e);
    } finally {
      setBusy(false);
    }
  };

  const stale = validUntil > 0 && Date.now() > validUntil;
  const ageing = declaredAt > 0 && Date.now() - declaredAt > 7 * 24 * 60 * 60 * 1000;

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground sm:p-7">Loading…</div>;
  }

  return (
    <div className="p-4 sm:p-7">
      <h1 className="text-[27px] font-extrabold tracking-tight text-foreground">Your availability</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Declared here only — never guessed from your workload. This is what HR sees when scheduling interviews.
      </p>

      {declaredAt > 0 && (
        <div className={`mt-4 flex flex-wrap items-center gap-2 rounded-md border px-3.5 py-2.5 text-xs font-medium ${
          stale ? "border-[#DC2626]/40 bg-[#FBE9E9] text-[#DC2626] dark:bg-[#DC2626]/15"
          : ageing ? "border-[#E0A422]/40 bg-[#FEF3C7] text-[#B45309] dark:bg-[#F59E0B]/15 dark:text-[#FBBF24]"
          : "border-[#16A34A]/30 bg-[#E7F6EC] text-[#16A34A] dark:bg-[#16A34A]/15"
        }`}>
          {stale ? <AlertTriangle size={13} className="shrink-0" /> : <Clock size={13} className="shrink-0" />}
          <span>
            {stale ? "Expired — " : "Updated "}{timeAgo(declaredAt)}.{" "}
            {stale ? "Save again to be schedulable." : "Declarations expire after 14 days."}
          </span>
        </div>
      )}

      <div className="mt-6 max-w-2xl space-y-6">
        <div className="space-y-4 rounded-lg border border-[#E9EEF4] bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Available times</div>
              <p className="mt-0.5 text-xs text-muted-foreground">Recurring weekly windows when you're free for interviews. Times are in your own local time zone, captured automatically when you save.</p>
            </div>
            <Button variant="ghost" onClick={() => setSlots((p) => [...p, emptySlot()])} className="!px-3 !py-1.5 text-xs">
              <Plus size={14} /> Add window
            </Button>
          </div>
          {slots.length === 0 && <p className="text-sm text-muted-foreground">No recurring windows declared yet.</p>}
          <div className="space-y-2">
            {slots.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5">
                <Select value={s.dayOfWeek} onChange={(e) => updateSlot(i, { dayOfWeek: Number(e.target.value) })} className="!w-auto min-w-[130px] shrink-0">
                  {DAYS.map((d, idx) => <option key={d} value={idx}>{d}</option>)}
                </Select>
                <Input type="time" value={s.startTime} onChange={(e) => updateSlot(i, { startTime: e.target.value })} className="!w-auto shrink-0" />
                <span className="shrink-0 text-xs text-muted-foreground">to</span>
                <Input type="time" value={s.endTime} onChange={(e) => updateSlot(i, { endTime: e.target.value })} className="!w-auto shrink-0" />
                <button type="button" onClick={() => removeSlot(i)} className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-[#DC2626]" aria-label="Remove window">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-[#E9EEF4] bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Unavailable times</div>
              <p className="mt-0.5 text-xs text-muted-foreground">Leave, or a single day you're not free — overrides your available times for that date only.</p>
            </div>
            <Button variant="ghost" onClick={() => setExceptions((p) => [...p, emptyException()])} className="!px-3 !py-1.5 text-xs">
              <Plus size={14} /> Add block
            </Button>
          </div>
          {exceptions.length === 0 && <p className="text-sm text-muted-foreground">No one-off blocks.</p>}
          <div className="space-y-2">
            {exceptions.map((ex, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2.5">
                <Input type="date" value={ex.date} onChange={(e) => updateException(i, { date: e.target.value })} className="!w-auto shrink-0" />
                <Select value={ex.type} onChange={(e) => updateException(i, { type: e.target.value })} className="!w-auto min-w-[110px] shrink-0">
                  <option value="leave">Leave</option>
                  <option value="blocked">Blocked</option>
                </Select>
                <Input value={ex.reason} onChange={(e) => updateException(i, { reason: e.target.value })} placeholder="Reason (optional)" className="min-w-[140px] flex-1" />
                <button type="button" onClick={() => removeException(i)} className="ml-auto shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-[#DC2626]" aria-label="Remove block">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save availability"}</Button>
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
