// Button — three variants matching the Hyre design system.
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  ghost: "bg-card text-foreground border border-border hover:bg-background",
  subtle: "bg-secondary text-foreground hover:brightness-[0.97]",
  accent: "bg-gold text-black hover:brightness-95", // brand yellow CTA
  danger: "bg-red-600 text-white hover:bg-red-700", // destructive confirm
};

export function Button({ variant = "primary", className, children, ...props }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
