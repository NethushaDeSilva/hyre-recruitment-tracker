// Scroll-triggered entrance built on anime.js (v4) + IntersectionObserver.
// Attach the returned ref to a container; the first time it scrolls into view its
// direct children fade + spring up with a stagger. Plays ONCE, honours
// prefers-reduced-motion, and never leaves content stranded invisible (a JS hiccup
// or reduced-motion falls back to fully visible). On completion it clears the
// inline styles anime leaves behind, so CSS hover transforms on the same elements
// keep working afterwards.
import { useLayoutEffect, useRef } from "react";
import { animate, stagger, utils, spring } from "animejs";
import { prefersReduced, SPRING } from "@/lib/motion";

// `active` gates setup until the target is actually in the DOM. The homepage shows
// a loading screen first (auth check), during which the revealed sections aren't
// mounted yet — so callers pass `!loading` and setup runs on the render that finally
// mounts the content, not the throwaway loading render.
export function useScrollReveal(active = true, opts = {}) {
  const ref = useRef(null);
  const played = useRef(false);

  useLayoutEffect(() => {
    if (!active || played.current) return;
    const el = ref.current;
    if (!el) return;
    const targets = el.querySelectorAll(opts.selector || ":scope > *");
    if (!targets.length) return;
    if (prefersReduced()) return; // leave everything visible, just don't animate

    // From-state set before paint so nothing flashes at full opacity first.
    try {
      utils.set(targets, { opacity: 0, translateY: opts.distance ?? 24 });
    } catch {
      return; // if the engine isn't available, leave content untouched (visible)
    }

    const strip = () =>
      targets.forEach((t) => {
        t.style.opacity = "";
        t.style.transform = "";
      });

    const reveal = () => {
      if (played.current) return;
      played.current = true;
      try {
        animate(targets, {
          opacity: { to: 1, duration: 520, ease: "out(3)" },
          translateY: { to: 0, ease: spring(opts.spring || SPRING) },
          delay: stagger(opts.stagger ?? 90, { start: opts.start ?? 0 }),
          onComplete: strip,
        });
      } catch {
        strip(); // never leave the section hidden
      }
    };

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            reveal();
            obs.disconnect();
            break;
          }
        }
      },
      { threshold: opts.threshold ?? 0.15, rootMargin: opts.rootMargin ?? "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return ref;
}
