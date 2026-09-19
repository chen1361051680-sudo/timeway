import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createTimewayServer } from '../server.mjs';
import { newPublication } from '../public/publish.js';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:', mapProvider: 'baidu', baiduBrowserAk: 'test-key' });
const { auth, domain: d } = server.context;
const org = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' }).user;
const session = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' });
const task = d.createTask(org, { ...newPublication('help', org), title: '路线测试服务', description: '陪同就诊', address: '杭州市西湖区服务站18号', region: '杭州市西湖区', phone: '13912345678', recipient: '受助者资料', place: { coordinateSystem: 'bd09', lng: 120.15, lat: 30.26, name: '服务站', address: '杭州市西湖区服务站18号', city: '杭州市', district: '西湖区' } });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await mkdir('tmp/route-checks', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'tw_session', value: session.token, url: base }]);
  await context.addInitScript(() => {
    window.routeTest = { gps: 0, denied: false, fail: false, delays: {}, requests: [] };
    const state = window.routeTest;
    navigator.geolocation.getCurrentPosition = (resolve, reject) => {
      state.gps++; setTimeout(() => state.denied ? reject({ code: 1 }) : resolve({ coords: { longitude: 120.1, latitude: 30.2 } }), 10);
    };
    class Point { constructor(lng, lat) { this.lng = lng; this.lat = lat; } }
    class Map {
      constructor() { this.overlays = []; state.map = this; }
      centerAndZoom() {} enableScrollWheelZoom() {} addControl() {} checkResize() {}
      addOverlay(o) { this.overlays.push(o); } clearOverlays() { this.overlays = []; }
      setViewport(points) { state.path = points; }
    }
    class Marker { constructor(point) { this.point = point; } setTitle() {} }
    class Polyline { constructor(path) { this.path = path; } }
    const planner = mode => class {
      constructor(map, options) { this.options = options; }
      getStatus() { return this.failed ? 2 : 0; }
      search(from, to) {
        state.requests.push({ mode, from, to });
        this.failed = state.fail;
        const duration = { walking: 1800, transit: 900, driving: 600 }[mode];
        setTimeout(() => this.options.onSearchComplete({ getNumPlans: () => this.failed ? 0 : mode === 'transit' ? 2 : 1, getPlan: (index) => ({
          getDuration: () => duration + index * 300, getDistance: () => 2500 + index * 700,
          getNumRoutes: () => 1, getRoute: () => ({ getPath: () => [from, to], getDistance: () => index ? 200 : 600 }),
          getNumLines: () => mode === 'transit' ? index + 1 : 0,
          getLine: (line) => ({ title: `公交 ${7 + index + line} 路`, getPath: () => [from, new Point(120.13 + index * 0.01, 30.24), to], getGetOnStop: () => ({ title: `测试上车站${line}` }), getGetOffStop: () => ({ title: `测试下车站${line}` }), getNumViaStops: () => 3 }),
          getDescription: () => `步行 → 公交 ${7 + index} 路 → 服务站`,
        }) }), state.delays[mode] || 10);
      }
    };
    window.BMap = { Point, Map, Marker, Polyline, ScaleControl: class {},
      Convertor: class { translate(points, from, to, cb) { state.conversion = [from, to]; cb({ status: 0, points: points.map(p => new Point(p.lng + 0.01, p.lat + 0.01)) }); } },
      Geocoder: class { getPoint(address, cb) { cb(address.includes('不存在') ? null : new Point(120.12, 30.22)); } },
      WalkingRoute: planner('walking'), TransitRoute: planner('transit'), DrivingRoute: planner('driving'),
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const response = await context.request.get(base + '/api/tasks/' + task.id);
  const publicTask = await response.json();
  expect(publicTask.address).toBe(task.address);
  expect(publicTask.place.lng).toBe(120.15);
  expect(publicTask.phone).toBeUndefined(); expect(publicTask.recipient).toBeUndefined();
  await page.goto(base + '/#task/' + task.id);
  await expect(page.getByText(task.address, { exact: true })).toBeVisible();
  const open = () => page.getByRole('button', { name: '查看前往服务地点的路线' }).click();
  await open();
  await expect(page.locator('.route-duration')).toHaveText('约 30 分钟');
  await expect(page.locator('.route-distance')).toHaveText('2.5 公里');
  await expect(page.locator('.route-arrival')).toContainText('预计');
  expect(await page.evaluate(() => routeTest.conversion)).toEqual([1, 5]);
  const link = new URL(await page.locator('.route-footer a').getAttribute('href'));
  expect(link.searchParams.get('destination')).toContain('30.26,120.15');
  expect(link.searchParams.get('origin')).toContain('30.21,120.11');
  expect(link.searchParams.get('coord_type')).toBe('bd09ll');
  for (const [mode, minutes] of [['公交', 15], ['驾车', 10]]) {
    await page.getByRole('tab', { name: mode, exact: true }).click();
    await expect(page.locator('.route-duration')).toHaveText(`约 ${minutes} 分钟`);
    if (mode === '公交') {
      await expect(page.locator('.route-plan')).toHaveCount(2);
      await expect(page.locator('.route-plan').first()).toContainText('无需换乘 · 步行 600 米');
      const requests = await page.evaluate(() => routeTest.requests.length);
      const firstPath = await page.evaluate(() => routeTest.path);
      await page.locator('.route-plan').nth(1).click();
      await expect(page.locator('.route-plan').nth(1)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.route-plan').nth(1)).toContainText('换乘 1 次 · 步行 200 米');
      await expect(page.locator('.route-duration')).toHaveText('约 20 分钟');
      await expect(page.locator('.route-distance')).toHaveText('3.2 公里');
      await expect(page.locator('.route-steps')).toContainText('测试上车站1 上车');
      expect(await page.evaluate(() => routeTest.path)).not.toEqual(firstPath);
      expect(await page.evaluate(() => routeTest.requests.length)).toBe(requests);
      for (const width of [320, 390, 520]) {
        await page.setViewportSize({ width, height: 844 });
        for (const card of await page.locator('.route-plan').all())
          expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await expect(page.locator('.route-footer a')).toBeInViewport();
      }
      await page.screenshot({ path: 'tmp/route-checks/transit-plans.png' });
    } else await expect(page.locator('.route-plans')).toBeHidden();
  }
  expect(await page.evaluate(() => routeTest.gps)).toBe(1);
  for (const width of [320, 390, 520]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.locator('#task-route').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(page.locator('.route-footer a')).toBeInViewport();
    await page.screenshot({ path: `tmp/route-checks/route-${width}.png` });
  }
  await page.evaluate(() => { routeTest.delays.walking = 400; });
  await page.getByRole('tab', { name: '步行', exact: true }).click();
  await page.getByRole('tab', { name: '公交', exact: true }).click();
  await expect(page.locator('.route-duration')).toHaveText('约 15 分钟');
  await page.waitForTimeout(450);
  await expect(page.locator('.route-duration')).toHaveText('约 15 分钟');
  await page.evaluate(() => { routeTest.fail = true; });
  await page.getByRole('tab', { name: '驾车', exact: true }).click();
  await expect(page.locator('.route-status')).toContainText('未找到可用路线');
  await expect(page.locator('.route-result')).toBeHidden();
  await expect(page.locator('.route-plans')).toBeHidden();
  await page.getByRole('button', { name: '关闭路线' }).click();
  await expect(page).toHaveURL(base + '/#task/' + task.id);
  await page.evaluate(() => { routeTest.denied = true; routeTest.fail = false; routeTest.delays = {}; });
  await open();
  await expect(page.locator('.route-status')).toContainText('未获定位权限');
  await page.getByRole('textbox', { name: '出发地' }).fill('不存在的地址');
  await page.getByRole('button', { name: '查路线', exact: true }).click();
  await expect(page.locator('.route-status')).toContainText('未找到该地址');
  await page.getByRole('textbox', { name: '出发地' }).fill('杭州市西湖区地铁站');
  await page.getByRole('button', { name: '查路线', exact: true }).click();
  await expect(page.locator('.route-duration')).toHaveText('约 30 分钟');
  await page.evaluate(() => { routeTest.delays.transit = 400; });
  await page.getByRole('tab', { name: '公交', exact: true }).click();
  await page.getByRole('button', { name: '关闭路线' }).click();
  await page.waitForTimeout(450);
  await expect(page.locator('#task-route')).toHaveCount(0);
  expect(errors).toEqual([]);
  console.log('路线面板通过：公交多方案选择、换乘与步行信息、地图和上下车站同步、未报名详细地点、GPS转换、三种出行方式、距离和到达时间、手动起点、定位拒绝、无路线、竞态与关闭、三种屏幕宽度。');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
