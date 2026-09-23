import { afterEach, expect, it, vi } from 'vitest';
import { buildLegacyAvailabilityDoc, emptyWeek } from './weeklyAvailability';
import { confirmedAvailabilitySlots } from './confirmedAvailability';
import { materializeSlots } from './availability';

afterEach(() => vi.useRealTimers());
it('uses the saved current-week dates, sorted by date and time, without inventing next Monday', () => {
  vi.useFakeTimers();
  const now = Date.parse('2026-09-22T04:00:00Z');
  vi.setSystemTime(now);
  const days = emptyWeek();
  days.mon.available = [{ start: '09:00', end: '10:00' }];
  days.wed.available = [{ start: '15:00', end: '16:00' }, { start: '09:00', end: '10:00' }];
  days.fri.available = [{ start: '11:00', end: '12:00' }];
  const record = { ...buildLegacyAvailabilityDoc(days, { now, validityMs: 14 * 86400000 }), declaredAt: now };
  const slots = confirmedAvailabilitySlots(record, now);
  expect(slots.map(s => new Date(s.startMs).toISOString())).toEqual([
    '2026-09-23T03:30:00.000Z', '2026-09-23T09:30:00.000Z', '2026-09-25T05:30:00.000Z',
  ]);
  expect(materializeSlots(record, Date.parse('2026-09-27T00:00Z'), Date.parse('2026-10-04T00:00Z'))).toEqual([]);
  expect(confirmedAvailabilitySlots(record, Date.parse('2026-09-28T00:00Z'))).toEqual([]);
});
it('anchors legacy weekday records to their declaration week and respects removed dates', () => {
  vi.useFakeTimers(); const now = Date.parse('2026-09-22T04:00Z'); vi.setSystemTime(now);
  const record = { timeZone: 'Asia/Colombo', declaredAt: now, validUntil: now + 14 * 86400000,
    slots: [{ dayOfWeek: 1, startTime: '09:00', endTime: '10:00' }, { dayOfWeek: 3, startTime: '09:00', endTime: '10:00' }], exceptions: [{ date: '2026-09-23' }] };
  expect(confirmedAvailabilitySlots(record, now)).toEqual([]);
  expect(confirmedAvailabilitySlots({ ...record, declaredAt: now - 7 * 86400000 }, now)).toEqual([]);
});
