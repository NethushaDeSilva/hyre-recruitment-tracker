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

// §7a — a free block used to render as a bare coloured rectangle with no
// text at all. "Tue 2–4pm" here is the viewer's own local time, same
// convention as the rest of this file.
function formatTimeRange(startMs, endMs) {
  const fmt = (ms) => {
    const d = new Date(ms);
    const period = d.getHours() < 12 ? "AM" : "PM";
    const hr = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    return d.getMinutes() === 0 ? `${hr}${period}` : `${hr}:${String(d.getMinutes()).padStart(2, "0")}${period}`;
  };
  return `${fmt(startMs)}–${fmt(endMs)}`;
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
                <PersonLane key={person.uid} person={person} day={day} startHour={startHour} endHour={endHour} bodyHeight={bodyHeight} availability={availability[person.uid]} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Minimum pixel heights for a free block to carry text at all, and to carry
// the time range on top of the name — below the first threshold the block is
// left blank rather than clipping a word into illegibility; the tooltip is
// still there as a fallback either way.
const MIN_PX_FOR_NAME = 20;
const MIN_PX_FOR_TIME = 34;

function PersonLane({ person, day, startHour, endHour, bodyHeight, availability: av }) {
  const dayStart = day.dateMs;
  const tz = av?.timeZone;

  const freeSegs = (av?.freeSlots || [])
    .map((s) => {
      const pos = eventPosition(s, dayStart, startHour, endHour);
      return pos ? { pos, startMs: s.startMs, endMs: s.endMs } : null;
    })
    .filter(Boolean);

  const busyItems = [
    ...(av?.commitments || []).map((c) => ({ ...c, label: c.source === "interview" ? `${c.stageLabel || "Interview"} - ${c.positionTitle || "Position"}` : "Busy" })),
    ...(tz ? (av?.exceptions || []).map((e) => ({ ...exceptionRange(e, tz), label: e.type === "leave" ? "Leave" : "Blocked" })) : []),
  ];
  const busySegs = busyItems.map((it) => ({ ...it, pos: eventPosition(it, dayStart, startHour, endHour) })).filter((x) => x.pos);

  return (
    <div className="relative h-full flex-1 border-l border-border/40 first:border-l-0" style={HATCH_BG}>
      {freeSegs.map(({ pos, startMs, endMs }, i) => {
        const heightPx = (pos.heightPct / 100) * bodyHeight;
        return (
          <Tooltip
            key={`free-${i}`}
            label={`${person.name} — free ${formatTimeRange(startMs, endMs)}`}
            className="absolute inset-x-0.5 flex flex-col items-start overflow-hidden rounded-sm border bg-card px-1 py-0.5 text-left leading-tight"
            style={{ top: `${pos.topPct}%`, height: `${pos.heightPct}%`, borderColor: person.avatarColor }}
          >
            {heightPx >= MIN_PX_FOR_NAME && (
              <span className="block truncate text-[10px] font-semibold" style={{ color: person.avatarColor }}>
                {person.name}
              </span>
            )}
            {heightPx >= MIN_PX_FOR_TIME && (
              <span className="block truncate text-[9px] text-muted-foreground">{formatTimeRange(startMs, endMs)}</span>
            )}
          </Tooltip>
        );
      })}
      {busySegs.map(({ pos, label, startMs, endMs, status, stageLabel, positionTitle }, i) => (
        <Tooltip
          key={`busy-${i}`}
          label={`${person.name} — ${label} — ${formatTimeRange(startMs, endMs)}${status ? ` — ${status === "pending_confirmation" ? "Awaiting confirmation" : "Booked"}` : ""}`}
          className="absolute inset-x-0.5 z-20 flex-col items-start overflow-hidden rounded-sm px-1 py-0.5 text-[9px] leading-tight text-white"
          style={{ top: `${pos.topPct}%`, height: `${pos.heightPct}%`, minHeight: 3, background: person.avatarColor }}
        >
          <span className="block w-full truncate font-semibold">{person.name}</span>
          <span className="block w-full truncate">{stageLabel || label}</span>
          {positionTitle && <span className="block w-full truncate">{positionTitle}</span>}
          <span className="block w-full truncate">{formatTimeRange(startMs, endMs)}</span>
          {status && <span className="block w-full truncate">{status === "pending_confirmation" ? "Awaiting confirmation" : "Booked"}</span>}
        </Tooltip>
      ))}
    </div>
  );
}
