import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createTimewayServer } from '../server.mjs';
const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await mkdir('tmp/header-checks', { recursive: true });
try {
  for (const role of ['volunteer', 'requester']) {
    const context = await browser.newContext();
    await context.request.post(base + '/api/auth/demo-login', {
      data: { role, account: role, password: 'timeway123' },
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/#services');
    for (const width of [320, 390, 520, 800]) {
      await page.setViewportSize({ width, height: 844 });
      let baseline;
      for (const route of ['services', 'bank', 'profile']) {
        await page.locator(`.bottom-nav a[href="#${route}"]`).click();
        await expect(page.locator('.bottom-nav [aria-current=page]')).toHaveAttribute('href', '#' + route);
        await page.evaluate(() => document.fonts.ready);
        const data = await page.evaluate(() => {
          const header = document.querySelector(
            '.hall-header,.bank-header,.profile-cover,.requester-hall-header,.ra-header,.rp-cover',
          );
          const card = document.querySelector(
            '.hall-sheet,.bank-account-card,.profile-identity,.requester-hall-sheet,.rb-summary,.rp-identity',
          );
          const h = header.getBoundingClientRect(),
            t = header.querySelector('h1').getBoundingClientRect(),
            subtitle = header.querySelector('p').getBoundingClientRect(),
            c = card.getBoundingClientRect();
          return {
            header: [h.x, h.y, h.width, h.height],
            title: [t.x, t.y, t.height],
            subtitle: [subtitle.x, subtitle.y, subtitle.height],
            card: [c.x, c.y, c.width],
            font: getComputedStyle(header.querySelector('h1')).fontSize,
          };
        });
        if (baseline) expect(data).toEqual(baseline);
        else baseline = data;
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (width === 390) await page.screenshot({ path: `tmp/header-checks/${role}-${route}.png` });
      }
    }
    expect(errors).toEqual([]);
    await context.close();
  }
  console.log(
    '顶部对齐检查通过：两个角色、三个页面、四种宽度，背景图高度、标题坐标、首张卡片位置和宽度完全一致。',
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
