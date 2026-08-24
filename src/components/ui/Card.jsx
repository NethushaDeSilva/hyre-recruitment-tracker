// Card surface — white, hairline border, soft shadow, rounded.
import { cn } from "@/lib/utils";

export function Card({ className, ...props }) {
  return <div className={cn("rounded-lg border border-border bg-card shadow-card", className)} {...props} />;
}
