import { timeMs } from "./interviewSchedule.js";

export function notificationTime(notification) {
  const start = timeMs(notification.scheduledAt);
  if (!start || !Number.isFinite(start)) return "Time not scheduled yet";
  const end = start + (notification.durationMs || 3600000);
  const date = new Date(start).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const time = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date} · ${time(start)}–${time(end)}`;
}

export function interviewNotifications(next, previous = null) {
  if (!["pending_confirmation", "confirmed", "needs_attention"].includes(next.status)) return [];
  if (previous && previous.interviewerId === next.interviewerId && previous.status === next.status && timeMs(previous.scheduledAt) === timeMs(next.scheduledAt) && previous.durationMs === next.durationMs) return [];
  const title = next.positionTitle || next.positionId;
  const stage = next.stageLabel || next.stageId;
  const person = next.rankedCandidates?.find((p) => p.uid === next.interviewerId)?.name || next.interviewerName || "The selected team member";
  const context = {
    positionId: next.positionId, positionTitle: title, stageId: next.stageId, stageLabel: stage,
    interviewId: next.id, candidateId: next.applicationId || "",
    scheduledAt: next.scheduledAt, durationMs: next.durationMs, interviewerName: person,
  };
  const recipients = new Set([next.interviewerId, next.createdByUid].filter(Boolean));
  return [...recipients].map((uid) => {
    const requested = uid === next.interviewerId && next.status === "pending_confirmation";
    const message = next.status === "needs_attention" ? `An interviewer is needed for ${title} — ${stage}.`
      : `${uid === next.interviewerId ? "You are" : `${person} is`} ${next.status === "confirmed" ? "booked" : "requested"} for ${title} — ${stage}.${next.candidateName ? ` Candidate: ${next.candidateName}.` : ""}`;
    return { ...context, toUid: uid, type: requested ? "interview_request" : "interview_assignment", title: next.status === "needs_attention" ? "Interview needs attention" : requested ? "Interview request" : "Interview assignment", message };
  });
}

export function teamNotifications(position, stageAssignees, stageMeta, scheduled = []) {
  const notifications = [];
  for (const [stageId, team] of Object.entries(stageAssignees)) {
    const old = position.stageAssignees?.[stageId];
    const oldIds = new Set((Array.isArray(old) ? old : old ? [old] : []).map((p) => p.uid));
    for (const person of team) {
      if (oldIds.has(person.uid) || scheduled.some((s) => s.stageId === stageId && s.interviewerId === person.uid)) continue;
      const stageLabel = stageMeta[stageId]?.label || stageId;
      notifications.push({ toUid: person.uid, type: "stage_assignment", title: "Stage assignment", positionId: position.id, positionTitle: position.title, stageId, stageLabel,
        message: `You are assigned to ${position.title} — ${stageLabel}.`, scheduledAt: null, durationMs: 0 });
    }
  }
  return notifications;
}

export function hireNotification({ uid, employeeId, title, company }) {
  return { toUid: uid, type: "hired", title: "Congratulations — you’re hired!", message: `You have been successfully hired as ${title} at ${company}. Welcome to the team!`, employeeId, positionTitle: title, company };
}

export function reminderDue(availability, lastDay, now = Date.now()) {
  const date = new Date(now);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  if (day === lastDay) return null;
  // Availability is an upcoming seven-day template. An explicitly saved empty
  // template means unavailable, and must not cause daily reminders to continue.
  const filled = availability && timeMs(availability.declaredAt) > now - 7 * 86400000 && timeMs(availability.validUntil) > now;
  return filled ? null : day;
}

export function notificationPath(notification, role) {
  if (["availability_request", "availability_reminder"].includes(notification.type)) return role === "Candidate" ? "/settings" : "/availability";
  if (notification.type === "hired") return "/profile";
  if (role === "Candidate") return "/applications";
  return notification.positionId ? `/positions/${encodeURIComponent(notification.positionId)}` : "/settings";
}
