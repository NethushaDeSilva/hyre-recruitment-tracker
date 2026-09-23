import { expect, it } from 'vitest';
import { cancelStageBookings } from './stageBookingChanges';
import { bookingConflict } from './interviewSchedule';
it('cancels only requested stage bookings and releases their occupied time', () => {
  const booking = { id: 'b', positionId: 'p', kind: 'stage_assignment', interviewerId: 'hr', status: 'confirmed', scheduledAt: 1000, durationMs: 5000 };
  const changes = cancelStageBookings([booking], 'p', ['b', 'b']);
  expect(changes).toEqual([{ id: 'b', update: true, data: { status: 'cancelled' } }]);
  expect(bookingConflict([{ ...booking, ...changes[0].data }], { ...booking, id: "new" })).toBeUndefined();
  expect(booking.status).toBe('confirmed');
});
it('cannot cancel another position or a candidate interview', () => {
  expect(() => cancelStageBookings([{ id: 'b', positionId: 'other', kind: 'stage_assignment' }], 'p', ['b'])).toThrow();
  expect(() => cancelStageBookings([{ id: 'b', positionId: 'p', kind: 'candidate_interview' }], 'p', ['b'])).toThrow();
});
