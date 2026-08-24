// Light / dark theme control. The actual class is applied as early as possible
// by an inline script in index.html (to avoid a flash); this module lets React
// read and toggle it, persisting the choice to localStorage.
const KEY = "hiree-theme";

export function currentTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

let animTimer;

export function applyTheme(theme) {
  const dark = theme === "dark";
  const root = document.documentElement;
  // Turn on a short-lived global colour transition so the whole system eases
  // between light and dark instead of snapping. The class is removed once the
  // fade finishes so it never lingers on hovers or other component animations.
  root.classList.add("theme-anim");
  clearTimeout(animTimer);
  animTimer = setTimeout(() => root.classList.remove("theme-anim"), 650);
  root.classList.toggle("dark", dark);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
  // Let interested UI (e.g. the homepage bulb intro) react to the change.
  try {
    window.dispatchEvent(new CustomEvent("hiree-theme-change", { detail: theme }));
  } catch {
    /* ignore */
  }
  return theme;
}

export function toggleTheme() {
  return applyTheme(currentTheme() === "dark" ? "light" : "dark");
}
