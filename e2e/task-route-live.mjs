// Opt-in real Baidu SDK validation. Only test GPS and isolated task data are simulated.
import { chromium, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { once } from 'node:events';
import { createTimewayServer } from '../server.mjs';
import { newPublication } from '../public/publish.js';
const env = parseEnv(await readFile('.env', 'utf8'));
const ak = process.env.BAIDU_MAP_BROWSER_AK || env.BAIDU_MAP_BROWSER_AK;
if (!ak) throw new Error('真实路线检查需要配置浏览器地图 AK');
const server = createTimewayServer({ environment: 'test', databasePath: ':memory:', mapProvider: 'baidu', baiduBrowserAk: ak });
const { auth, domain: d } = server.context;
const org = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' }).user;
const vol = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' });
const task = d.createTask(org, { ...newPublication('help', org), title: '真实路线验证', description: '隔离测试', region: '杭州市西湖区', address: '杭州西湖服务地点（测试）', lat: 30.255, lng: 120.153 });
server.listen(0, '127.0.0.1'); await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 30.25, longitude: 120.15 }, permissions: ['geolocation'] });
  await context.addCookies([{ name: 'tw_session', value: vol.token, url: base }]);
  const page = await context.newPage();
  await page.goto(base + '/#task/' + task.id);
  await page.getByRole('button', { name: '查看前往服务地点的路线' }).click();
  for (const mode of ['步行', '公交', '驾车']) {
    if (mode !== '步行') await page.getByRole('tab', { name: mode, exact: true }).click();
    try {
      await expect(page.locator('.route-result')).toBeVisible({ timeout: 35000 });
    } catch {
      throw new Error(`${mode}真实路线未返回：${await page.locator('.route-status').textContent()}`);
    }
    console.log(`${mode}：${await page.locator('.route-duration').textContent()}，${await page.locator('.route-distance').textContent()}`);
    await expect(page.locator('.route-arrival')).toContainText('预计');
    if (mode === '公交') {
      const count = await page.locator('.route-plan').count();
      expect(count).toBeGreaterThan(0);
      console.log(`百度实际返回 ${count} 套公交方案`);
      for (let i = 0; i < count; i++) {
        await page.locator('.route-plan').nth(i).click();
        await expect(page.locator('.route-plan').nth(i)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.route-steps h3')).toHaveText(`方案 ${i + 1} · 乘车步骤`);
        await expect(page.locator('.route-duration')).toBeVisible();
      }
      await page.locator('.route-plan').first().click();
      await page.locator('.route-plan').first().scrollIntoViewIfNeeded();
    }
    await mkdir('tmp/route-checks', { recursive: true });
    await page.screenshot({ path: `tmp/route-checks/live-${mode}.png` });
  }
  await page.getByRole('button', { name: '关闭路线' }).click();
  await expect(page).toHaveURL(base + '/#task/' + task.id);
  console.log('真实百度路线验证通过，未使用模拟路线耗时。');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
