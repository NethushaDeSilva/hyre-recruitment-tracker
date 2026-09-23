import { timeMs } from './interviewSchedule.js';
export function screeningTeam(position) {
  const value = position?.stageAssignees?.screening;
  return Array.isArray(value) ? value : value ? [value] : [];
}
export function screeningAuthorization(position, actor, bookings) {
  const team = screeningTeam(position);
  const assignmentIndex = team.findIndex(person => person.uid === actor?.uid);
  if (actor?.role !== 'HR' || !actor?.uid || assignmentIndex < 0) return { ok: false, reason: 'screening-assignment-required', error: 'Only an HR recruiter selected for HR Screening can move this candidate forward. Configure HR Screening first.' };
  const booking = bookings.find(b => b.positionId === position.id && b.kind === 'stage_assignment' && b.stageId === 'screening' && b.interviewerId === actor.uid && b.status === 'confirmed' && timeMs(b.scheduledAt) > 0 && Number.isFinite(b.durationMs) && b.durationMs > 0);
  if (!booking) return { ok: false, reason: 'screening-time-required', error: 'Save an interview date and time for your HR Screening assignment in Configure stages before moving this candidate forward.' };
  return { ok: true, authorization: { assignmentIndex, interviewId: booking.id } };
}
