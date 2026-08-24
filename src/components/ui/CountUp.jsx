// A number that counts up to its value with anime.js (v4). Re-animates smoothly
// from whatever's currently shown whenever `value` changes. Reduced-motion safe.
import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { prefersReduced } from "@/lib/motion";

export function CountUp({ value = 0, duration = 900, className }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = Number(value) || 0;
    if (prefersReduced()) { el.textContent = String(target); return; }
    const state = { n: parseInt(el.textContent, 10) || 0 };
    const anim = animate(state, {
      n: target,
      duration,
      ease: "out(3)",
      onUpdate: () => { el.textContent = String(Math.round(state.n)); },
    });
    return () => anim.pause();
  }, [value, duration]);

  return <span ref={ref} className={className}>0</span>;
}
