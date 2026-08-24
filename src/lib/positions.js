// Every position carries a mandatory auto-close date (`closesAt`, in ms). The moment
// that date passes, the vacancy is CLOSED — even before a staff session has written
// the change back to Firestore. This helper computes the EFFECTIVE status so every
// surface (candidate portal, positions board, the apply guard) treats an expired
// vacancy as closed immediately and identically. There is no reopening: once a
// position is Closed it stays Closed.
export function effectiveStatus(pos, now = Date.now()) {
  if (!pos) return "Closed";
  if (pos.status === "Open" && pos.closesAt && pos.closesAt <= now) return "Closed";
  return pos.status || "Open";
}

// True only if the position is genuinely open for applications right now.
export const isOpenNow = (pos, now = Date.now()) => effectiveStatus(pos, now) === "Open";
