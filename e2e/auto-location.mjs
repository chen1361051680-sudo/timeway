import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { createTimewayServer } from '../server.mjs';

// Isolate browser permission behavior from external Baidu SDK/network availability.
const mapStub = `export const baiduMap = {
  suspend() {},
  async mount() { document.querySelector('#baidu-map-slot').dataset.state = 'ready'; return true; },
  async locate() { return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
    p => { this.located = { lng: p.coords.longitude, lat: p.coords.latitude }; resolve(this.located); },
    e => reject(new Error(e.code === 1 ? '未获定位权限' : '未能获取当前位置')))); },
  async centerRegion() { return { city: '杭州市', district: '西湖区' }; }
};`;
const server = createTimewayServer({
  environment: 'test',
  databasePath: ':memory:',
  mapProvider: 'baidu',
  baiduBrowserAk: 'isolated-test-key',
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  for (const role of ['volunteer', 'requester']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.request.post(base + '/api/auth/demo-login', {
      data: { role, account: role, password: 'timeway123' },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/baidu-map.js', (r) => r.fulfill({ contentType: 'text/javascript', body: mapStub }));
    await page.addInitScript(() => {
      window.locationCalls = 0;
      navigator.geolocation.getCurrentPosition = (success, fail) => {
        window.locationCalls++;
        window.finishLocation = () => success({ coords: { longitude: 120.12, latitude: 30.27 } });
        window.denyLocation = () => fail({ code: 1 });
      };
    });
    await page.goto(base + '/#map');
    await expect.poll(() => page.evaluate(() => window.locationCalls)).toBe(1);
    await expect(page.locator('.map-region-label')).toHaveText('定位中…');
    await expect(page.getByRole('button', { name: '定位并更新所在地区' })).toBeDisabled();
    await page.evaluate(() => window.finishLocation());
    await expect(page.locator('.map-region-label')).toHaveText('杭州·西湖区');
    for (const route of ['services', 'map', 'bank', 'map']) {
      await page.locator(`.bottom-nav a[href="#${route}"]`).click();
      await expect(page.locator('.bottom-nav [aria-current=page]')).toHaveAttribute('href', '#' + route);
    }
    expect(await page.evaluate(() => window.locationCalls)).toBe(1);
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.locationCalls)).toBe(1);
    await page.evaluate(() => window.denyLocation());
    await expect(page.getByRole('button', { name: '定位并更新所在地区' })).toBeEnabled();
    await expect(page.locator('.map-region-label')).not.toHaveText('全部地区');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.locator('.bottom-nav a[href="#services"]').click();
    await page.locator('.bottom-nav a[href="#map"]').click();
    await expect(page.locator('.map-region-label')).not.toHaveText('定位中…');
    expect(await page.evaluate(() => window.locationCalls)).toBe(1);
    await page.getByRole('button', { name: '定位并更新所在地区' }).click();
    await expect.poll(() => page.evaluate(() => window.locationCalls)).toBe(2);
    await page.evaluate(() => window.finishLocation());
    await expect(page.locator('.map-region-label')).toHaveText('杭州·西湖区');
    expect(errors).toEqual([]);
    await context.close();
  }
  console.log(
    '自动定位检查通过：两个角色、首次申请、加载提示、成功更新地区、拒绝不阻断、不重复申请、手动重试。',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
