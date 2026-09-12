import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';
import { seedRequesterAccount } from '../e2e/requester-account-fixture.mjs';
import {
  requesterIssueRecords,
  bookingNeedsRequester,
  requesterBank,
  requesterProfile,
} from '../public/requester-account.js';

function setup(t) {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  t.after(() => server.context.store.close());
  return { ...seedRequesterAccount(server), ...server.context };
}

test('机构发放记录按真实服务汇总，更正和撤销保留单条记录，兑换不减少发放统计', (t) => {
  const { domain: d, store: s, org, people, tasks, bookings } = setup(t);
  const records = (filter) => requesterIssueRecords(d.tasks(org, { scope: 'mine' }), filter);
  assert.equal(d.bank(org).issued, 510);
  assert.equal(records().length, 4);
  assert.equal(records({ mode: 'pending' })[0].volunteer.name, '李小雨');
  assert.equal(d.bank(org).pending, 1080);
  d.recordAction(org, tasks[0].recordId, {
    action: 'correct',
    minutes: 90,
    recipients: 1,
    reason: '按实际完成时长更正',
  });
  assert.equal(records().length, 4);
  assert.equal(records({ task: tasks[0].id })[0].confirmed, 90);
  assert.equal(d.bank(org).issued, 480);
  d.recordAction(org, tasks[2].recordId, { action: 'revoke', reason: '重复登记，撤销此条' });
  assert.equal(records().length, 4);
  assert.equal(records({ task: tasks[2].id })[0].status, 'revoked');
  assert.equal(records({ task: tasks[2].id })[0].confirmed, 0);
  assert.equal(d.bank(org).issued, 390);
  const booking = bookings[1];
  s.put('booking', {
    ...s.get('booking', booking.id),
    start: new Date(Date.now() - 7200000).toISOString(),
    end: new Date(Date.now() - 3600000).toISOString(),
  });
  d.bookingAction(org, booking.id, { action: 'result', minutes: 60, content: '已实际完成兑换服务' });
  d.bookingAction(people[1], booking.id, { action: 'complete' });
  assert.equal(d.account(people[1].id, org.id).used, 60);
  assert.equal(d.bank(org).issued, 390);
  assert.equal(records().length, 4);
  // A UTC evening confirmation belongs to the following Shanghai date.
  s.put('record', { ...s.get('record', tasks[0].recordId), confirmedAt: '2026-09-12T18:00:00.000Z' });
  assert.equal(records({ date: '2026-09-13', task: tasks[0].id }).length, 1);
  assert.equal(records({ date: '2026-09-12', task: tasks[0].id }).length, 0);
  const user = { ...org, name: '<script>机构</script>' };
  const html = requesterBank({ user, bank: d.bank(org), tasks: d.tasks(org, { scope: 'mine' }) });
  assert.ok(html.includes('&lt;script&gt;机构&lt;/script&gt;'));
  assert.ok(!html.includes('测试私人门牌301'));
  assert.ok(!html.includes(people[0].phone));
  assert.ok(
    requesterProfile(user, { places: 1, services: 1 }, d.bank(org)).includes(
      '&lt;script&gt;机构&lt;/script&gt;',
    ),
  );
});

test('机构兑换待处理数区分改约发起方和履约确认方', (t) => {
  const { domain: d, org, people, bookings } = setup(t);
  const needs = (id) =>
    bookingNeedsRequester(
      d.bank(org).bookings.find((b) => b.id === id),
      org.id,
    );
  assert.equal(needs(bookings[0].id), true);
  assert.equal(needs(bookings[1].id), false);
  const start = new Date(Date.now() + 60 * 86400000).toISOString();
  const end = new Date(Date.parse(start) + 3600000).toISOString();
  d.bookingAction(org, bookings[1].id, { action: 'reschedule', start, end, reason: '机构调整时间' });
  assert.equal(needs(bookings[1].id), false);
  d.bookingAction(people[1], bookings[1].id, { action: 'respond', answer: 'decline' });
  d.bookingAction(people[1], bookings[1].id, { action: 'reschedule', start, end, reason: '申请人调整时间' });
  assert.equal(needs(bookings[1].id), true);
  d.bookingAction(org, bookings[1].id, { action: 'respond', answer: 'accept' });
  assert.equal(needs(bookings[1].id), false);
});
