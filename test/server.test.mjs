import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createTimewayServer } from '../server.mjs';
import { publicAssets } from '../src/assets.mjs';

test('public site serves its assets and health, without exposing repository or data', async (t) => {
  const server = createTimewayServer({ version: 'abc1234', environment: 'test', databasePath: ':memory:' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const homepage = await fetch(base);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /startup.js/);
  assert.match(homepage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/styles.css`)).status, 200);
  for (const file of await publicAssets()) {
    assert.equal((await fetch(`${base}/${file}`, { method: 'HEAD' })).status, 200, `${file} must be served`);
  }
  // New modules added after startup must work without a server restart.
  const newFile = `runtime-check-${randomUUID()}.js`;
  const diskPath = new URL('../public/' + newFile, import.meta.url);
  await writeFile(diskPath, 'export const loaded = true;');
  t.after(() => unlink(diskPath));
  const added = await fetch(`${base}/${newFile}`);
  assert.equal(added.status, 200);
  assert.match(added.headers.get('content-type'), /text\/javascript/);
  assert.equal(await added.text(), 'export const loaded = true;');
  const health = await fetch(`${base}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'timeway', version: 'abc1234' });
  for (const path of [
    '/.env',
    '/.git/config',
    '/AGENTS.md',
    '/data/production.sqlite',
    '/%2e%2e/.env',
    '/public/index.html',
  ]) {
    assert.equal((await fetch(base + path)).status, 404, `${path} must not be public`);
  }
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
