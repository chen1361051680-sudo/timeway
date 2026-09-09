import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTimewayServer } from '../server.mjs';

test('public site serves its assets and health, without exposing repository or data', async (t) => {
  const server = createTimewayServer({ version: 'abc1234' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const homepage = await fetch(base);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /应用建设中/);
  assert.match(homepage.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await fetch(`${base}/styles.css`)).status, 200);
  const health = await fetch(`${base}/healthz`);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'timeway', version: 'abc1234' });
  for (const path of ['/.env', '/.git/config', '/AGENTS.md', '/data/production.sqlite', '/%2e%2e/.env', '/public/index.html']) {
    assert.equal((await fetch(base + path)).status, 404, `${path} must not be public`);
  }
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
