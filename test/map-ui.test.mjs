import test from 'node:test';
import assert from 'node:assert/strict';
import { availableNeeds } from '../public/map-ui.js';

test('map only recommends open, unexpired needs with capacity and no pending or active participation', () => {
  const at = Date.parse('2026-09-10T08:00:00Z');
  const t = {
    id: 'eligible',
    status: 'published',
    remaining: 1,
    start: '2026-09-11T08:00:00Z',
    deadline: '2026-09-11T07:00:00Z',
  };
  const invalid = [
    { remaining: 0 },
    { status: 'paused' },
    { status: 'cancelled' },
    { deadline: '2026-09-10T07:00:00Z' },
    { start: '2026-09-10T07:00:00Z' },
    ...['pending', 'accepted', 'checked_in', 'submitted', 'disputed', 'confirmed'].map((status) => ({
      application: { status },
    })),
  ].map((patch, i) => ({ ...t, ...patch, id: String(i) }));
  assert.deepEqual(
    availableNeeds([t, ...invalid], at).map((r) => r.id),
    ['eligible'],
  );
  assert.equal(availableNeeds([{ ...t, application: { status: 'withdrawn' } }], at).length, 1);
});
