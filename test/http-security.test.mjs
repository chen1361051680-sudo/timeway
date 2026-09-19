import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createTimewayServer } from '../server.mjs';
import { Store } from '../src/store.mjs';
import { DatabaseSync } from 'node:sqlite';
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'timeway-http-'));
  const server = createTimewayServer({ environment: 'test', databasePath: join(dir, 'test.sqlite') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, auth = {}, method = body ? 'POST' : 'GET') => {
    const r = await fetch(base + '/api' + path, {
      method,
      headers: { ...auth, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      status: r.status,
      headers: r.headers,
      data: r.headers.get('content-type')?.includes('application/json')
        ? await r.json()
        : await r.arrayBuffer(),
    };
  };
  let n = 0;
  const login = async (role) => {
    const phone = '1390000000' + ++n;
    // Additional isolated actors are fixtures, not a public registration endpoint.
    const id = 'test-actor-' + n;
    server.context.store.db
      .prepare('INSERT INTO users VALUES (?,?,?,?)')
      .run(id, phone, role, JSON.stringify({ profileComplete: false }));
    const session = server.context.auth.createSession(id);
    const auth = { cookie: 'tw_session=' + session.token, 'x-csrf-token': session.csrf };
    await call(
      '/profile',
      { name: '测试' + n, region: '杭州', contact: '联系人', address: '地址' },
      auth,
      'PUT',
    );
    return { auth, user: server.context.store.user(id) };
  };
  return { server, base, call, login, dir };
}
const input = () => ({
  kind: 'help',
  title: '并发名额测试',
  description: '服务内容',
  recipient: '私密对象',
  address: '私人门牌123',
  region: '杭州',
  start: new Date(Date.now() + 86400000).toISOString(),
  end: new Date(Date.now() + 90000000).toISOString(),
  minutes: 60,
  capacity: 1,
  status: 'published',
});
test('发布并发回归：重复重试只保存一次，独立提交完整写入，冲突不产生副作用', async (t) => {
  const { call, login, server } = await setup(t);
  const org = await login('requester');
  const payload = { ...input(), recipient: '', title: '核心信息发布并发检查' };
  const started = performance.now();
  const requests = [
    ...Array.from({ length: 30 }, () => ({ body: payload, key: 'publish-replay-load' })),
    ...Array.from({ length: 20 }, (_, i) => ({
      body: { ...payload, title: `独立发布 ${i}` },
      key: `publish-unique-${i}`,
    })),
  ];
  const responses = await Promise.all(
    requests.map(({ body, key }) => call('/tasks', body, { ...org.auth, 'idempotency-key': key })),
  );
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(new Set(responses.slice(0, 30).map((r) => r.data.id)).size, 1);
  assert.equal(new Set(responses.slice(30).map((r) => r.data.id)).size, 20);
  assert.equal(server.context.store.all('task').length, 21);
  const conflicts = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      call(
        '/tasks',
        { ...payload, title: `错误重用标识 ${i}` },
        {
          ...org.auth,
          'idempotency-key': 'publish-replay-load',
        },
      ),
    ),
  );
  assert.ok(conflicts.every((r) => r.status === 409));
  assert.equal(server.context.store.all('task').length, 21);
  t.diagnostic(
    `本地隔离 SQLite：50 个并发发布请求及 10 个冲突请求，耗时 ${Math.round(performance.now() - started)} ms；该结果不代表生产容量。`,
  );
});

