// Shared motion primitives for the anime.js (v4) animations across Hyre, so every
// entrance feels like one system. Springs give a natural, lightly-overshooting
// settle that reads as "premium" without being bouncy or slow.
export const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Tuned spring feels (stiffness/damping) — used for transform properties.
export const SPRING = { stiffness: 120, damping: 15 };      // list/card reveals
export const SPRING_POP = { stiffness: 150, damping: 15 };  // modal / focal pops
export const SPRING_SOFT = { stiffness: 90, damping: 15 };  // large hero elements
