// Small on-brand hover/focus tooltip. Renders the bubble in a portal at the body
// so it's never clipped by scrolling/overflow containers (the pipeline board uses
// overflow-x-auto, which would otherwise cut a normal absolute-positioned tip).
// Position is measured from the trigger on hover, so it always sits centred above.
import { useState, useRef } from "react";
import { createPortal } from "react-dom";

export function Tooltip({ label, children, className = "" }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  const open = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.top, left: r.left + r.width / 2 });
    setShow(true);
  };
  const close = () => setShow(false);

  if (!label) return children; // nothing to explain → render as-is

  return (
    <span
      ref={ref}
      onMouseEnter={open}
      onMouseLeave={close}
      onFocus={open}
      onBlur={close}
      tabIndex={0}
      className={`inline-flex cursor-help outline-none ${className}`}
    >
      {children}
      {show &&
        createPortal(
          <span
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translate(-50%, calc(-100% - 8px))" }}
            className="pointer-events-none z-[300] block max-w-[230px] rounded-lg bg-ink px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-white shadow-pop"
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  );
}
