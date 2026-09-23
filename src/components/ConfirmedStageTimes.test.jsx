import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import StageAssignmentStep from './StageAssignmentStep';
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
afterEach(() => vi.useRealTimers());
it('shows saved dates in chronological order for every stage and reflects availability changes', () => {
  vi.useFakeTimers(); const now = Date.parse('2026-09-22T04:00Z'); vi.setSystemTime(now);
  const person = { uid: 'p', name: 'Priya' };
  const record = { declaredAt: now, validUntil: now + 7 * 86400000, timeZone: 'Asia/Colombo', slots: [
    { date: '2026-09-25', dayOfWeek: 5, startTime: '15:00', endTime: '16:00' },
    { date: '2026-09-21', dayOfWeek: 1, startTime: '10:00', endTime: '11:00' },
    { date: '2026-09-23', dayOfWeek: 3, startTime: '09:00', endTime: '10:00' },
  ] };
  for (const id of ['screening', 'dept', 'interview', 'final']) {
    const props = { stage: { id, label: id, owner: 'HR' }, staff: [person], selected: [], savedSelected: [], assignments: {}, positions: [], positionId: 'job', bookings: [], pendingSlots: {}, availabilityByUid: { p: record }, q: '', setQ: vi.fn(), onSetPersonSlot: vi.fn(), onClearPersonSlot: vi.fn() };
    let tree; act(() => { tree = create(<StageAssignmentStep {...props} />); });
    act(() => tree.root.findAllByType('button').find(b => b.props['aria-expanded'] !== undefined).props.onClick());
    const content = text(tree.toJSON());
    expect(content.indexOf('23 Sept')).toBeLessThan(content.indexOf('25 Sept'));
    expect(content).not.toContain('28 Sept');
    expect(tree.root.findAllByType('button').filter(b => text(b) === 'Set Interview')).toHaveLength(2);
    act(() => tree.update(<StageAssignmentStep {...props} availabilityByUid={{ p: { ...record, slots: [] } }} />));
    expect(text(tree.toJSON())).toContain('No available times.');
    act(() => tree.unmount());
  }
});
