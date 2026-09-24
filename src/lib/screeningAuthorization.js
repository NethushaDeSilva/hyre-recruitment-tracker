import { timeMs } from './interviewSchedule.js';
import { assigneesFor, canActOnStageFor, stageLabelOf } from './stages.js';

/** The team HR assigned to a stage. (Kept as `screeningTeam` for existing callers.) */
export function screeningTeam(position) {
  return assigneesFor(position, 'screening');
}

/**
 * May `actor` move/reject a candidate sitting in `stageId` of `position`?
 *
 * TWO conditions, both required, for EVERY configurable stage — not just HR
 * Screening, which is the only one that used to demand the second:
 *   1. HR assigned this actor to this stage on this position
 *      (canActOnStageFor — assignment is the only authority; Management has
 *      no exemption and an unassigned stage is closed to everyone).
 *   2. That actor has a CONFIRMED interview booking for this stage, with a
 *      real date and duration. "Assigned but never scheduled" is not enough:
 *      the stage exists to be interviewed, so a stage with no time booked
 *      cannot be passed by anyone.
 *
 * @returns {{ok:true, authorization:{stageId,interviewId,assignmentIndex}} | {ok:false, reason, error}}
 */
export function stageAuthorization(position, actor, bookings, stageId) {
  const label = stageLabelOf(stageId);
  const team = assigneesFor(position, stageId);
  if (!team.length) {
    return {
      ok: false,
      reason: 'stage-assignment-required',
      error: `No one is assigned to ${label} on this position. HR must configure the stage team before any candidate can move past it.`,
    };
  }
  if (!canActOnStageFor(actor, position, stageId)) {
    return {
      ok: false,
      reason: 'stage-assignment-required',
      error: `Only the person assigned to ${label} can move this candidate forward.`,
    };
  }
  const booking = (bookings || []).find(b =>
    b.positionId === position?.id
    && b.kind === 'stage_assignment'
    && b.stageId === stageId
    && b.interviewerId === actor?.uid
    && b.status === 'confirmed'
    && timeMs(b.scheduledAt) > 0
    && Number.isFinite(b.durationMs) && b.durationMs > 0);
  if (!booking) {
    return {
      ok: false,
      reason: 'stage-time-required',
      error: `Save an interview date and time for your ${label} assignment in Configure stages before moving this candidate forward.`,
    };
  }
  const assignmentIndex = team.findIndex(person => person.uid === actor?.uid);
  return { ok: true, authorization: { stageId, assignmentIndex, interviewId: booking.id } };
}

/**
 * HR Screening's case of the above. Kept as its own export because the rest of
 * the app (and the Firestore rules' screeningPermit) already name it — the
 * behaviour is unchanged, it is just no longer the ONLY stage that checks a
 * booking. Reasons stay `screening-*` so existing callers/tests keep matching.
 */
export function screeningAuthorization(position, actor, bookings) {
  const result = stageAuthorization(position, actor, bookings, 'screening');
  if (result.ok) return result;
  return { ...result, reason: result.reason === 'stage-time-required' ? 'screening-time-required' : 'screening-assignment-required' };
}
