import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';
import { seedBank } from '../e2e/bank-fixture.mjs';
import { bankOffers, bankDate } from '../public/bank.js';

test('bank uses real confirmed records; cancellation and partial completion release once and preserve contribution', (t) => {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  t.after(() => server.context.store.close());
  const c = seedBank(server),
    { domain: d } = server.context,
    vol = c.session.user;
  const a = d.bank(vol).accounts.find((a) => a.orgId === c.org.id);
  assert.equal(a.available, 96 * 60);
  assert.equal(a.pending, 8 * 60);
  assert.equal(a.held, 12 * 60);
  assert.equal(a.used, 68 * 60);
  assert.equal(a.contributed, 176 * 60);
  const offers = d.tasks(vol, { kind: 'redeem' });
  assert.equal(bankOffers(offers, { org: c.org.id }).length, 4);
  assert.equal(bankOffers(offers, { minutes: '90', org: c.org.id })[0].title, '陪同散步');
  assert.equal(bankOffers(offers, { date: bankDate(c.tasks[1].start) })[0].title, '陪同就医');
  assert.equal(bankOffers(offers, { sort: 'remaining' })[0].title, '居家清洁整理');
  assert.throws(() => d.book(vol, c.tasks[4].id, c.consent), /对应机构可用时间不足/);
  d.bookingAction(vol, c.held.id, { action: 'cancel', reason: '取消测试' });
  d.bookingAction(vol, c.held.id, { action: 'cancel', reason: '重复取消测试' });
  assert.equal(d.bank(vol).releases.length, 1);
  assert.equal(d.bank(vol).releases[0].minutes, 12 * 60);
  const task = c.makeTask(c.org);
  const b = c.finish(task, 60);
  d.bookingAction(vol, b.id, { action: 'complete' });
  assert.equal(d.bank(vol).releases.length, 2);
  assert.equal(d.bank(vol).releases.find((r) => r.target === `booking/${b.id}`).minutes, 60);
  assert.equal(d.account(vol.id, c.org.id).contributed, 176 * 60);
  assert.equal(d.bank(c.other).releases.length, 0);
  const cancelledTask = c.makeTask(c.org);
  d.book(vol, cancelledTask.id, c.consent);
  d.taskAction(c.org, cancelledTask.id, { action: 'cancel', reason: '机构取消服务' });
  assert.equal(d.bank(vol).releases.length, 3);
  assert.ok(d.bank(vol).releases.every((r) => !('phone' in r) && !('recipient' in r)));
});
