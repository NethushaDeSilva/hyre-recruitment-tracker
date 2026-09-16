// Truncated text that slides sideways on hover to reveal what "…" cut off,
// instead of relying on a native title="" tooltip that most people never
// discover. The pattern from track-title marquees on music players — familiar,
// and it keeps the full content one hover away instead of hidden.
//
// Only ever animates when the content actually overflows its own box; text
// that already fits never moves. Falls back to a plain title="" tooltip under
// prefers-reduced-motion, since the whole mechanism IS motion.
import { useLayoutEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { prefersReduced } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function HoverScrollText({ text, className, as: As = "div" }) {
  const boxRef = useRef(null);
  const innerRef = useRef(null);
  const animRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  const reduced = prefersReduced();

  useLayoutEffect(() => {
    const box = boxRef.current, inner = innerRef.current;
    if (!box || !inner) return;
    const measure = () => setOverflowing(inner.scrollWidth - box.clientWidth > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text]);

  const handleEnter = () => {
    if (reduced || !overflowing) return;
    const box = boxRef.current, inner = innerRef.current;
    if (!box || !inner) return;
    const distance = inner.scrollWidth - box.clientWidth;
    animRef.current?.pause();
    // Slower for longer overflow — a natural glide, not a snap, so the reader
    // can actually follow the reveal instead of it flashing past.
    animRef.current = animate(inner, { translateX: -distance, duration: Math.min(4000, Math.max(500, distance * 12)), ease: "linear" });
  };
  const handleLeave = () => {
    if (!innerRef.current) return;
    animRef.current?.pause();
    animRef.current = animate(innerRef.current, { translateX: 0, duration: 260, ease: "out(2)" });
  };

  return (
    <As
      ref={boxRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      tabIndex={overflowing ? 0 : undefined}
      title={reduced && overflowing ? text : undefined}
      className={cn(
        "relative overflow-hidden whitespace-nowrap outline-none",
        // Named group (not the bare "group" convention) so this never collides
        // with an ancestor row/card that also uses group-hover for its own
        // reason -- only fades for the reveal THIS instance triggers.
        overflowing && !reduced && "group/hst",
        className
      )}
    >
      <span ref={innerRef} className="inline-block will-change-transform">{text}</span>
      {/* A hard clip with no ellipsis reads as broken, not truncated. Purely
          a visible affordance -- doesn't touch the scroll-reveal mechanism
          above. Fades out during the hover/focus reveal (the slide already
          shows the full text then); stays put under prefers-reduced-motion,
          where hover never reveals anything to make way for it. */}
      {overflowing && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 flex items-center",
            !reduced && "transition-opacity duration-150 group-hover/hst:opacity-0 group-focus-within/hst:opacity-0"
          )}
        >
          …
        </span>
      )}
    </As>
  );
}
