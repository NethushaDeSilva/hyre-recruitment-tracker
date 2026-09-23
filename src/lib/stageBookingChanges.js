// Cancel only explicit stage bookings belonging to the edited position.
// Keep the records for history; cancelled slots no longer occupy the calendar.
export function cancelStageBookings(bookings, positionId, ids) {
  return [...new Set(ids)].map(id => {
    const booking = bookings.find(b => b.id === id);
    if (!booking || booking.positionId !== positionId || booking.kind !== 'stage_assignment') {
      throw new Error('This stage interview has changed. Reopen Configure stages and try again.');
    }
    return { id, update: true, data: { status: 'cancelled' } };
  });
}
