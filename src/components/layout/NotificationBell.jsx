// In-app notifications — the replacement for "someone should really tell them
// this" living only in a chat thread. A rejected candidate hears it here
// (WS1); staff pings (stage change, feedback requested, offer response,
// @mentions — WS6) land in the same inbox as they're added.
import { useEffect, useState } from "react";
import { Bell, Check } from "lucide-react";
import { useHyreData, markNotificationRead } from "@/data/store";
import { formatDate } from "@/lib/format";

export default function NotificationBell() {
  const { notifications } = useHyreData();
  const [open, setOpen] = useState(false);
  const list = notifications || [];
  const unread = list.filter((n) => !n.read);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);
  const markAllRead = () => unread.forEach((n) => markNotificationRead(n.id));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Notifications"
      >
        <Bell size={18} />
        {unread.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#DC2626] px-1 text-[9px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} aria-hidden="true" />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg" role="menu">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-sm font-bold text-foreground">Notifications</span>
              {unread.length > 0 && (
                <button onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                  <Check size={12} /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto p-1.5">
              {list.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
              ) : (
                list.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markNotificationRead(n.id)}
                    className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary ${!n.read ? "bg-primary/[0.05]" : ""}`}
                  >
                    <div className="flex w-full items-center gap-2">
                      {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <span className="text-[13px] text-foreground">{n.message}</span>
                    </div>
                    <span className="pl-3.5 text-[11px] text-muted-foreground">{formatDate(n.createdAt)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
