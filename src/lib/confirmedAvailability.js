import { materializeSlots } from './availability';
import { currentWeekBoundsMs } from './weeklyAvailability';

export function confirmedAvailabilitySlots(record, now = Date.now()) {
  if (!record?.declaredAt) return [];
  const zone = record.timeZone || 'Asia/Colombo';
  const week = currentWeekBoundsMs(now, zone);
  const savedWeek = currentWeekBoundsMs(record.declaredAt, zone);
  if (savedWeek.fromMs !== week.fromMs) return [];
  return materializeSlots(record, week.fromMs, week.toMs).filter(w => w.startMs > now);
}
