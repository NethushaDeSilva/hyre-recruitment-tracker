import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Dashboard from './Dashboard';
const mocks = vi.hoisted(() => ({ callback: null, records: {} }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'hr', role: 'HR' } }) }));
vi.mock('@/data/store', () => ({
  useHyreData: () => ({ positions: [], candidates: [], employees: [] }),
  subscribeInterviewBookings: cb => { cb([]); return () => {}; },
  listStaff: async () => ['Available person', 'Empty slots', 'Expired person', 'Missing person'].map(name => ({ uid: name, name, role: 'Interviewer' })),
  subscribeAvailabilityRecords: (_ids, cb) => { mocks.callback = cb; cb(mocks.records); return () => {}; },
  respondToInterviewRequest: vi.fn(),
}));
afterEach(() => vi.useRealTimers());
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
it('shows only upcoming confirmed availability with a green label and reacts to removal', async () => {
  vi.useFakeTimers(); const now = Date.parse('2026-09-22T04:00Z'); vi.setSystemTime(now);
  const valid = { declaredAt: now, validUntil: now + 7 * 86400000, timeZone: 'Asia/Colombo', slots: [{ dayOfWeek: 3, date: '2026-09-23', startTime: '09:00', endTime: '10:00' }] };
  mocks.records = { 'Available person': valid, 'Empty slots': { ...valid, slots: [] }, 'Expired person': { ...valid, declaredAt: now - 7 * 86400000 } };
  let tree; await act(async () => { tree = create(<MemoryRouter><Dashboard /></MemoryRouter>); });
  const content = text(tree.toJSON());
  expect(content).toContain('Available person');
  for (const name of ['Empty slots', 'Expired person', 'Missing person']) expect(content).not.toContain(name);
  const label = tree.root.findAllByType('span').find(n => text(n) === 'Availability updated');
  expect(label.props.className).toContain('bg-green-100');
  act(() => mocks.callback({}));
  expect(text(tree.toJSON())).not.toContain('Available person');
  expect(text(tree.toJSON())).toContain('No upcoming availability has been submitted.');
  act(() => tree.unmount());
});
