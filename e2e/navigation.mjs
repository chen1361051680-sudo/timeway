import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { createTimewayServer } from '../server.mjs';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const routes = ['map', 'services', 'bank', 'profile'];
const errors = [];
try {
  for (const role of ['volunteer', 'requester']) {
    const context = await browser.newContext();
    const response = await context.request.post(base + '/api/auth/demo-login', {
      data: { role, account: role, password: 'timeway123' },
    });
    expect(response.ok()).toBe(true);
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/#map');
    for (const width of [320, 390, 520, 800]) {
      await page.setViewportSize({ width, height: 850 });
      let baseline;
      for (const route of [...routes, 'map']) {
        await page.locator(`.bottom-nav a[href="#${route}"]`).click();
        await expect(page.locator('.bottom-nav [aria-current=page]')).toHaveAttribute('href', '#' + route);
        await page.evaluate(() => document.fonts.ready);
        const geometry = await page.locator('.bottom-nav').evaluate((nav) => {
          const rect = (el) => {
            const r = el.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height];
          };
          return {
            nav: rect(nav),
            links: [...nav.children].map((a) => ({
              box: rect(a),
              icon: rect(a.querySelector('svg')),
              text: rect(a.querySelector('span')),
              shape: a.querySelector('svg').innerHTML,
              font: getComputedStyle(a).fontSize,
              weight: getComputedStyle(a).fontWeight,
            })),
          };
        });
        expect(geometry.nav[3]).toBe(64);
        expect(geometry.nav[1] + geometry.nav[3]).toBe(850);
        expect(geometry.nav[2]).toBe(Math.min(width, 520));
        if (baseline) expect(geometry).toEqual(baseline);
        baseline = geometry;
        expect(geometry.links.map((a) => a.icon[3])).toEqual([24, 24, 24, 24]);
        expect(new Set(geometry.links.map((a) => a.icon[1])).size).toBe(1);
        expect(new Set(geometry.links.map((a) => a.text[1])).size).toBe(1);
        expect(geometry.links.map((a) => a.font)).toEqual(['12px', '12px', '12px', '12px']);
        await expect
          .poll(() => page.locator('.bottom-nav .active').evaluate((el) => getComputedStyle(el).color))
          .toBe('rgb(255, 110, 85)');
      }
    }
    const user = server.context.store.user(role === 'volunteer' ? 'demo-vol' : 'demo-org');
    user.settings.fontSize = 'large';
    server.context.store.saveUser(user);
    await page.reload();
    for (const route of routes) {
      await page.locator(`.bottom-nav a[href="#${route}"]`).click();
      await expect(page.locator('.bottom-nav [aria-current=page]')).toHaveAttribute('href', '#' + route);
      expect(await page.locator('.bottom-nav').evaluate((el) => el.getBoundingClientRect().height)).toBe(64);
      expect(await page.locator('.bottom-nav .active').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
        '12px',
      );
    }
    await context.close();
  }
  expect(errors).toEqual([]);
  console.log(
    '底部导航验证通过：两个角色、四个页面、四种宽度及大字模式；高度 64px，图标 24px，图标与文字对齐且切换前后位置一致。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
