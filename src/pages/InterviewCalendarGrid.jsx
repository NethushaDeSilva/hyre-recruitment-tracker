// WS8 §8.2a — day columns × hour rows, one lane per visible interviewer.
//
// The UNKNOWN treatment lives here as a base layer, not a special case: every
// lane starts painted with a diagonal hatch (the "we don't know" texture,
// built from the existing --border token, never a person's own color). A
// person's DECLARED free windows punch a clean rectangle through that hatch;
// their commitments paint a solid bar in their own colour on top of that. A
// person who never declared anything simply has no rectangles to punch — the
// hatch base is all that's left, covering their entire lane, every day. That
// is what makes "never seen this person's calendar" and "confirmed free"
// impossible to mistake for one another: the default is always uncertainty,
// never openness.
import { useMemo } from "react";
import { Tooltip } from "@/components/ui/Tooltip";
import { weekDays, eventPosition, exceptionRange } from "@/lib/scheduleGrid";

const HOUR_PX = 48;
const HATCH_BG = {
  backgroundColor: "hsl(var(--background))",
  backgroundImage: "repeating-linear-gradient(45deg, hsl(var(--border)) 0px, hsl(var(--border)) 5px, transparent 5px, transparent 10px)",
};

function formatHour(h) {
  const period = h % 24 < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

export default function InterviewCalendarGrid({ weekStartMs, startHour, endHour, people, availability }) {
  const days = useMemo(() => weekDays(weekStartMs), [weekStartMs]);
  const hours = useMemo(() => Array.from({ length: endHour - startHour }, (_, i) => startHour + i), [startHour, endHour]);
  const bodyHeight = (endHour - startHour) * HOUR_PX;

  if (!people.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Select at least one interviewer to see their calendar.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <div className="min-w-[860px]">
        <div className="grid border-b border-border" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
          <div />
          {days.map((d) => (
            <div
              key={d.dateMs}
              className={`whitespace-nowrap px-2 py-2 text-center text-xs font-semibold ${d.isToday ? "text-primary" : "text-foreground"}`}
            >
              {d.label} <span className="text-muted-foreground">{d.dayOfMonth}</span>
            </div>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
          <div className="relative" style={{ height: bodyHeight }}>
            {hours.map((h, i) => (
              <div
                key={h}
                className="absolute inset-x-0 whitespace-nowrap px-1.5 text-right text-[10px] leading-none text-muted-foreground"
                style={{ top: i * HOUR_PX - 5 }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div
              key={day.dateMs}
              className={`relative flex border-l border-border ${day.isToday ? "bg-primary/5" : ""}`}
              style={{ height: bodyHeight }}
            >
              {hours.map((h, i) => (
                <div key={h} className="pointer-events-none absolute inset-x-0 z-10 border-t border-border/60" style={{ top: i * HOUR_PX }} />
              ))}
              {people.map((person) => (
                <PersonLane key={person.uid} person={person} day={day} startHour={startHour} endHour={endHour} availability={availability[person.uid]} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PersonLane({ person, day, startHour, endHour, availability: av }) {
  const dayStart = day.dateMs;
  const tz = av?.timeZone;

  const freeSegs = (av?.freeSlots || []).map((s) => eventPosition(s, dayStart, startHour, endHour)).filter(Boolean);

  const busyItems = [
    ...(av?.commitments || []).map((c) => ({ ...c, label: c.source === "interview" ? "Interview" : "Busy" })),
    ...(tz ? (av?.exceptions || []).map((e) => ({ ...exceptionRange(e, tz), label: e.type === "leave" ? "Leave" : "Blocked" })) : []),
  ];
  const busySegs = busyItems.map((it) => ({ pos: eventPosition(it, dayStart, startHour, endHour), label: it.label })).filter((x) => x.pos);

  return (
    <div className="relative h-full flex-1 border-l border-border/40 first:border-l-0" style={HATCH_BG}>
      {freeSegs.map((pos, i) => (
        <div key={`free-${i}`} className="absolute inset-x-0 bg-card" style={{ top: `${pos.topPct}%`, height: `${pos.heightPct}%` }} />
      ))}
      {busySegs.map(({ pos, label }, i) => (
        <Tooltip
          key={`busy-${i}`}
          label={`${person.name} — ${label}`}
          className="absolute inset-x-0.5 z-20 block overflow-hidden rounded-sm"
          style={{ top: `${pos.topPct}%`, height: `${pos.heightPct}%`, minHeight: 3, background: person.avatarColor }}
        />
      ))}
    </div>
  );
}
