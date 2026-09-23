import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { ensureAvailabilityReminder } from "@/data/store";
import { notificationTime } from "@/lib/notifications";
import { showDesktopNotification } from "@/lib/desktopNotifications";

export default function NotificationDelivery({ notifications, onOpen }) {
  const { user } = useAuth();
  const session = useRef({ uid: null, since: Date.now(), seen: new Set(), popups: new Set() });
  const open = useRef(onOpen);
  open.current = onOpen;
  useEffect(() => {
    const state = { uid: user?.uid, since: Date.now(), seen: new Set(), popups: new Set(), active: true };
    session.current = state;
    const remind = () => ensureAvailabilityReminder(user).catch((e) => console.error("Availability reminder:", e));
    remind();
    const timer = setInterval(remind, 60 * 60 * 1000);
    window.addEventListener("focus", remind);
    return () => { state.active = false; state.popups.forEach((p) => p.close()); clearInterval(timer); window.removeEventListener("focus", remind); };
  }, [user?.uid, user?.role]);

  useEffect(() => {
    const state = session.current;
    if (!user?.uid) return;
    for (const n of notifications) {
      if (n.toUid !== user.uid || state.seen.has(n.id)) continue;
      state.seen.add(n.id);
      if (n.read || n.createdAt < state.since) continue;
      const body = n.stageId ? `${n.message}\n${notificationTime(n)}` : n.message;
      showDesktopNotification(user.uid, n, body, () => { if (state.active) open.current(n); })
        .then((popup) => { if (!popup) return; if (state.active) state.popups.add(popup); else popup.close(); })
        .catch((e) => console.warn("Computer notification unavailable:", e));
    }
  }, [notifications, user?.uid]);
  return null;
}
