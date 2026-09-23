// Form field label + inputs used inside modals.
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function Field({ label, error, required, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-semibold text-foreground">
        {label}
        {required && <span className="text-[#DC2626]"> *</span>}
      </span>
      {children}
      {error ? <span className="block text-xs font-medium text-[#DC2626]">{error}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        "w-full rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-[#94A3B8] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }) {
  return (
    <select
      className={cn(
        "w-full appearance-none rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, autoGrow = false, maxGrowHeight = 480, ...props }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (!autoGrow || !ref.current) return;
    const element = ref.current;
    const resize = () => {
      element.style.height = "auto";
      const border = element.offsetHeight - element.clientHeight;
      const height = element.scrollHeight + border;
      element.style.height = `${Math.min(height, maxGrowHeight)}px`;
      element.style.overflowY = height > maxGrowHeight ? "auto" : "hidden";
    };
    resize();
    let width = element.clientWidth;
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (element.clientWidth !== width) { width = element.clientWidth; resize(); }
    }) : null;
    observer?.observe(element);
    return () => observer?.disconnect();
  }, [autoGrow, maxGrowHeight, props.value]);
  return (
    <textarea ref={ref}
      className={cn(
        "w-full resize-none rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-[#94A3B8] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15",
        className
      )}
      {...props}
    />
  );
}
