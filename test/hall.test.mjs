import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';
import { seedHall } from '../e2e/hall-fixture.mjs';

test('hall discovery excludes expired, full and changing requests without hiding participation history', () => {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  try {
    const { session, tasks } = seedHall(server);
    const { domain: d, store: s } = server.context;
    const expired = s.get('task', tasks[0].id);
    expired.deadline = new Date(Date.now() - 60000).toISOString();
    s.put('task', expired);
    const full = tasks[1];
    const app = d.apply(session.user, full.id, {});
    d.applicationAction(s.user(full.owner), app.id, { action: 'accept' });
    const changing = s.get('task', tasks[2].id);
    changing.pending = { answers: {}, proposed: {} };
    s.put('task', changing);
    const result = d.tasks(session.user, { kind: 'help', available: '1' });
    assert.ok(!result.some((t) => tasks.slice(0, 3).some((hidden) => hidden.id === t.id)));
    assert.ok(result.some((t) => t.id === tasks[3].id));
    assert.ok(d.tasks(session.user, { kind: 'help', scope: 'mine' }).some((t) => t.id === full.id));
  } finally {
    server.context.store.close();
  }
});

test('hall route data is allowlisted; distance sort preserves unknowns and filtering never treats them as zero', () => {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  try {
    const { session, tasks, routes } = seedHall(server);
    const { domain: d } = server.context;
    assert.equal(d.tasks(session.user, { distance: '3' }).length, 0);
    d.adapters.route = ({ task }) => ({
      ...(routes.get(task.id) || {}),
      secret: 'private-route-provider-value',
    });
    const sorted = d.tasks(session.user, { kind: 'help', sort: 'distance' });
    assert.deepEqual(
      sorted.slice(0, 4).map((t) => t.id),
      [tasks[0], tasks[2], tasks[1], tasks[3]].map((t) => t.id),
    );
    assert.equal(sorted[4].route.distance, null);
    assert.ok(sorted.every((t) => !('secret' in t.route) && !('address' in t)));
    assert.deepEqual(
      d.tasks(session.user, { region: '拱墅区', distance: '3' }).map((t) => t.id),
      [tasks[2].id],
    );
    assert.deepEqual(
      d
        .tasks(session.user, { sort: 'start' })
        .slice(0, 4)
        .map((t) => t.id),
      tasks.map((t) => t.id),
    );
  } finally {
    server.context.store.close();
  }
});
