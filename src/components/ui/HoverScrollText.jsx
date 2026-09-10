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
      className={cn("overflow-hidden whitespace-nowrap outline-none", className)}
    >
      <span ref={innerRef} className="inline-block will-change-transform">{text}</span>
    </As>
  );
}
