// Simple centred modal with a dim backdrop. Click outside or the ✕ to close.
// Springs in (anime.js v4) with a soft pop, respecting reduced motion.
import { useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";
import { animate, utils, spring } from "animejs";
import { prefersReduced, SPRING_POP } from "@/lib/motion";

export function Modal({ open, onClose, title, subtitle, children, footer, width = 480 }) {
  const panelRef = useRef(null);
  const backdropRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || prefersReduced()) return;
    try {
      if (backdropRef.current) {
        utils.set(backdropRef.current, { opacity: 0 });
        animate(backdropRef.current, { opacity: 1, duration: 240, ease: "out(2)" });
      }
      if (panelRef.current) {
        utils.set(panelRef.current, { opacity: 0, scale: 0.9, translateY: 12 });
        animate(panelRef.current, {
          opacity: { to: 1, duration: 220, ease: "out(2)" },
          scale: { to: 1, ease: spring(SPRING_POP) },
          translateY: { to: 0, ease: spring(SPRING_POP) },
        });
      }
    } catch {
      // never leave the modal stuck invisible
      utils.set?.(backdropRef.current, { opacity: 1 });
      utils.set?.(panelRef.current, { opacity: 1, scale: 1, translateY: 0 });
    }
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div ref={backdropRef} className="absolute inset-0 bg-ink/50" onClick={onClose} />
      <div ref={panelRef} className="relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-card p-4 sm:p-7 shadow-pop" style={{ maxWidth: width }}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-extrabold text-foreground">{title}</h3>
            {subtitle && <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground hover:bg-[#E5EBF3]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2.5">{footer}</div>}
      </div>
    </div>
  );
}
