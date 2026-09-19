import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';

const env = { ...parseEnv(await readFile('.env', 'utf8')), ...process.env };
assert.ok(env.BAIDU_MAP_BROWSER_AK, '需要配置百度浏览器地图凭据');
const server = createTimewayServer({ environment: 'test', databasePath: ':memory:', mapProvider: 'baidu', baiduBrowserAk: env.BAIDU_MAP_BROWSER_AK });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const { auth, domain, store } = server.context;
  const org = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' }).user;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const login = await context.request.post(base + '/api/auth/demo-login', { data: { role: 'volunteer', account: 'volunteer', password: 'timeway123' } });
  assert.equal(login.status(), 200);
  const vol = store.user('demo-vol');
  vol.region = '长沙市雨花区';
  store.saveUser(vol);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message.replaceAll(env.BAIDU_MAP_BROWSER_AK, '[redacted]')));
  await page.goto(base + '/#map');
  await expect(page.locator('#baidu-map-slot')).toHaveAttribute('data-state', 'ready', { timeout: 60000 });
  await expect(page.locator('.map-region-label')).not.toHaveText('定位中…', { timeout: 20000 });
  const places = await page.evaluate(async () => {
    const { baiduMap: m } = await import('/baidu-map.js');
    const results = [];
    for (const name of ['长沙市雨花区人民政府', '湖南省植物园']) {
      const point = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('实际地点查询超时')), 15000);
        const search = new m.B.LocalSearch('长沙市', { onSearchComplete(result) {
          clearTimeout(timer);
          const poi = Array.from({ length: result?.getCurrentNumPois() || 0 }, (_, i) => result.getPoi(i))
            .find(p => p.title === name || name === '长沙市雨花区人民政府' && p.title === '雨花区人民政府');
          poi?.point ? resolve(poi.point) : reject(new Error('实际地点未找到：' + name));
        } });
        search.search(name);
      });
      const region = await m.centerRegion(point);
      results.push({ name, address: name, ...region, lat: point.lat, lng: point.lng, coordinateSystem: 'bd09' });
    }
    return results;
  });
  assert.ok(places.every(p => p.city === '长沙市' && p.district === '雨花区'), JSON.stringify(places));
  function complete(place, i, region) {
    const start = new Date(Date.now() + (i + 1) * 86400000).toISOString();
    const task = domain.createTask(org, { kind: 'help', title: `区域边界联调服务${i}`, description: '独立测试数据库中的区域成果检查', region, address: place.address, place, start, end: new Date(Date.parse(start) + 3600000).toISOString(), deadline: start, minutes: 60, capacity: 1, status: 'published' });
    const a = domain.apply(vol, task.id, {});
    domain.applicationAction(org, a.id, { action: 'accept' });
    const row = store.get('task', task.id);
    row.start = new Date(Date.now() - (i + 2) * 86400000).toISOString();
    row.end = new Date(Date.parse(row.start) + 3600000).toISOString();
    store.put('task', row);
    domain.applicationAction(vol, a.id, { action: 'submit', start: row.start, end: row.end, rest: 0, content: '完成测试服务', note: '独立测试环境补录' });
    domain.recordAction(org, a.id, { action: 'confirm', minutes: 60, recipients: 1 });
    domain.recordAction(org, a.id, { action: 'confirm', minutes: 60, recipients: 1 });
    return row;
  }
  const first = complete(places[0], 0, '长沙市 · 雨花区');
  const second = complete(places[1], 1, '长沙市雨花区');
  assert.notEqual(first.cell, second.cell);
  for (const scope of ['all', 'mine']) {
    const data = domain.map(vol, scope);
    assert.equal(data.cells.length, 1);
    assert.equal(data.cells[0].count, 2);
    assert.equal(data.cells[0].volunteers, 1);
    assert.equal(data.summary.places, 1);
    assert.equal(data.summary.minutes, 120);
    assert.equal(data.cells[0].lat, undefined);
    assert.equal(data.cells[0].address, undefined);
  }
  await page.reload();
  await expect(page.locator('.baidu-pin.map-pin-love')).toHaveCount(1, { timeout: 60000 });
  const inspection = async () => page.evaluate(async () => {
    const m = (await import('/baidu-map.js')).baiduMap;
    return { areas: [...m.areaPaths.values()].map(paths => paths.map(path => path.length)), polygons: m.overlays.filter(o => typeof o.getPath === 'function').map(o => ({ points: o.getPath().length, weight: o.getStrokeWeight() })), cache: m.boundaries.size };
  });
  const initial = await inspection();
  assert.equal(initial.areas.length, 1);
  assert.ok(initial.areas[0].length > 0);
  assert.ok(initial.areas[0].every(n => n > 10));
  assert.equal(initial.polygons.length, initial.areas[0].length);
  for (const width of [320, 390, 520]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(async () => {
      const m = (await import('/baidu-map.js')).baiduMap;
      m.requestRecenter();
    });
    await page.locator('.baidu-pin.map-pin-love').click();
    await expect(page.locator('.map-region-card')).toContainText('2');
    await expect.poll(async () => (await inspection()).polygons.every(p => p.weight === 3)).toBe(true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal((await inspection()).cache, initial.cache);
    await expect.poll(() => page.evaluate(async () => {
      const m = (await import('/baidu-map.js')).baiduMap;
      const canvas = m.host.getBoundingClientRect();
      const top = document.querySelector('.map-scope').getBoundingClientRect().bottom - canvas.top;
      const bottom = document.querySelector('.map-sheet').getBoundingClientRect().top - canvas.top;
      return [...m.areaPaths.values()].flat(2).every(point => {
        const p = m.map.pointToPixel(point);
        return p.x >= 0 && p.x <= canvas.width && p.y >= top && p.y <= bottom;
      });
    })).toBe(true);
  }
  complete(places[0], 2, '长沙市雨花区雨花亭街道');
  await page.reload();
  await expect(page.locator('.baidu-pin.map-pin-love')).toHaveCount(2, { timeout: 60000 });
  await expect(page.locator('#baidu-map-note')).toContainText('1 个区域暂无可用边界');
  assert.equal((await inspection()).polygons.length, initial.polygons.length);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ verified: true, actualBoundaryVertices: initial.areas, sameRegionServices: 2, sameRegionPlaces: 1, widths: [320, 390, 520], unavailableBoundary: '仅显示概略标记' }));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
