import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createTimewayServer } from '../server.mjs';
import { cellFor } from '../src/common.mjs';
import { gridGeometry, validPoint } from '../public/map-geo.js';

test('概略地图标记使用网格中心保护私人坐标', () => {
  for (const [lat, lng] of [
    [30.254123, 120.153456],
    [39.9024, 116.4053],
    [-20.56, -45.31],
    [0, 0],
  ]) {
    const cell = cellFor(lat, lng),
      shape = gridGeometry(cell);
    assert.equal(cellFor(shape.center.lat, shape.center.lng), cell);
    assert.ok(shape.corners.every(validPoint));
    assert.notDeepEqual(shape.center, { lat, lng });
    assert.equal(shape.corners.length, 4);
  }
  for (const invalid of [null, '', 'private address', 'Infinity:1', '1e4:2', '99999999:0', '1:NaN'])
    assert.equal(gridGeometry(invalid), null);
});

test('browser map configuration exposes only the explicitly public browser AK', async (t) => {
  const server = createTimewayServer({
    environment: 'test',
    databasePath: ':memory:',
    mapProvider: 'baidu',
    baiduBrowserAk: 'test-public-browser-ak',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(base + '/api/config')).json();
  assert.deepEqual(config.map, { provider: 'baidu', browserAk: 'test-public-browser-ak', version: '4.0' });
  assert.equal(config.adapters.map, 'baidu');
  assert.equal(JSON.stringify(config).includes('SERVER_AK'), false);
  const csp = (await fetch(base)).headers.get('content-security-policy');
  assert.match(csp, /api\.map\.baidu\.com/);
  assert.match(csp, /frame-ancestors 'none'/);
  for (const path of ['/baidu-map.js', '/map-geo.js']) assert.equal((await fetch(base + path)).status, 200);
  assert.equal((await fetch(base + '/.env')).status, 404);
});

test('an unconfigured map retains the offline page and strict script policy', async (t) => {
  const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(base + '/api/config')).json();
  assert.deepEqual(config.map, { provider: 'manual' });
  assert.doesNotMatch((await fetch(base)).headers.get('content-security-policy'), /unsafe-eval/);
});

test('production map policy does not allow local HTTP worker or tile exceptions', async (t) => {
  const server = createTimewayServer({
    environment: 'production',
    databasePath: ':memory:',
    mapProvider: 'baidu',
    baiduBrowserAk: 'test-public-browser-ak',
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}`);
  const csp = response.headers.get('content-security-policy');
  assert.doesNotMatch(csp, /http:\/\//);
  assert.match(csp, /https:\/\/api\.map\.baidu\.com/);
  assert.match(csp, /upgrade-insecure-requests/);
});
