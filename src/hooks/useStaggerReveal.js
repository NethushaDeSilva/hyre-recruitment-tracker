// Reusable entrance animation built on anime.js (v4). Attach the returned ref to a
// container; its direct children spring + fade in with a stagger the first time
// `active` becomes true. The opacity is tweened (clean fade) while the transform
// is driven by a spring (natural, lightly-overshooting settle). Honours
// prefers-reduced-motion and never flashes (from-state set before paint).
import { useLayoutEffect, useRef } from "react";
import { animate, stagger, utils, spring } from "animejs";
import { prefersReduced, SPRING } from "@/lib/motion";

export function useStaggerReveal(active = true, opts = {}) {
  const ref = useRef(null);
  const played = useRef(false);

  useLayoutEffect(() => {
    if (!active || played.current || !ref.current) return;
    const targets = ref.current.querySelectorAll(opts.selector || ":scope > *");
    if (!targets.length) return;
    played.current = true;
    if (prefersReduced()) return; // leave everything visible, just don't animate

    try {
      utils.set(targets, { opacity: 0, translateY: opts.distance ?? 16, scale: opts.scale ?? 0.98 });
      animate(targets, {
        opacity: { to: 1, duration: 420, ease: "out(2)" },
        translateY: { to: 0, ease: spring(opts.spring || SPRING) },
        scale: { to: 1, ease: spring(opts.spring || SPRING) },
        delay: stagger(opts.stagger ?? 60, { start: opts.start ?? 30 }),
      });
    } catch {
      // never leave content stuck hidden if the animation engine hiccups
      utils.set?.(targets, { opacity: 1, translateY: 0, scale: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return ref;
}
