// Small display helpers.
export function formatDate(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// "Updated 2 hours ago" / "Updated 16 days ago" — WS8 §8.5's freshness copy,
// shared between the self-declare screen and the calendar legend.
export function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function initials(name = "") {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// A candidate's display name: their own name if set, otherwise the local part
// of their email (e.g. "sam.wilson@x.com" -> "sam.wilson"). Purely a display
// stand-in for candidates who applied before CV parsing (WS4) could fill in a
// real name — never written back to the candidate record.
export function displayName(c) {
  const name = (c?.name || "").trim();
  if (name) return name;
  const email = c?.email || "";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email || "Unnamed applicant";
}
