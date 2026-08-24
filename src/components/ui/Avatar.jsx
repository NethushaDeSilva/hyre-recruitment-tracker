// Avatar: shows the person's photo if they have one, else a coloured circle
// with their initials.
import { initials } from "@/lib/format";

export function Avatar({ name, color = "#1F3A5F", size = 38, src = "", className = "" }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${className}`}
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </div>
  );
}
