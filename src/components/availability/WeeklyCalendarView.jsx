// Read-only weekly-template calendar (Part B) — HR browsing one person's
// declared week. Sunday→Saturday left to right (deliberately the opposite
// order from Part A's Monday→Sunday editor tabs — see Availability.jsx).
// Renders the SAME weeklyAvailability `days` shape Part A writes; this is a
// separate, simpler renderer from InterviewCalendarGrid.jsx (that one plots
// real timestamps for a specific week of actual bookings — this one plots a
// recurring wall-clock template with no dates at all). Clicking a block does
// nothing — browsing only, per the Part B spec's non-goals.
const VIEW_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const VIEW_LABELS = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
const START_MIN = 8 * 60; // 08:00
const END_MIN = 20 * 60; // 20:00
const HOUR_PX = 40;
const RANGE_PX = ((END_MIN - START_MIN) / 60) * HOUR_PX;

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function blockStyle(range) {
  const startMin = Math.max(START_MIN, toMinutes(range.start));
  const endMin = Math.min(END_MIN, toMinutes(range.end));
  if (endMin <= startMin) return null;
  const top = ((startMin - START_MIN) / (END_MIN - START_MIN)) * 100;
  const height = ((endMin - startMin) / (END_MIN - START_MIN)) * 100;
  return { top: `${top}%`, height: `${height}%` };
}

function formatHour(h) {
  const period = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

export default function WeeklyCalendarView({ name, days }) {
  const hours = Array.from({ length: (END_MIN - START_MIN) / 60 }, (_, i) => START_MIN / 60 + i);

  return (
    <div>
      <h2 className="text-lg font-extrabold text-foreground">{name}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Weekly availability</p>

      {!days && (
        <p className="mt-3 text-sm font-medium text-muted-foreground">{name} has not declared availability yet.</p>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
        <div className="min-w-[720px]">
          <div className="grid border-b border-border" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
            <div />
            {VIEW_ORDER.map((key) => (
              <div key={key} className="border-l border-border px-2 py-2 text-center text-xs font-bold text-foreground">
                {VIEW_LABELS[key]}
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
            <div style={{ height: RANGE_PX }} className="relative">
              {hours.map((h) => (
                <div key={h} style={{ top: `${((h * 60 - START_MIN) / (END_MIN - START_MIN)) * 100}%` }} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-muted-foreground">
                  {formatHour(h)}
                </div>
              ))}
            </div>
            {VIEW_ORDER.map((key) => {
              const day = days?.[key];
              const notWorking = days && day?.enabled === false;
              return (
                <div key={key} style={{ height: RANGE_PX }} className="relative border-l border-border">
                  {hours.map((h) => (
                    <div key={h} style={{ top: `${((h * 60 - START_MIN) / (END_MIN - START_MIN)) * 100}%` }} className="absolute inset-x-0 border-t border-border/60" />
                  ))}
                  {notWorking ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-secondary/70">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl]">Not working</span>
                    </div>
                  ) : (
                    <>
                      {(day?.available || []).map((r, i) => {
                        const style = blockStyle(r);
                        return style && (
                          <div key={`a${i}`} style={style} className="absolute inset-x-0.5 z-0 rounded-sm bg-[#16A34A]/25 border border-[#16A34A]/50" title={`Available ${r.start}–${r.end}`} />
                        );
                      })}
                      {(day?.blocked || []).map((r, i) => {
                        const style = blockStyle(r);
                        return style && (
                          <div key={`b${i}`} style={style} className="absolute inset-x-0.5 z-10 rounded-sm bg-[#DC2626]/35 border border-[#DC2626]/60" title={`Blocked ${r.start}–${r.end}`} />
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
