// A compact dropdown that lets you tick MORE THAN ONE option (used for the HR
// board filter — pick several qualifications / experience ranges at once).
// Closes when you click outside. `value` is an array; `onChange` gets the new array.
import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export default function CheckDropdown({ label, options, value = [], onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const toggle = (opt) =>
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground hover:bg-secondary"
      >
        <span className="truncate">
          {label}
          {value.length > 0 && <span className="ml-1 font-bold text-primary">({value.length})</span>}
        </span>
        <ChevronDown size={15} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute z-30 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            {options.map((opt) => {
              const on = value.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground hover:bg-secondary"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
