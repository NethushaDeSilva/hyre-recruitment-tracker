const key = (uid) => `hyre:desktop-notifications:${uid}`;
export const desktopSupported = () => typeof window !== "undefined" && window.isSecureContext && "Notification" in window;
export const desktopEnabled = (uid) => {
  try { return !!uid && localStorage.getItem(key(uid)) === "on"; } catch { return false; }
};
export function setDesktopEnabled(uid, enabled) {
  localStorage.setItem(key(uid), enabled ? "on" : "off");
  window.dispatchEvent(new Event("hyre-notification-preferences"));
}

// A persistent per-account claim avoids replaying notifications after a refresh.
// Web Locks serializes claims across tabs where available; tags are a fallback.
export async function showDesktopNotification(uid, notification, body, onClick) {
  const show = () => {
    if (!desktopSupported() || !desktopEnabled(uid) || Notification.permission !== "granted") return;
    const seenKey = `hyre:desktop-seen:${uid}`;
    let seen;
    try { seen = JSON.parse(localStorage.getItem(seenKey) || "[]"); } catch { seen = []; }
    if (!Array.isArray(seen)) seen = [];
    if (seen.includes(notification.id)) return;
    const popup = new Notification(notification.title || "Hyre", { body, tag: `${uid}:${notification.id}` });
    try { localStorage.setItem(seenKey, JSON.stringify([...seen, notification.id].slice(-300))); } catch { /* The bell remains authoritative. */ }
    popup.onclick = () => { window.focus(); onClick(); popup.close(); };
    return popup;
  };
  return navigator.locks ? navigator.locks.request(`hyre-notifications:${uid}`, show) : show();
}
