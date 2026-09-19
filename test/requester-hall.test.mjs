import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';
import { seedRequesterHall } from '../e2e/requester-hall-fixture.mjs';
import { requesterStatus, requesterTodos, requesterHall, requesterDate } from '../public/requester-hall.js';
import { helpDetail, helpManagement } from '../public/task-detail.js';

function setup(t) {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  t.after(() => server.context.store.close());
  return { ...seedRequesterHall(server), d: server.context.domain, s: server.context.store };
}

test('旧报名未保存联系人时，电话仅向需求方提供并兼容个人资料', t => {
  const { d, s, org, pending, volunteer } = setup(t);
  const { user } = pending[0];
  const app = s.get('application', pending[0].app.id);
  delete app.applicantName;
  delete app.applicantPhone;
  s.put('application', app);
  const person = s.user(user.id);
  person.contactPhone = '+86 139-2222-3333';
  s.saveUser(person);
  assert.equal(d.applicationView(org, app).volunteer.phone, person.contactPhone);
  assert.equal(d.task(org, app.taskId).applications.find(a => a.id === app.id).volunteer.phone, person.contactPhone);
  assert.equal(d.applicationView(user, app).volunteer.phone, undefined);
  assert.equal(d.applicationView(volunteer(), app).volunteer.phone, undefined);
  assert.equal(d.applicationView({ id: 'another-organization', role: 'requester' }, app).volunteer.phone, undefined);
  assert.deepEqual(d.task(volunteer(), app.taskId).applications, []);
  person.contactPhone = '13955556666'; s.saveUser(person);
  assert.equal(d.applicationView(org, app).volunteer.phone, '13955556666');
  delete person.contactPhone; s.saveUser(person);
  assert.equal(d.applicationView(org, app).volunteer.phone, person.phone);
});

