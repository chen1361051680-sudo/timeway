import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { createTimewayServer } from '../server.mjs';
import { listenHost } from '../src/listen.mjs';
import { requestId } from '../public/request-id.js';

test('LAN HTTP generates distinct request keys without crypto.randomUUID', () => {
  const cryptoProvider = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const ids = Array.from({ length: 100 }, () => requestId(cryptoProvider));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('LAN development supports same-origin login without weakening hosted production', async (t) => {
  assert.equal(listenHost('development'), '0.0.0.0');
  assert.equal(listenHost('development', '127.0.0.1'), '127.0.0.1');
  assert.equal(listenHost('production', '0.0.0.0'), '127.0.0.1');
  assert.equal(listenHost('test'), '127.0.0.1');
  assert.throws(() => listenHost('development', 'invalid'), /BIND_HOST/);
  for (const environment of ['development', 'production']) {
    const server = createTimewayServer({
      environment,
      databasePath: ':memory:',
      demoMode: environment === 'production',
      origin: environment === 'production' ? 'https://timeway.chhwork.cn' : 'http://127.0.0.1:4312',
      mapProvider: 'baidu',
      baiduBrowserAk: 'test-browser-key',
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const host = `192.168.31.19:${server.address().port}`;
    const homepage = await fetch(base, { headers: { host } });
    const csp = homepage.headers.get('content-security-policy');
    assert.equal(csp.includes('upgrade-insecure-requests'), environment === 'production');
    const login = (origin) => new Promise((resolve, reject) => {
      const req = request(base + '/api/auth/demo-login', {
        method: 'POST',
        headers: { host, origin, 'content-type': 'application/json' },
      }, (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, cookie: String(res.headers['set-cookie']) }));
      });
      req.on('error', reject);
      req.end(JSON.stringify({ role: 'volunteer', account: 'volunteer', password: 'timeway123' }));
    });
    const lan = await login(`http://${host}`);
    assert.equal(lan.status, environment === 'development' ? 200 : 403);
    if (environment === 'development') assert.doesNotMatch(lan.cookie, /Secure/);
    assert.equal((await login('https://untrusted.example')).status, 403);
    if (environment === 'production') {
      const hosted = await login('https://timeway.chhwork.cn');
      assert.equal(hosted.status, 200);
      assert.match(hosted.cookie, /Secure/);
    }
  }
});
