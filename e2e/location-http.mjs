import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { createTimewayServer } from '../server.mjs';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:', mapProvider: 'baidu', baiduBrowserAk: 'test-only' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false });
    window.gpsRequests = 0;
    navigator.geolocation.getCurrentPosition = () => { window.gpsRequests++; };
    // Independent of the external AK allowlist: no real map request is made.
    window.BMap = { Map: class { constructor() { throw new Error('测试地图未就绪'); } } };
  });
  const login = await context.request.post(base + '/api/auth/demo-login', {
    data: { role: 'volunteer', account: 'volunteer', password: 'timeway123' },
  });
  expect(login.ok()).toBe(true);
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('[data-action="map-region-locate"]').click();
  await expect(page.getByRole('dialog')).toContainText('HTTP 局域网');
  await expect(page.getByRole('dialog')).toContainText('HTTPS');
  await expect(page.getByRole('button', { name: '手动选择地区', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重新定位', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.gpsRequests)).toBe(0);
  console.log('HTTP 定位提示通过：说明 HTTPS 限制，保留手动入口，不请求 GPS 或建议无效重试。');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
