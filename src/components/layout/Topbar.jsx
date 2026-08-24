// Clean top bar: menu button (mobile) + section + theme toggle + account menu.
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import UserMenu from "@/components/layout/UserMenu";

export default function Topbar({ onMenu = () => {} }) {
  const { pathname } = useLocation();
  const section =
    pathname.startsWith("/dashboard") ? "Dashboard" :
    pathname.startsWith("/candidates") ? "Candidates" :
    pathname.startsWith("/jobs") ? "Open Roles" :
    pathname.startsWith("/applications") ? "My Applications" :
    pathname.startsWith("/settings") ? "Settings" :
    pathname.startsWith("/profile") ? "Profile" :
    pathname.startsWith("/company") ? "Company profile" :
    pathname.startsWith("/team") ? "Team & permissions" :
    pathname.startsWith("/help") ? "Help & support" :
    "Positions";

  return (
    <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3.5 sm:px-7">
      <div className="flex items-center gap-2.5">
        <button
          onClick={onMenu}
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div className="text-sm font-semibold text-foreground">{section}</div>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
