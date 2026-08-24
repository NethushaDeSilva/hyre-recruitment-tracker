// Persistent left sidebar on desktop; a slide-in drawer on phones/tablets.
import { NavLink, Link } from "react-router-dom";
import { Briefcase, Users, Search, FileText, BadgeCheck, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useHyreData } from "@/data/store";
import { can } from "@/lib/permissions";
import { Avatar } from "@/components/ui/Avatar";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

// Build the nav list for a given role from the permission matrix.
// (Dashboard is Sprint 2 — intentionally not exposed yet.)
function navFor(role) {
  const items = [];
  if (can(role, "viewBoard")) items.push({ to: "/positions", label: "Positions", icon: Briefcase });
  if (can(role, "viewCandidatesTable")) items.push({ to: "/candidates", label: "Candidates", icon: Users });
  if (can(role, "viewEmployees")) items.push({ to: "/employees", label: "Employees", icon: BadgeCheck });
  if (can(role, "apply")) {
    items.push({ to: "/jobs", label: "Open Roles", icon: Search });
    items.push({ to: "/applications", label: "My Applications", icon: FileText });
  }
  return items;
}

export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user } = useAuth();
  const { candidates } = useHyreData();
  const nav = user ? navFor(user.role) : [];

  // A hired candidate is now an employee — the bottom card shows their job role
  // and employee ID instead of the generic "Applicant".
  const hire =
    user && user.role === "Candidate"
      ? (candidates || []).find(
          (c) =>
            c.stage === "hired" &&
            c.employeeId &&
            ((user.uid && c.submittedByUid === user.uid) ||
              (user.email && (c.email || "").toLowerCase() === user.email.toLowerCase()))
        )
      : null;
  const subLabel = hire ? hire.employeeRole || user.title : user?.title;
  // Employee ID to show under the name: a hired candidate's, or a staff member's.
  const cardEmployeeId = hire?.employeeId || user?.employeeId || "";

  return (
    <>
      {/* backdrop (mobile only, when the drawer is open) */}
      {open && <div className="fixed inset-0 z-40 bg-ink/50 lg:hidden" onClick={onClose} aria-hidden="true" />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col justify-between overflow-y-auto border-r border-border bg-card px-4 py-5 transition-transform duration-200 ease-out",
          "lg:static lg:z-auto lg:translate-x-0", // static column on desktop
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="space-y-7">
          <div className="flex items-center justify-between px-2">
            <Link
              to="/"
              onClick={onClose}
              className="flex items-center gap-2.5 rounded-lg transition-opacity hover:opacity-80"
              title="Back to homepage"
            >
              <Logo size={36} />
              <span className="text-xl font-extrabold tracking-tight text-foreground">Hyre</span>
            </Link>
            {/* close button — mobile drawer only */}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary lg:hidden"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          <nav className="space-y-1">
            <div className="px-3 pb-1 text-[11px] font-bold tracking-[0.14em] text-[#94A3B8]">MENU</div>
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium transition-colors",
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>

        {user && (
          <Link
            to="/profile"
            onClick={onClose}
            className="flex items-center gap-2.5 rounded-xl bg-background px-2 py-2 transition-colors hover:bg-secondary"
            title="Your profile"
          >
            <Avatar name={user.name} color={user.avatarColor} src={user.photoURL} size={36} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground">{user.name}</div>
              <div className="truncate text-xs text-muted-foreground">{subLabel}</div>
              {cardEmployeeId && (
                <div className="truncate font-mono text-[11px] font-bold tracking-wide text-[#15803D]">{cardEmployeeId}</div>
              )}
            </div>
          </Link>
        )}
      </aside>
    </>
  );
}
