import { useState } from "react";
import { Bell } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { desktopEnabled, desktopSupported, setDesktopEnabled } from "@/lib/desktopNotifications";

export default function NotificationSettings() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(() => desktopEnabled(user?.uid));
  const [permission, setPermission] = useState(() => desktopSupported() ? Notification.permission : "unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = async () => {
    setBusy(true); setError("");
    try {
      if (enabled) { setDesktopEnabled(user.uid, false); setEnabled(false); return; }
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") { setDesktopEnabled(user.uid, true); setEnabled(true); }
    } catch { setError("Computer notifications couldn't be enabled. Your bell inbox still works."); }
    finally { setBusy(false); }
  };
  return <section id="notifications" className="rounded-lg border border-border bg-card p-5 shadow-card">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold"><Bell size={16} /> Notifications</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your bell inbox is always on.</p>
      </div>
      <Button variant="ghost" onClick={toggle} disabled={busy || (!enabled && ["unsupported", "denied"].includes(permission))}>
        {busy ? "Waiting for permission…" : enabled ? "Turn off computer notifications" : "Enable computer notifications"}
      </Button>
    </div>
    <p className="mt-3 text-sm text-muted-foreground">Computer pop-ups are optional and apply to your account in this browser. They arrive while Hyre is open, including in a background tab. Turning them off does not remove notifications from the bell.</p>
    {user?.role !== "Candidate" && <p className="mt-2 text-sm text-muted-foreground">Availability reminders appear at most once a day while using Hyre, until you update this week's availability.</p>}
    {permission === "denied" && <p className="mt-2 text-sm text-[#B45309]">Notifications are blocked by your browser. Allow them in this site's browser permissions, then reload to enable pop-ups.</p>}
    {permission === "unsupported" && <p className="mt-2 text-sm text-muted-foreground">This browser does not support computer notifications here. Use the bell inbox.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-[#DC2626]">{error}</p>}
  </section>;
}
