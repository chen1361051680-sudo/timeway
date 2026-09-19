import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { Domain } from '../src/domain.mjs';
import { Auth } from '../src/auth.mjs';

test('旧草稿及其幂等响应被清理，已发布需求与审计历史保留，重复启动安全', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'timeway-retired-drafts-'));
  t.after(() => {
    if (dirname(directory) !== resolve(tmpdir()) || !directory.split(/[\\/]/).pop().startsWith('timeway-retired-drafts-'))
      throw new Error('Invalid cleanup directory');
    rmSync(directory, { recursive: true, force: true });
  });
  const path = join(directory, 'test.sqlite');
  const initial = new Store(path, 'test');
  const draft = initial.put('task', { owner: 'org', kind: 'help', status: 'draft', title: '旧草稿' });
  const published = initial.put('task', { owner: 'org', kind: 'help', status: 'published', title: '已发布内容' });
  const audit = initial.put('audit', { owner: 'org', ref: draft.id, action: 'create', after: draft });
  for (const task of [draft, published]) initial.db.prepare('INSERT INTO idempotency VALUES (?,?,?,?)')
    .run('org', task.id, 'test-fingerprint', JSON.stringify(task));
  initial.close();
  for (let i = 0; i < 2; i++) {
    const store = new Store(path, 'test');
    try {
      assert.equal(store.get('task', draft.id), undefined);
      assert.deepEqual(store.get('task', published.id), published);
      assert.deepEqual(store.get('audit', audit.id), audit);
      assert.equal(store.db.prepare('SELECT COUNT(*) n FROM idempotency').get().n, 1);
      assert.equal(store.db.prepare('SELECT key FROM idempotency').get().key, published.id);
    } finally { store.close(); }
  }
});

test('account initialization and repeated login never create default business content', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'timeway-empty-accounts-'));
  t.after(() => {
    if (
      dirname(directory) !== resolve(tmpdir()) ||
      !directory.split(/[\\/]/).pop().startsWith('timeway-empty-accounts-')
    )
      throw new Error('Invalid cleanup directory');
    rmSync(directory, { recursive: true, force: true });
  });
  const path = join(directory, 'test.sqlite');
  const seed = () => {
    const run = spawnSync(process.execPath, [resolve('scripts/seed.mjs')], {
      env: { ...process.env, NODE_ENV: 'test', DATABASE_PATH: path },
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
  };
  seed();
  seed();
  const store = new Store(path, 'test');
  try {
    assert.deepEqual(
      store
        .users()
        .map((u) => u.name)
        .sort(),
      ['模拟志愿者', '模拟需求方'],
    );
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM entities').get().n, 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) n FROM ledger').get().n, 0);
    const auth = new Auth(store, 'test'),
      domain = new Domain(store);
    for (const role of ['requester', 'volunteer'])
      auth.demoLogin({ role, account: role, password: 'timeway123' });
    assert.equal(store.all('task').length, 0);
    const org = store.user('demo-org'),
      volunteer = store.user('demo-vol');
    assert.throws(() => domain.createTask(org, { kind: 'help', title: '需求方填写的内容', status: 'draft' }));
    assert.equal(domain.tasks(volunteer).length, 0);
    assert.throws(() => domain.createTask(volunteer, { kind: 'help', status: 'published' }));
    const start = new Date(Date.now() + 86400000).toISOString();
    domain.createTask(org, {
      kind: 'help', title: '需求方填写的内容',
      description: '需求方填写',
      recipient: '受助对象',
      region: '杭州西湖区',
      address: '测试地址',
      start,
      end: new Date(Date.parse(start) + 3600000).toISOString(),
      deadline: start,
      status: 'published',
    });
    assert.equal(domain.tasks(volunteer).length, 1);
    seed();
    assert.equal(store.users().length, 2);
    assert.equal(store.all('task').length, 1);
    assert.equal(domain.tasks(volunteer)[0].title, '需求方填写的内容');
  } finally {
    store.close();
  }
});
