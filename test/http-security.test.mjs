import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createTimewayServer } from '../server.mjs';
import { Store } from '../src/store.mjs';
import { DatabaseSync } from 'node:sqlite';
async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'timeway-http-'));
  const server = createTimewayServer({ environment: 'test', databasePath: join(dir, 'test.sqlite') });
  server.context.uploads = join(dir, 'files');
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
    const c = await call('/auth/code', { phone });
    const r = await call('/auth/verify', { phone, code: c.data.developmentCode, role, agreed: true });
    const auth = { cookie: r.headers.get('set-cookie').split(';')[0], 'x-csrf-token': r.data.csrf };
    await call(
      '/profile',
      { name: '测试' + n, region: '杭州', contact: '联系人', address: '地址' },
      auth,
      'PUT',
    );
    return { auth, user: server.context.store.user(r.data.user.id) };
  };
  return { server, base, call, login };
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
test('HTTP concurrent final-place acceptance, exact replay, cross-role and private attachments', async (t) => {
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
  assert.equal(publicTask.data.address, undefined);
  assert.equal(publicTask.data.recipient, undefined);
  assert.deepEqual(publicTask.data.applications, []);
  assert.equal((await call('/comments/' + id, undefined, loser.auth)).status, 403);
  const upload = await call(
    '/attachments',
    {
      ref: id,
      name: 'service.pdf',
      type: 'application/pdf',
      base64: Buffer.from('%PDF-1.4\nTest record').toString('base64'),
    },
    winner.auth,
  );
  assert.equal(upload.status, 200);
  assert.equal((await call('/attachments/' + upload.data.id, undefined, outsider.auth)).status, 403);
  assert.equal((await call('/attachments/' + upload.data.id, undefined, org.auth)).status, 200);
  assert.equal(
    (
      await call(
        '/attachments',
        {
          ref: id,
          name: 'fake.png',
          type: 'image/png',
          base64: Buffer.from('<script>bad</script>').toString('base64'),
        },
        winner.auth,
      )
    ).status,
    400,
  );
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
test('OTP resend cooldown, wrong-code limit, replay, unknown environment and production isolation', async (t) => {
  const { call } = await setup(t),
    phone = '13700000001';
  const first = await call('/auth/code', { phone });
  assert.equal((await call('/auth/code', { phone })).status, 429);
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await call('/auth/verify', { phone, code: '000000', role: 'volunteer', agreed: true })).status,
      400,
    );
  assert.equal(
    (await call('/auth/verify', { phone, code: first.data.developmentCode, role: 'volunteer', agreed: true }))
      .status,
    400,
  );
  const other = '13700000002',
    next = await call('/auth/code', { phone: other });
  const payload = { phone: other, code: next.data.developmentCode, role: 'volunteer', agreed: true };
  assert.equal((await call('/auth/verify', payload)).status, 200);
  assert.equal((await call('/auth/verify', payload)).status, 400);
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
