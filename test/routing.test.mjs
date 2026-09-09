import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFits } from '../src/routing.mjs';
test('time budget accounts for scheduled occupancy, both journeys and buffer; missing travel is never zero', () => {
  const t = { minutes: 30, start: '2026-09-10T01:00:00Z', end: '2026-09-10T02:00:00Z' };
  assert.equal(routeFits(t, { minutes: 10, returnMinutes: 10, distance: 2 }, { budget: 90 }), true);
  assert.equal(routeFits(t, { minutes: 10, returnMinutes: 10, distance: 2 }, { budget: 60 }), false);
  assert.equal(routeFits(t, { minutes: null, returnMinutes: null, distance: null }, { budget: 90 }), false);
  assert.equal(routeFits(t, { minutes: 15, returnMinutes: 10, distance: 3 }, { distance: 2 }), false);
  assert.equal(routeFits(t, { minutes: 15, returnMinutes: 10, distance: 3 }, { arrival: 10 }), false);
  assert.equal(routeFits(t, { minutes: 0, returnMinutes: 0, distance: 0 }, { budget: 70 }), true);
});
