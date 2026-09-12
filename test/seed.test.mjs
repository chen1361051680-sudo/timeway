import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Store } from '../src/store.mjs';
import { Domain } from '../src/domain.mjs';
import { Auth } from '../src/auth.mjs';

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
    const draft = domain.createTask(org, { kind: 'help', title: '需求方填写的内容', status: 'draft' });
    assert.equal(domain.tasks(volunteer).length, 0);
    assert.throws(() => domain.createTask(volunteer, { kind: 'help', status: 'draft' }));
    const start = new Date(Date.now() + 86400000).toISOString();
    domain.saveTask(org, draft.id, {
      ...draft,
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
