// cn(): merge conditional class names and resolve Tailwind conflicts.
// Used by every shadcn/ui component.
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
