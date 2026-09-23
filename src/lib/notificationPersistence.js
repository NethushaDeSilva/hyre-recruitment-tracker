import { collection, doc, runTransaction } from "firebase/firestore";
import { reminderDue } from "./notifications.js";

export function writeNotifications(tx, db, notifications) {
  for (const notification of notifications) {
    if (!notification.toUid) continue;
    tx.set(doc(collection(db, "notifications")), { ...notification, read: false, createdAt: new Date() });
  }
}

export async function persistAvailabilityReminder(db, user) {
  if (!user?.uid || !["HR", "Interviewer", "Management"].includes(user.role)) return;
  await runTransaction(db, async (tx) => {
    const profileRef = doc(db, "users", user.uid);
    const profile = await tx.get(profileRef);
    const availability = await tx.get(doc(db, "availability", user.uid));
    if (!profile.exists()) return;
    const day = reminderDue(availability.data(), profile.data().lastAvailabilityReminderDay);
    if (!day) return;
    tx.update(profileRef, { lastAvailabilityReminderDay: day });
    writeNotifications(tx, db, [{ toUid: user.uid, type: "availability_reminder", title: "Update this week's availability", message: "Please fill or refresh your availability for this week so HR can schedule your interviews. Include any days you are unavailable." }]);
  });
}