test('报名保存可修改的姓名电话，校验必填信息并保持个人资料不变', t => {
  const { d, s, org, tasks, volunteer } = setup(t);
  const person = volunteer();
  const original = s.user(person.id);
  for (const fields of [
    { applicantName: '' }, { applicantName: '   ' }, { applicantName: null },
    { applicantPhone: '' }, { applicantPhone: null }, { applicantPhone: 'not-a-phone' },
  ]) assert.throws(() => d.apply(person, tasks[0].id, fields), /姓名|联系方式/);
  const app = d.apply(person, tasks[0].id, {
    applicantName: '  报名联系人  ', applicantPhone: '+86 139-2222-3333', message: '不再保存的留言',
  });
  const saved = s.get('application', app.id);
  assert.equal(saved.applicantName, '报名联系人');
  assert.equal(saved.applicantPhone, '+86 139-2222-3333');
  assert.equal(saved.message, undefined);
  assert.deepEqual(s.user(person.id), original);
  s.saveUser({ ...original, name: '后来修改的姓名', contactPhone: '13955556666' });
  const detail = d.task(org, tasks[0].id);
  const shown = detail.applications.find(a => a.id === app.id);
  assert.equal(shown.volunteer.name, saved.applicantName);
  assert.equal(shown.volunteer.phone, saved.applicantPhone);
  assert.match(helpManagement(detail, () => ''), /href="tel:\+8613922223333"/);
  assert.match(helpManagement(detail, () => ''), /报名联系人/);
  const strangerView = d.applicationView(volunteer(), saved);
  assert.equal(strangerView.volunteer.phone, undefined);
  assert.equal(strangerView.applicantPhone, undefined);
  assert.equal(d.apply(person, tasks[0].id, { applicantName: '重复提交', applicantPhone: '13900000000' }).id, app.id);
  assert.equal(s.get('application', app.id).applicantName, saved.applicantName);
  const another = volunteer();
  const defaults = d.apply(another, tasks[0].id, {});
  assert.equal(s.get('application', defaults.id).applicantName, another.name);
  assert.equal(s.get('application', defaults.id).applicantPhone, another.phone);
});
test('requester hall groups real work, counts people and keeps cancelled states authoritative', (t) => {
  const { d, org, tasks, pending, household } = setup(t);
  const list = () => d.tasks(org, { kind: 'help', scope: 'mine' });
  const counts = () =>
    requesterTodos(list()).reduce((v, item) => ({ ...v, [item.type]: (v[item.type] || 0) + item.count }), {});
  assert.deepEqual(counts(), { applications: 2, records: 1, other: 1 });
  assert.equal(requesterStatus(d.task(org, tasks[0].id)).group, 'recruiting');
  assert.equal(requesterStatus(d.task(org, tasks[1].id)).label, '待服务');
  d.applicationAction(org, pending[0].app.id, { action: 'accept' });
  assert.equal(counts().applications, 1);
  assert.equal(requesterStatus(d.task(org, tasks[0].id)).group, 'active');
  d.recordAction(org, household.app.id, { action: 'confirm', minutes: 120, recipients: 1 });
  assert.equal(counts().records, undefined);
  assert.equal(requesterStatus(d.task(org, tasks[2].id)).group, 'completed');
  for (const status of ['cancelled'])
    assert.equal(requesterStatus({ ...d.task(org, tasks[2].id), status }).group, status);
  const cancelled = { ...d.task(org, tasks[2].id), id: 'hidden-cancelled-task', status: 'cancelled', title: '不展示的已取消需求' };
  for (const filter of ['', 'cancelled', 'history']) {
    const html = requesterHall({ tasks: [...list(), cancelled], filter });
    assert.ok(!html.includes(cancelled.title));
    assert.ok(!html.includes('data-id="cancelled"'));
  }
  assert.equal(
    requesterHall({ tasks: list(), filter: 'cancelled' }),
    requesterHall({ tasks: list() }),
  );
  assert.notEqual(
    requesterStatus({ status: 'published', applications: [{ status: 'rejected' }], remaining: 1 }).group,
    'completed',
  );
});
test('ended demands move to history without changing records, while unresolved work stays accessible', (t) => {
  const { d, s, org, tasks, household, apply } = setup(t);
  const ended = d.createTask(org, { ...tasks[0], title: '已结束的陪伴需求' });
  apply(ended);
  const end = new Date(Date.now() - 2 * 86400000).toISOString();
  s.put('task', {
    ...s.get('task', ended.id),
    start: new Date(Date.parse(end) - 120 * 60000).toISOString(),
    end,
    deadline: end,
  });
  const list = () => d.tasks(org, { kind: 'help', scope: 'mine' });
  const href = (task) => `href="#task/${task.id}/`;
  const snapshot = JSON.stringify(s.all('task'));
  const ledger = s.db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count;
  assert.equal(d.task(org, ended.id).displayStatus, 'ended');
  const current = requesterHall({ tasks: list(), latestTaskId: ended.id });
  const history = requesterHall({ tasks: list(), filter: 'history' });
  for (const task of [ended, tasks[3]]) {
    assert.ok(!current.includes(href(task)));
    assert.ok(history.includes(href(task)));
  }
  for (const task of tasks.slice(0, 3)) {
    assert.ok(current.includes(href(task)));
    assert.ok(!history.includes(href(task)));
  }
  assert.ok(history.indexOf(href(ended)) < history.indexOf(href(tasks[3])));
  assert.ok(requesterHall({ tasks: list(), todo: true }).includes(href(tasks[3])));
  assert.equal(JSON.stringify(s.all('task')), snapshot);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count, ledger);
  d.recordAction(org, household.app.id, { action: 'confirm', minutes: 120, recipients: 1 });
  assert.ok(!requesterHall({ tasks: list() }).includes(href(tasks[2])));
  assert.ok(requesterHall({ tasks: list(), filter: 'history' }).includes(href(tasks[2])));
  assert.ok(!requesterHall({ tasks: list(), todo: true }).includes(href(tasks[2])));
  const onlyHistory = requesterHall({ tasks: [d.task(org, ended.id)] });
  assert.ok(onlyHistory.includes('暂无当前需求'));
  assert.ok(onlyHistory.includes('之前的需求可在历史记录中查看'));
  assert.ok(requesterHall({ tasks: [], filter: 'history' }).includes('暂无历史记录'));
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
test('removed volunteer time-change actions cannot change data or create actionable reminders', (t) => {
  const { d, s, org, medical, tasks } = setup(t);
  const [first] = medical;
  const original = d.task(org, tasks[1].id);
  const request = {
    start: new Date(Date.parse(original.start) + 3600000).toISOString(),
    end: new Date(Date.parse(original.end) + 3600000).toISOString(),
    reason: '旧版改期申请',
  };
  // Existing stored requests are retained as data, but no longer create a workflow.
  s.put('application', {
    ...s.get('application', first.app.id),
    changeRequest: { ...request, created: new Date().toISOString() },
    changeResolution: { action: 'reject-request-change', reason: '旧版处理记录' },
  });
  const snapshot = () => JSON.stringify(['task', 'application', 'audit'].map((type) => s.all(type)));
  const before = snapshot();
  for (const user of [first.user, org]) {
    for (const action of ['request-change', 'accept-request-change', 'reject-request-change']) {
      assert.throws(() => d.applicationAction(user, first.app.id, { ...request, action }), /未知报名操作/);
    }
  }
  assert.equal(snapshot(), before);
  const task = d.task(org, original.id);
  assert.equal(requesterTodos([task]).length, 0);
  const management = helpManagement(task, () => '');
  const detail = helpDetail(task, { management });
  for (const removed of ['申请调整时间', '同意调整', 'accept-request-change', 'reject-request-change', '旧版改期申请', '旧版处理记录'])
    assert.ok(!detail.includes(removed));
  assert.ok(!detail.includes('td-attention'));
});
test('organization edits still require every confirmed volunteer to accept the new schedule', (t) => {
  const { d, s, org, medical, tasks } = setup(t);
  const [first, second] = medical;
  const original = d.task(org, tasks[1].id);
  const start = new Date(Date.parse(original.start) + 3600000).toISOString();
  const end = new Date(Date.parse(original.end) + 3600000).toISOString();
  const ledgerBefore = s.db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count;
  d.saveTask(org, original.id, { ...original, start, end });
  const waiting = d.task(org, tasks[1].id);
  assert.equal(waiting.start, original.start);
  assert.equal(waiting.pending.answers[first.app.id], 'pending');
  assert.equal(waiting.pending.answers[second.app.id], 'pending');
  assert.equal(requesterTodos([waiting]).length, 1);
  d.applicationAction(first.user, first.app.id, { action: 'change', answer: 'accept' });
  assert.equal(d.task(org, tasks[1].id).start, original.start);
  d.applicationAction(second.user, second.app.id, { action: 'change', answer: 'accept' });
  assert.equal(d.task(org, tasks[1].id).start, start);
  assert.equal(d.task(org, tasks[1].id).hasPendingChange, false);
  assert.equal(requesterTodos([d.task(org, tasks[1].id)]).length, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count, ledgerBefore);
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
    status: 'published',
    capacity: 1,
    applications: [],
  };
  const html = requesterHall({ tasks: [task] });
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<script>bad'));
  for (const privateText of [task.address, task.phone, task.recipient])
    assert.ok(!html.includes(privateText));
  assert.ok(!html.includes('requester-count'));
  assert.ok(html.includes('#task/test'));
  assert.equal(
    requesterDate('2026-09-14T00:30:00+08:00', Date.parse('2026-09-13T23:59:00+08:00')),
    '明日 00:30',
  );
  assert.equal(
    requesterDate('2026-09-13T23:50:00+08:00', Date.parse('2026-09-13T23:59:00+08:00')),
    '今日 23:50',
  );
});
