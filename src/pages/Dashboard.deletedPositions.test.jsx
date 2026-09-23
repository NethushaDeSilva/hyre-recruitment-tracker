import { expect, it, vi } from 'vitest';
import { dashboardMetrics } from './Dashboard';
vi.mock('@/data/store', () => ({}));

it('excludes applications after their positions disappear while preserving hired records', () => {
  const candidates = [{ id: 'a', positionId: 'old', stage: 'applied' },
    ...Array.from({ length: 4 }, (_, i) => ({ id: `h${i}`, positionId: 'old', stage: 'hired' }))];
  const employees = candidates.filter(c => c.stage === 'hired');
  const before = dashboardMetrics([{ id: 'old', status: 'Open' }], candidates, [], employees);
  expect(before.active).toHaveLength(1);
  const after = dashboardMetrics([], candidates, [], employees);
  expect(after.active).toHaveLength(0);
  expect(after.stageCandidates.filter(c => c.stage === 'applied')).toHaveLength(0);
  expect(after.stageCandidates.filter(c => c.stage === 'hired')).toHaveLength(4);
  expect(after.hires).toHaveLength(4);
  expect(dashboardMetrics([{ id: 'new', status: 'Open' }], candidates, [], employees).active).toHaveLength(0);
});
it('counts applications for existing closed positions but excludes deleting and archived positions', () => {
  const positions = [{ id: 'closed', status: 'Closed' }, { id: 'deleting', deleting: true }, { id: 'archived', recordState: 'Deleted' }];
  const candidates = positions.map(p => ({ positionId: p.id, stage: 'screening' }));
  expect(dashboardMetrics(positions, candidates, [], []).active.map(c => c.positionId)).toEqual(['closed']);
});
