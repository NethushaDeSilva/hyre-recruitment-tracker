// Wrap any element to make it tilt in 3D toward the mouse. Pure CSS transform
// driven by two CSS variables; the mousemove handler is rAF-throttled so it stays
// smooth. Disabled automatically for users who prefer reduced motion.
import { useRef } from "react";
import "./animations.css";

export default function TiltCard({ children, max = 9, className = "" }) {
  const ref = useRef(null);
  const raf = useRef(0);

  const reduced = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMove = (e) => {
    const el = ref.current;
    if (!el || reduced()) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 … 0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--ry", `${px * max}deg`);
      el.style.setProperty("--rx", `${-py * max}deg`);
    });
  };

  const reset = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div ref={ref} className={`tilt-3d ${className}`} onMouseMove={onMove} onMouseLeave={reset}>
      {children}
    </div>
  );
}
