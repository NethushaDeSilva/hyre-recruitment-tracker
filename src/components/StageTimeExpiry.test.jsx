import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import StageAssignmentStep from './StageAssignmentStep';

afterEach(() => vi.useRealTimers());
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
it('expires past days and newly started slots across every stage and existing/new positions without reopening', () => {
  vi.useFakeTimers();
  for (const positionId of ['existing-position', 'new-position']) {
    for (const [id, role] of [['screening', 'HR'], ['dept', 'Interviewer'], ['interview', 'Interviewer'], ['interview2', 'Interviewer'], ['final', 'Management'], ['custom_stage', 'Management']]) {
      const now = Date.parse('2026-09-22T03:29:30Z'); // Tuesday, 08:59:30 Colombo
      vi.setSystemTime(now);
      const person = { uid: role, name: role, role };
      const record = { timeZone: 'Asia/Colombo', declaredAt: now, validUntil: now + 7 * 86400000, slots: [
        { date: '2026-09-20', dayOfWeek: 0, startTime: '09:00', endTime: '10:00' },
        { date: '2026-09-21', dayOfWeek: 1, startTime: '09:00', endTime: '10:00' },
        { date: '2026-09-22', dayOfWeek: 2, startTime: '09:00', endTime: '10:00' },
        { date: '2026-09-23', dayOfWeek: 3, startTime: '09:00', endTime: '10:00' },
      ] };
      const props = { positionId, stage: { id, label: id, owner: role }, staff: [person], selected: [], savedSelected: [], assignments: {}, positions: [], bookings: [], pendingSlots: {}, availabilityByUid: { [role]: record }, q: '', setQ: vi.fn(), onSetPersonSlot: vi.fn(), onClearPersonSlot: vi.fn() };
      let tree; act(() => { tree = create(<StageAssignmentStep {...props} />); });
      act(() => tree.root.findAllByType('button').find(b => b.props['aria-expanded'] !== undefined).props.onClick());
      const choices = () => tree.root.findAllByType('button').filter(b => text(b) === 'Set Interview');
      expect(choices()).toHaveLength(2);
      expect(text(tree.toJSON())).not.toContain('20 Sept');
      expect(text(tree.toJSON())).not.toContain('21 Sept');
      act(() => vi.advanceTimersByTime(30000));
      expect(choices()).toHaveLength(1);
      expect(text(tree.toJSON())).toContain('23 Sept');
      act(() => tree.unmount());
      expect(vi.getTimerCount()).toBe(0);
    }
  }
});
