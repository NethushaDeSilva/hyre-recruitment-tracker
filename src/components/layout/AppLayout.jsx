// The frame every signed-in screen lives in: sidebar + top bar + routed page.
// On desktop the sidebar is a fixed column; on phones/tablets it becomes a
// slide-in drawer opened from the top-bar hamburger.
import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  // Fixed-viewport shell: the frame is exactly the screen height and never scrolls
  // itself — the sidebar and top bar stay put while only <main> scrolls. This keeps
  // each page's own scroll regions (e.g. the pipeline board's left–right scrollbar)
  // pinned on screen instead of being pushed below a growing page.
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMenuOpen(true)} />
        <main className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
