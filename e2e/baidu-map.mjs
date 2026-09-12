// Opt-in live SDK check. Uses the public browser AK and an isolated in-memory SQLite database.
import { chromium, devices, expect } from '@playwright/test';
import { createTimewayServer } from '../server.mjs';
import { once } from 'node:events';
import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';

const env = parseEnv(await readFile('.env', 'utf8').catch(() => ''));
const ak = process.env.BAIDU_MAP_BROWSER_AK || env.BAIDU_MAP_BROWSER_AK;
if (!ak) throw new Error('本检查需要 .env 中的 BAIDU_MAP_BROWSER_AK');
const server = createTimewayServer({
  environment: 'test',
  databasePath: ':memory:',
  mapProvider: 'baidu',
  baiduBrowserAk: ak,
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
await mkdir('tmp/baidu-checks', { recursive: true });
try {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    geolocation: { latitude: 30.25, longitude: 120.15 },
    permissions: ['geolocation'],
  });
  for (const role of ['requester', 'volunteer']) {
    const r = await context.request.post(base + '/api/auth/demo-login', {
      data: { role, account: role, password: 'timeway123' },
    });
    expect(r.ok()).toBe(true);
  }
  const { store, domain } = server.context;
  const input = (n) => ({
    kind: 'help',
    title: `地图验证需求${n}`,
    category: '陪伴交流',
    description: '独立测试数据',
    recipient: '测试受助对象',
    region: '杭州西湖区',
    address: '不能公开的测试门牌301',
    start: new Date(Date.now() + 86400000 * (n + 1)).toISOString(),
    end: new Date(Date.now() + 86400000 * (n + 1) + 3600000).toISOString(),
    deadline: new Date(Date.now() + 86400000).toISOString(),
    minutes: 60,
    capacity: 3,
    status: 'published',
    lat: 30.25 + n * 0.01,
    lng: 120.15 + n * 0.01,
  });
  const org = store.user('demo-org'),
    volunteer = store.user('demo-vol');
  const done = domain.createTask(org, input(0));
  const application = domain.apply(volunteer, done.id, {});
  domain.applicationAction(org, application.id, { action: 'accept' });
  const row = store.get('task', done.id);
  row.start = new Date(Date.now() - 7200000).toISOString();
  row.end = new Date(Date.now() - 3600000).toISOString();
  store.put('task', row);
  domain.applicationAction(volunteer, application.id, {
    action: 'submit',
    start: row.start,
    end: row.end,
    rest: 0,
    content: '测试已完成服务',
    note: '测试补录',
  });
  domain.recordAction(org, application.id, { action: 'confirm', minutes: 60, recipients: 1 });
  const nearbyNeed = domain.createTask(org, input(1));
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__locationCalls = 0;
    const locate = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args) => {
      window.__locationCalls++;
      locate(...args);
    };
  });
  const errors = [],
    tileResponses = [];
  const redact = (text) =>
    text.replaceAll(ak, '[redacted]').replace(/https?:\/\/[^\s"']+/g, (url) => url.split('?')[0]);
  page.on('pageerror', (e) => errors.push(redact(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(redact(m.text()));
  });
  page.on('response', (r) => {
    if (new URL(r.url()).searchParams.get('qt') === 'vtile' && r.ok()) tileResponses.push(true);
  });
  await page.goto(base + '/#map');
  await expect(page.locator('.map-region-label')).toHaveText(/^杭州·.+/, { timeout: 60000 });
  expect(await page.evaluate(() => window.__locationCalls)).toBe(1);
  await expect(page.locator('#baidu-map-slot')).toHaveAttribute('data-state', 'ready', { timeout: 60000 });
  await expect(page.locator('.baidu-pin.map-pin-love')).toHaveCount(1, { timeout: 20000 });
  await expect(page.locator('.baidu-pin.map-pin-need')).toHaveCount(1);
  await expect(page.locator('.map-stat strong')).toHaveText(['1', '1', '1']);
  expect(tileResponses.length).toBeGreaterThan(0);
  await expect(page.locator('main')).not.toContainText('不能公开的测试门牌');
  await page.screenshot({ path: 'tmp/baidu-checks/real-map.png', fullPage: true });

  const zoom = await page.evaluate(async () => (await import('/baidu-map.js')).baiduMap.map.getZoom());
  await page.getByRole('button', { name: '放大地图', exact: true }).click();
  await expect
    .poll(() => page.evaluate(async () => (await import('/baidu-map.js')).baiduMap.map.getZoom()))
    .toBe(zoom + 1);
  await page.getByRole('switch', { name: '显示待帮助' }).click();
  await expect(page.locator('.baidu-pin.map-pin-need')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(async () => (await import('/baidu-map.js')).baiduMap.map.getZoom()))
    .toBe(zoom + 1);
  await page.getByRole('switch', { name: '显示待帮助' }).click();
  await expect(page.locator('.baidu-pin.map-pin-need')).toHaveCount(1);
  // Automatic GPS centers on the user rather than fitting all fixtures into view.
  await page.getByRole('button', { name: '收起需求面板', exact: true }).click();
  await page.evaluate(async (id) => {
    const m = (await import('/baidu-map.js')).baiduMap;
    m.map.panTo(m.points.get(id));
  }, nearbyNeed.id);
  await page.locator('.baidu-pin.map-pin-need').click();
  await expect(page.getByRole('button', { name: '收起需求面板', exact: true })).toBeVisible();
  await expect(page.locator('.map-task-card')).toContainText('地图验证需求1');

  await page.getByRole('button', { name: '搜索地点、社区服务', exact: true }).click();
  await page.getByLabel('地点、需求或机构关键词').fill('杭州西湖');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.locator('.map-place-result').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.map-place-result').first().click();
  await expect(page.locator('dialog')).not.toBeVisible();
  const center = await page.evaluate(async () => {
    const m = (await import('/baidu-map.js')).baiduMap;
    window.__testMapInstance = m.map;
    return { ...m.map.getCenter() };
  });
  await page.getByRole('link', { name: '服务大厅', exact: true }).click();
  await page.getByRole('link', { name: '爱心地图', exact: true }).click();
  await expect(page.locator('#baidu-map-slot')).toHaveAttribute('data-state', 'ready');
  expect(
    await page.evaluate(
      async () => (await import('/baidu-map.js')).baiduMap.map === window.__testMapInstance,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(async () => ({ ...(await import('/baidu-map.js')).baiduMap.map.getCenter() })),
  ).toEqual(center);

  expect(await page.evaluate(() => window.__locationCalls)).toBe(1);
  // Hold the test geolocation callback to inspect the loading state and duplicate-click guard.
  await page.evaluate(() => {
    const locate = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition = (...args) => {
      window.__completeLocation = () => locate(...args);
    };
    window.__restoreLocation = () => {
      navigator.geolocation.getCurrentPosition = locate;
    };
  });
  await page.getByRole('button', { name: '定位并更新所在地区', exact: true }).click();
  await expect(page.locator('.map-region-label')).toHaveText('定位中…');
  await expect(page.getByRole('button', { name: '定位并更新所在地区' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '回到当前位置' })).toBeDisabled();
  await page.evaluate(() => {
    window.__completeLocation();
    window.__restoreLocation();
  });
  await expect(page.locator('.map-region-label')).toHaveText(/^杭州·.+/, { timeout: 20000 });
  await expect(page.getByRole('button', { name: '定位并更新所在地区' })).toBeEnabled();
  await page.screenshot({ path: 'tmp/baidu-checks/located-region.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(await page.evaluate(() => window.__locationCalls)).toBe(2);
  await page.getByRole('button', { name: '回到当前位置', exact: true }).click();
  await expect
    .poll(() => page.evaluate(async () => !!(await import('/baidu-map.js')).baiduMap.located), {
      timeout: 20000,
    })
    .toBe(true);
  const location = await page.evaluate(async () => (await import('/baidu-map.js')).baiduMap.located);
  expect(Math.abs(location.lng - 120.15)).toBeLessThan(0.03);
  expect(Math.abs(location.lat - 30.25)).toBeLessThan(0.03);
  // Mock a denial to verify fallback without requesting the user's device location.
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (_, error) => error({ code: 1 });
  });
  await page.getByRole('button', { name: '回到当前位置', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('未获定位权限');
  await expect(page.getByRole('button', { name: '手动搜索位置', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  const regionBeforeDenial = await page.locator('.map-region-label').textContent();
  await page.getByRole('button', { name: '定位并更新所在地区', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('未获定位权限');
  await expect(page.locator('.map-region-label')).toHaveText(regionBeforeDenial);
  await page.getByRole('button', { name: '重新定位', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('未获定位权限');
  await page.getByRole('button', { name: '手动选择地区', exact: true }).click();
  await page.getByLabel('城市或区县（留空查看全部）').fill('上海');
  await page.getByRole('button', { name: '查看这个区域', exact: true }).click();
  await expect(page.locator('.map-region-label')).toHaveText('上海');
  await expect(page.locator('.baidu-pin.map-pin-need')).toHaveCount(0);
  expect(errors).toEqual([]);

  const failed = await context.newPage();
  await failed.route('https://api.map.baidu.com/api?*', (route) => route.abort());
  await failed.goto(base + '/#map');
  await expect(failed.locator('#baidu-map-slot')).toHaveAttribute('data-state', 'error');
  await expect(failed.getByRole('button', { name: '查看区域与需求列表' })).toBeVisible();
  console.log(
    '真实百度瓦片、网格转换、标记、搜索、缩放、返回保留、模拟定位与权限拒绝、加载失败降级：全部通过。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
