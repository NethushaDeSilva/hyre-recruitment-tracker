// A single accessible button that flips between light and dark mode.
import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { currentTheme, toggleTheme } from "@/lib/theme";

export default function ThemeToggle({ className = "" }) {
  const [theme, setTheme] = useState(currentTheme());
  const dark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(toggleTheme())}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className={`flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground transition-colors hover:bg-secondary ${className}`}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
