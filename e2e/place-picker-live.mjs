import { chromium, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';

const env = { ...parseEnv(await readFile('.env', 'utf8')), ...process.env };
assert.ok(env.BAIDU_MAP_BROWSER_AK, '需要百度浏览器地图凭据');
const server = createTimewayServer({ environment: 'test', databasePath: ':memory:', mapProvider: 'baidu', baiduBrowserAk: env.BAIDU_MAP_BROWSER_AK });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const { auth, domain } = server.context;
  const session = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' });
  domain.profile(session.user, { ...session.user, contact: '联调联系人', contactPhone: session.user.phone, region: '长沙市 · 雨花区', address: '长沙市雨花区人民政府' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'tw_session', value: session.token, url: base }]);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message.replaceAll(env.BAIDU_MAP_BROWSER_AK, '[redacted]')));
  await page.goto(base + '/#publish/help');
  await page.locator('[data-action=pub-place]').click();
  const dialog = page.locator('#place-picker');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-pick=city]')).toContainText('长沙市');
  await expect(dialog.locator('.place-city-editor')).toBeHidden();
  await expect(dialog.locator('.place-map-wrap')).toBeHidden();
  await expect(dialog.locator('[data-pick=retry]')).toBeHidden();
  await expect(dialog.locator('.place-recovery [data-pick=manual]')).toBeHidden();
  await expect(dialog.locator('[data-pick=org]')).toContainText('雨花区人民政府');
  async function layout() {
    for (const [width, height] of [[320, 680], [390, 844], [440, 956], [520, 760], [390, 400]]) {
      await page.setViewportSize({ width, height });
      const measured = await dialog.evaluate(el => {
        const rect = el.getBoundingClientRect(), footer = el.querySelector('.place-footer');
        return { documentOverflow: document.documentElement.scrollWidth > innerWidth, dialogOverflow: el.scrollWidth > el.clientWidth, within: rect.top >= 0 && rect.bottom <= innerHeight + 1, footer: footer.hidden || footer.getBoundingClientRect().bottom <= rect.bottom + 1 };
      });
      assert.deepEqual(measured, { documentOverflow: false, dialogOverflow: false, within: true, footer: true }, `尺寸 ${width}×${height}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await layout();
  const query = dialog.getByRole('textbox', { name: '搜索服务地点' });
  await query.fill('湖南省植物园');
  const plant = dialog.locator('.place-results button').filter({ has: page.locator('strong').filter({ hasText: /^湖南省植物园$/ }) });
  await expect(plant).toBeVisible({ timeout: 30000 });
  await layout();
  await plant.click();
  await expect(dialog.getByRole('button', { name: '确认地点', exact: true })).toBeEnabled({ timeout: 20000 });
  await expect(dialog.locator('.place-selected')).toContainText('雨花区');
  await expect(dialog.locator('.place-results')).toBeHidden();
  await layout();
  await dialog.getByRole('button', { name: '确认地点', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const value = JSON.parse(await page.locator('[name=place]').inputValue());
  assert.equal(value.name, '湖南省植物园');
  assert.equal(value.city, '长沙市');
  assert.equal(value.district, '雨花区');
  assert.ok(Number.isFinite(value.lat) && Number.isFinite(value.lng));
  await expect(page.locator('#pub-place-name')).toHaveText('湖南省植物园');

  // 通过真实发布流程保存选址，随后验证当前机构的最近使用地点。
  await page.getByRole('textbox', { name: '服务标题', exact: true }).fill('选址流程联调需求');
  await page.getByRole('textbox', { name: '具体服务内容', exact: true }).fill('独立测试数据库中的选址流程验证');
  await page.getByRole('button', { name: '预览并发布', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page).toHaveURL(/#services$/);
  const saved = server.context.store.all('task').find(t => t.title === '选址流程联调需求');
  assert.deepEqual(saved.place, value);
  await page.goto(base + '/#publish/help');
  await page.locator('[data-action=pub-place]').click();
  await expect(dialog.locator('.place-recent-list button')).toHaveCount(1, { timeout: 10000 });
  await dialog.locator('.place-recent-list button').click();
  await expect(dialog.locator('[data-pick=confirm]')).toBeEnabled({ timeout: 20000 });
  await dialog.locator('[data-pick=search-mode]').click();
  await query.fill('地点不存在zxqv827493');
  await expect(dialog.getByRole('button', { name: '手动填写地址', exact: true })).toBeVisible({ timeout: 20000 });
  await expect(dialog.locator('[data-pick=confirm]')).toBeHidden();
  await dialog.getByRole('button', { name: '手动填写地址', exact: true }).click();
  await expect(page.locator('#publish-form [name=address]')).toBeFocused();

  await page.locator('[data-action=pub-place]').click();
  await dialog.locator('[data-pick=org]').click();
  await expect(dialog.locator('.place-results button').first()).toBeVisible({ timeout: 20000 });
  await expect(query).toHaveValue('长沙市雨花区人民政府');
  await dialog.locator('[data-pick=city]').click();
  await dialog.getByRole('textbox', { name: '搜索城市或区县' }).fill('杭州市');
  await dialog.getByRole('button', { name: '应用', exact: true }).click();
  await query.fill('西湖区人民政府');
  await expect(dialog.locator('.place-results button').first()).toBeVisible({ timeout: 20000 });
  await expect(dialog.locator('[data-pick=city]')).toContainText('杭州市');
  await dialog.locator('.place-results > button').first().click();
  await expect(dialog.locator('[data-pick=confirm]')).toBeEnabled({ timeout: 20000 });
  await expect(dialog.locator('.place-selected')).toContainText('杭州市');
  await dialog.locator('[data-pick=search-mode]').click();
  await dialog.locator('[data-pick=clear]').click();
  await expect(dialog.locator('.place-results')).toBeHidden();
  await expect(dialog.locator('.place-suggestions')).toBeVisible();
  await dialog.locator('[data-pick=map]').click();
  await expect(dialog.locator('.place-map-wrap')).toBeVisible({ timeout: 20000 });
  await expect(dialog.locator('[data-pick=confirm]')).toBeDisabled();
  const bounds = await dialog.locator('.place-map').boundingBox();
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(dialog.locator('[data-pick=confirm]')).toBeEnabled({ timeout: 20000 });
  await expect(dialog.locator('.place-selected')).toContainText('杭州市');
  await dialog.locator('[data-pick=search-mode]').click();
  await query.fill('医院');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-action=pub-place]')).toBeFocused();
  assert.deepEqual(errors, []);
  console.log('实际百度搜索、地址核对、城市切换、机构地址、最近使用、地图选点、手动填写及手机尺寸检查通过。');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
