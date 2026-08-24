// The account menu in the top-right. A company-style dropdown: an identity
// header (name, role · company, a verified badge), the navigation items, then —
// under a divider — sign out, so leaving takes a deliberate action.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { User, Building2, Users, Settings, LifeBuoy, LogOut, ChevronDown, BadgeCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useHyreData } from "@/data/store";
import { Avatar } from "@/components/ui/Avatar";
import { COMPANY } from "@/lib/company";

// The verified line under the name, tailored to the role.
function standing(role) {
  switch (role) {
    case "HR": return { text: "Verified recruiter", verified: true };
    case "Interviewer": return { text: "Verified interviewer", verified: true };
    case "Management": return { text: "Verified administrator", verified: true };
    default: return { text: "Applicant account", verified: false };
  }
}

export default function UserMenu() {
  const { user, logout } = useAuth();
  const { candidates } = useHyreData();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!user) return null;
  const close = () => setOpen(false);
  const isStaff = user.role !== "Candidate";

  // A candidate who's been hired becomes an EMPLOYEE — their menu shows their
  // job role and employee ID instead of the generic "Applicant account".
  const hire = isStaff
    ? null
    : (candidates || []).find(
        (c) =>
          c.stage === "hired" &&
          c.employeeId &&
          ((user.uid && c.submittedByUid === user.uid) ||
            (user.email && (c.email || "").toLowerCase() === user.email.toLowerCase()))
      );
  const subtitle = hire?.employeeRole || user.title;
  const badge = hire ? { text: hire.employeeId, verified: true, mono: true } : standing(user.role);

  // Company/team items are internal — staff only. Everyone gets the rest.
  const items = [
    { to: "/profile", label: "My profile", icon: User },
    isStaff && { to: "/company", label: "Company profile", icon: Building2 },
    isStaff && { to: "/team", label: "Team & permissions", icon: Users },
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/help", label: "Help & support", icon: LifeBuoy },
  ].filter(Boolean);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account menu"
      >
        <Avatar name={user.name} color={user.avatarColor} src={user.photoURL} size={36} />
        <ChevronDown size={15} className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg" role="menu">
            {/* identity */}
            <div className="flex items-start gap-3 border-b border-border px-4 py-3.5">
              <Avatar name={user.name} color={user.avatarColor} src={user.photoURL} size={42} />
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-foreground">{user.name}</div>
                <div className="truncate text-xs text-muted-foreground">{subtitle} · {COMPANY.name}</div>
                <div className={`mt-1 flex items-center gap-1 text-xs font-semibold ${badge.verified ? "text-[#16A34A]" : "text-muted-foreground"} ${badge.mono ? "font-mono tracking-wide" : ""}`}>
                  {badge.verified && <BadgeCheck size={13} strokeWidth={2.5} />} {badge.text}
                </div>
                {/* staff carry an employee ID too (hired candidates show it as the badge above) */}
                {!hire && user.employeeId && (
                  <div className="mt-0.5 truncate font-mono text-[11px] font-bold tracking-wide text-[#15803D]">{user.employeeId}</div>
                )}
              </div>
            </div>

            {/* navigation */}
            <div className="p-1.5">
              {items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={close}
                  role="menuitem"
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                >
                  <Icon size={16} className="text-muted-foreground" /> {label}
                </Link>
              ))}
            </div>

            {/* sign out — under its own divider line */}
            <div className="border-t border-border p-1.5">
              <button
                onClick={() => { close(); logout(); }}
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#DC2626] transition-colors hover:bg-[#FBE9E9]"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
