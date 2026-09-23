import { collection, doc, getDoc, getDocs, runTransaction } from "firebase/firestore";
import { bookingConflict, bookingDescription, BOOKED_STATUSES, timeMs } from "./interviewSchedule.js";
import { interviewNotifications } from "./notifications.js";
import { writeNotifications } from "./notificationPersistence.js";

// Pending requests already reserve their slot. Accepting one adds no occupancy;
// declining releases it to the coordinator without reading another person's data.
export async function respondToOwnInterview(db, interviewId, { accept, actor }) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, "interviews", interviewId);
    const snapshot = await tx.get(ref);
    const previous = snapshot.data();
    if (!previous || previous.interviewerId !== actor?.uid || previous.status !== "pending_confirmation") throw new Error("This request has changed. Refresh and try again.");
    const revisionRef = doc(db, "counters", "interviewSchedule");
    const revision = await tx.get(revisionRef);
    const data = accept ? { status: "confirmed" } : {
      interviewerId: "", status: "needs_attention", requestedAt: null,
      respondedBy: [...(previous.respondedBy || []), { uid: actor.uid, name: actor.name || "", action: "declined", at: Date.now() }],
    };
    tx.set(revisionRef, { next: (revision.data()?.next || 0) + 1 });
    tx.update(ref, data);
    writeNotifications(tx, db, interviewNotifications({ ...previous, ...data, id: interviewId }, previous));
    return { ok: true, status: data.status };
  });
}

// Firestore web transactions cannot query collections. Read the revision BEFORE
// the query, then verify it in the transaction. Every booking writer advances it,
// so concurrent creates/reassignments cannot both pass a stale overlap check.
export async function commitInterviewChanges(db, prepare, positionPatch = null) {
  const revisionRef = doc(db, "counters", "interviewSchedule");
  for (let attempt = 0; attempt < 8; attempt++) {
    const revision = await getDoc(revisionRef);
    const expected = revision.data()?.next || 0;
    const snapshot = await getDocs(collection(db, "interviews"));
    const bookings = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
    const changes = prepare(bookings);
    const changedIds = new Set(changes.map((c) => c.id));
    const effective = bookings.filter((b) => !changedIds.has(b.id));
    for (const change of changes) {
      const previous = bookings.find((b) => b.id === change.id);
      if (change.update && !previous) throw new Error("This interview no longer exists. Refresh and try again.");
      const next = { ...previous, ...change.data, id: change.id };
      if (BOOKED_STATUSES.includes(next.status) && next.interviewerId) {
        if (!Number.isFinite(timeMs(next.scheduledAt)) || !Number.isFinite(next.durationMs) || next.durationMs <= 0) throw new Error("Choose a valid interview time and duration.");
        const conflict = bookingConflict(effective, next);
        if (conflict) throw new Error(`${next.interviewerName || "This person"}: ${bookingDescription(conflict)}. Choose another time or person.`);
      }
      effective.push(next);
    }
    try {
      await runTransaction(db, async (tx) => {
        const current = await tx.get(revisionRef);
        if ((current.data()?.next || 0) !== expected) throw Object.assign(new Error("Schedule changed"), { code: "schedule-changed" });
        const position = positionPatch ? await tx.get(doc(db, "positions", positionPatch.id)) : null;
        tx.set(revisionRef, { next: expected + 1 });
        if (positionPatch) tx.update(doc(db, "positions", positionPatch.id), positionPatch.data);
        if (positionPatch?.notificationsFor) writeNotifications(tx, db, positionPatch.notificationsFor(position.data()));
        for (const change of changes) {
          const ref = doc(db, "interviews", change.id);
          if (change.update) tx.update(ref, change.data);
          else tx.set(ref, change.data);
          const previous = bookings.find((b) => b.id === change.id);
          writeNotifications(tx, db, interviewNotifications({ ...previous, ...change.data, id: change.id }, previous));
        }
      });
      return changes;
    } catch (error) {
      if (error.code === "schedule-changed" || error.code === "aborted") continue;
      if (error.code === "permission-denied" && (await getDoc(revisionRef)).data()?.next !== expected) continue;
      throw error;
    }
  }
  throw new Error("The schedule is being updated. Please try saving again.");
}
