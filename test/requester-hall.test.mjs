import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';
import { seedRequesterHall } from '../e2e/requester-hall-fixture.mjs';
import { requesterStatus, requesterTodos, requesterHall, requesterDate } from '../public/requester-hall.js';

function setup(t) {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  t.after(() => server.context.store.close());
  return { ...seedRequesterHall(server), d: server.context.domain, s: server.context.store };
}
test('requester hall groups real work, counts people and keeps cancelled/draft states authoritative', (t) => {
  const { d, org, tasks, pending, household } = setup(t);
  const list = () => d.tasks(org, { kind: 'help', scope: 'mine' });
  const counts = () =>
    requesterTodos(list()).reduce((v, item) => ({ ...v, [item.type]: (v[item.type] || 0) + item.count }), {});
  assert.deepEqual(counts(), { applications: 2, records: 1, other: 2 });
  assert.equal(requesterStatus(d.task(org, tasks[0].id)).group, 'recruiting');
  assert.equal(requesterStatus(d.task(org, tasks[1].id)).label, '待服务');
  d.applicationAction(org, pending[0].app.id, { action: 'accept' });
  assert.equal(counts().applications, 1);
  assert.equal(requesterStatus(d.task(org, tasks[0].id)).group, 'active');
  d.recordAction(org, household.app.id, { action: 'confirm', minutes: 120, recipients: 1 });
  assert.equal(counts().records, undefined);
  assert.equal(requesterStatus(d.task(org, tasks[2].id)).group, 'completed');
  for (const status of ['cancelled', 'draft'])
    assert.equal(requesterStatus({ ...d.task(org, tasks[2].id), status }).group, status);
  assert.notEqual(
    requesterStatus({ status: 'published', applications: [{ status: 'rejected' }], remaining: 1 }).group,
    'completed',
  );
});
test('withdrawal handling is owner-only, persistent and idempotent, with no new credit or map event', (t) => {
  const { d, s, org, withdrawal, tasks, volunteer } = setup(t);
  const ledgerBefore = s.db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count;
  assert.throws(
    () =>
      d.applicationAction(withdrawal.user, withdrawal.app.id, {
        action: 'handle-withdrawal',
        reason: '自己处理',
      }),
    /仅需求方/,
  );
  assert.throws(
    () =>
      d.applicationAction(volunteer(), withdrawal.app.id, {
        action: 'handle-withdrawal',
        reason: '他人处理',
      }),
    /无权访问/,
  );
  assert.throws(
    () => d.applicationAction(org, withdrawal.app.id, { action: 'handle-withdrawal', reason: '' }),
    /不能为空/,
  );
  const result = d.applicationAction(org, withdrawal.app.id, {
    action: 'handle-withdrawal',
    reason: '已联系并完成补招',
  });
  const again = d.applicationAction(org, withdrawal.app.id, {
    action: 'handle-withdrawal',
    reason: '重复处理',
  });
  assert.deepEqual(again.withdrawalHandled, result.withdrawalHandled);
  assert.equal(
    s.all('audit').filter((a) => a.ref === withdrawal.app.id && a.action === 'handle-withdrawal').length,
    1,
  );
  assert.equal(requesterTodos([d.task(org, tasks[3].id)]).length, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count, ledgerBefore);
});
test('time adjustment requires owner review and all other volunteers consent before applying new times', (t) => {
  const { d, s, org, medical, tasks } = setup(t);
  const [first, second] = medical;
  const original = d.task(org, tasks[1].id);
  const requested = s.get('application', first.app.id).changeRequest;
  assert.throws(
    () => d.applicationAction(first.user, first.app.id, { action: 'accept-request-change' }),
    /仅需求方/,
  );
  d.applicationAction(org, first.app.id, { action: 'accept-request-change' });
  const waiting = d.task(org, tasks[1].id);
  assert.equal(waiting.start, original.start);
  assert.equal(waiting.pending.answers[first.app.id], 'accepted');
  assert.equal(waiting.pending.answers[second.app.id], 'pending');
  assert.equal(s.get('application', first.app.id).changeRequest, undefined);
  d.applicationAction(org, first.app.id, { action: 'accept-request-change' });
  assert.equal(
    s.all('audit').filter((a) => a.ref === first.app.id && a.action === 'accept-request-change').length,
    1,
  );
  d.applicationAction(second.user, second.app.id, { action: 'change', answer: 'accept' });
  assert.equal(d.task(org, tasks[1].id).start, requested.start);
  assert.equal(d.task(org, tasks[1].id).hasPendingChange, false);
  assert.equal(requesterTodos([d.task(org, tasks[1].id)]).length, 0);
});
test('time adjustment validation, rejection and cancellation preserve the existing schedule', (t) => {
  const { d, s, org, medical, tasks } = setup(t);
  const [first] = medical;
  const before = d.task(org, tasks[1].id);
  assert.throws(
    () => d.applicationAction(org, first.app.id, { action: 'reject-request-change' }),
    /不能为空/,
  );
  d.applicationAction(org, first.app.id, {
    action: 'reject-request-change',
    reason: '机构当日无法提供该时段',
  });
  assert.equal(d.task(org, tasks[1].id).start, before.start);
  assert.equal(requesterTodos([d.task(org, tasks[1].id)]).length, 0);
  const request = { action: 'request-change', start: before.start, end: before.end, reason: '调整时间' };
  assert.throws(() => d.applicationAction(first.user, first.app.id, request), /原安排相同/);
  assert.throws(
    () =>
      d.applicationAction(first.user, first.app.id, { ...request, start: '2020-01-01', end: '2020-01-02' }),
    /应在未来/,
  );
  assert.throws(
    () =>
      d.applicationAction(first.user, first.app.id, {
        ...request,
        end: new Date(Date.parse(before.start) + 60000).toISOString(),
      }),
    /短于服务时长/,
  );
  d.applicationAction(first.user, first.app.id, {
    ...request,
    start: new Date(Date.parse(before.start) + 3600000).toISOString(),
    end: new Date(Date.parse(before.end) + 3600000).toISOString(),
  });
  d.taskAction(org, tasks[1].id, { action: 'cancel', reason: '需求取消' });
  assert.throws(() => d.applicationAction(org, first.app.id, { action: 'accept-request-change' }), /已失效/);
  assert.equal(requesterTodos([d.task(org, tasks[1].id)]).length, 0);
  assert.equal(s.get('task', tasks[1].id).start, before.start);
});
test('hall escapes data, never renders private details or hardcoded sample counters, and formats Shanghai days', () => {
  const task = {
    id: 'test',
    title: '<img src=x onerror=alert(1)>',
    region: '<script>bad()</script>',
    address: '私人门牌301',
    phone: '13800000000',
    recipient: '老人姓名',
    category: '生活协助',
    status: 'draft',
    capacity: 1,
    applications: [],
  };
  const html = requesterHall({ tasks: [task] });
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script>bad'));
  for (const privateText of [task.address, task.phone, task.recipient])
    assert.ok(!html.includes(privateText));
  assert.ok(!html.includes('requester-count'));
  assert.ok(html.includes('#publish/test'));
  assert.equal(
    requesterDate('2026-09-14T00:30:00+08:00', Date.parse('2026-09-13T23:59:00+08:00')),
    '明日 00:30',
  );
  assert.equal(
    requesterDate('2026-09-13T23:50:00+08:00', Date.parse('2026-09-13T23:59:00+08:00')),
    '今日 23:50',
  );
});