test('HTTP concurrent final-place acceptance, exact replay, cross-role and contact privacy', async (t) => {
  const { call, login } = await setup(t),
    org = await login('requester'),
    vol = await login('volunteer'),
    other = await login('volunteer'),
    outsider = await login('requester');
  const payload = input(),
    headers = { ...org.auth, 'idempotency-key': 'same-request-1234' };
  const [one, two] = await Promise.all([call('/tasks', payload, headers), call('/tasks', payload, headers)]);
  assert.equal(one.data.id, two.data.id);
  const id = one.data.id;
  const [a, b] = await Promise.all([
    call(`/tasks/${id}/apply`, {}, vol.auth),
    call(`/tasks/${id}/apply`, {}, other.auth),
  ]);
  const results = await Promise.all([
    call('/applications/' + a.data.id, { action: 'accept' }, org.auth),
    call('/applications/' + b.data.id, { action: 'accept' }, org.auth),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? vol : other,
    loser = winner === vol ? other : vol;
  assert.equal((await call('/tasks', input(), vol.auth)).status, 403);
  assert.equal(
    (await call(`/tasks/${id}/action`, { action: 'cancel', reason: '越权' }, outsider.auth)).status,
    403,
  );
  const publicTask = await call('/tasks/' + id, undefined, loser.auth);
  assert.equal(publicTask.data.address, input().address);
  assert.equal(publicTask.data.phone, undefined);
  assert.equal(publicTask.data.recipient, undefined);
  assert.deepEqual(publicTask.data.applications, []);
  assert.equal(
    (
      await call(
        '/profile',
        { name: 'name', region: 'region' },
        { ...winner.auth, Origin: 'https://other.invalid' },
        'PUT',
      )
    ).status,
    403,
  );
  await call('/auth/logout', {}, winner.auth);
  assert.equal((await call('/bank', undefined, winner.auth)).status, 401);
});
test('removed comments and material endpoints reject old clients and preserve stored history', async (t) => {
  const { call, login, server, dir } = await setup(t);
  const org = await login('requester'), vol = await login('volunteer');
  const store = server.context.store;
  const comment = store.put('comment', { ref: 'legacy-task', owner: org.user.id, content: '旧留言' });
  const attachment = store.put('attachment', { ref: 'legacy-task', owner: org.user.id, name: '旧材料.pdf' });
  const legacyFile = join(dir, attachment.id);
  writeFileSync(legacyFile, '旧材料内容');
  for (const actor of [org, vol]) {
    for (const path of ['/comments/legacy-task', '/files/legacy-task', '/attachments/' + attachment.id])
      assert.equal((await call(path, undefined, actor.auth)).status, 404);
    for (const type of ['message', 'review'])
      assert.equal((await call('/comments/legacy-task', { type, content: '新增内容' }, actor.auth)).status, 404);
    assert.equal((await call('/attachments', {
      ref: 'legacy-task', name: 'new.pdf', type: 'application/pdf',
      base64: Buffer.from('%PDF-1.4').toString('base64'),
    }, actor.auth)).status, 404);
  }
  const body = { type: 'message', content: '旧留言' };
  const fingerprint = createHash('sha256').update('POST/api/comments/legacy-task' + JSON.stringify(body)).digest('hex');
  store.db.prepare('INSERT INTO idempotency VALUES (?,?,?,?)').run(org.user.id, 'legacy-comment-replay', fingerprint, JSON.stringify(comment));
  assert.equal((await call('/comments/legacy-task', body, { ...org.auth, 'idempotency-key': 'legacy-comment-replay' })).status, 404);
  assert.deepEqual(store.all('comment'), [comment]);
  assert.deepEqual(store.all('attachment'), [attachment]);
  assert.equal(readFileSync(legacyFile, 'utf8'), '旧材料内容');
});
test('demo login checks credentials and role, reuses profiles, and removes registration', async (t) => {
  const { call, server } = await setup(t);
  const payload = { account: 'volunteer', password: 'timeway123', role: 'volunteer' };
  for (const body of [
    { ...payload, password: 'wrong' },
    { ...payload, account: 'new-account' },
    { ...payload, role: 'requester' },
  ]) {
    assert.equal((await call('/auth/demo-login', body)).status, 401);
  }
  assert.equal(server.context.store.users().length, 0);
  assert.equal((await call('/auth/demo-login', { ...payload, role: 'admin' })).status, 400);
  for (const path of ['/auth/code', '/auth/verify', '/auth/register'])
    assert.equal((await call(path, payload)).status, 404);
  assert.equal((await call('/auth/demo-login', payload, { Origin: 'https://evil.invalid' })).status, 403);
  const first = await call('/auth/demo-login', payload);
  assert.equal(first.status, 200);
  assert.equal(first.data.user.role, 'volunteer');
  assert.equal(first.data.user.profileComplete, true);
  assert.equal(first.data.token, undefined);
  assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const user = server.context.store.user(first.data.user.id);
  user.name = '保留修改后的名字';
  server.context.store.saveUser(user);
  const second = await call('/auth/demo-login', payload);
  assert.equal(second.data.user.id, user.id);
  assert.equal(second.data.user.name, user.name);
  assert.equal(server.context.store.users().length, 1);
  const auth = { cookie: second.headers.get('set-cookie').split(';')[0], 'x-csrf-token': second.data.csrf };
  assert.equal((await call('/me', undefined, auth)).data.user.id, user.id);
  await call('/auth/logout', {}, auth);
  assert.equal((await call('/bank', undefined, auth)).status, 401);
  assert.throws(() => createTimewayServer({ environment: 'prod', databasePath: ':memory:' }), /NODE_ENV/);
});

test('SQLite consistent backup contains committed WAL data and refuses environment or schema mismatch', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'timeway-backup-')),
    path = join(dir, 'test.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const s = new Store(path, 'test');
  s.put('feedback', { owner: 'u', content: 'committed WAL record' });
  const run = spawnSync(process.execPath, [resolve('scripts/backup.mjs')], {
    cwd: resolve('.'),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_PATH: path, BACKUP_DIR: join(dir, 'backups') },
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const target = run.stdout.trim().split('verified: ')[1];
  const restored = new DatabaseSync(target, { readOnly: true });
  assert.equal(restored.prepare('SELECT COUNT(*) n FROM entities').get().n, 1);
  restored.close();
  s.close();
  assert.throws(() => new Store(path, 'production'), /环境不匹配/);
  const newer = new DatabaseSync(path);
  newer.exec('PRAGMA user_version=2');
  newer.close();
  assert.throws(() => new Store(path, 'test'), /版本高于/);
});
