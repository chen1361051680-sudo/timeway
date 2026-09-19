import { chromium, expect } from '@playwright/test';
import { createTimewayServer } from '../server.mjs';
import { seedHall } from './hall-fixture.mjs';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
const { session, tasks } = seedHall(server);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
const context = await browser.newContext({
  viewport: { width: 470, height: 836 },
  isMobile: true,
  hasTouch: true,
});
await context.addCookies([{ name: 'tw_session', value: session.token, url: base }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
});
await mkdir('tmp/ui-checks', { recursive: true });
const cards = page.locator('.hall-card');
const search = page.getByRole('searchbox');
async function applyFilter(id, field, value) {
  await page.locator(`[data-action=hall-filter][data-id=${id}]`).click();
  const input = page.locator(`#modal-form [name=${field}]`);
  if (await input.evaluate((el) => el.tagName === 'SELECT')) await input.selectOption(value);
  else await input.fill(value);
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
try {
  await page.goto(base + '/#services');
  await expect(page.getByRole('heading', { name: '服务大厅', exact: true })).toBeVisible();
  await expect(cards).toHaveCount(6);
  await expect(page.locator('.hall-count')).toHaveText('2');
  await expect(page.locator('.hall-arrival')).toHaveCount(0);
  await expect(page.getByText('不可公开的测试私人门牌301')).toHaveCount(0);
  await expect(page.locator('.bottom-nav [aria-current=page]')).toHaveText('服务大厅');
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [470, 836],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `tmp/ui-checks/hall-${width}.png`, fullPage: true });
    if (width === 470) await page.screenshot({ path: 'tmp/ui-checks/hall-preview.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of await cards.all()) {
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      expect(await card.evaluate((el) => {
        const detail = el.querySelector('.hall-detail').getBoundingClientRect();
        const chips = el.querySelector('.hall-chips').getBoundingClientRect();
        const badge = el.querySelector('.hall-card-bottom > :first-child').getBoundingClientRect();
        return detail.top >= chips.bottom + 5 &&
          (detail.left >= badge.right + 5 || detail.top >= badge.bottom + 5);
      })).toBe(true);
    }
  }
  await page.setViewportSize({ width: 320, height: 700 });
  await page.evaluate(() => document.documentElement.classList.add('large-text'));
  const firstHeading = cards.first().locator('h3');
  const originalTitle = await firstHeading.textContent();
  await firstHeading.evaluate((el) => { el.textContent = '陪伴社区长者前往医院挂号取药并协助完成就诊安排'; });
  for (const card of await cards.all()) {
    expect(await card.evaluate((el) => {
      const detail = el.querySelector('.hall-detail').getBoundingClientRect();
      const chips = el.querySelector('.hall-chips').getBoundingClientRect();
      const badge = el.querySelector('.hall-card-bottom > :first-child').getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth + 1 && detail.top >= chips.bottom + 5 &&
        (detail.left >= badge.right + 5 || detail.top >= badge.bottom + 5);
    })).toBe(true);
  }
  await page.screenshot({ path: 'tmp/ui-checks/hall-card-large.png', fullPage: true });
  await firstHeading.evaluate((el, title) => { el.textContent = title; }, originalTitle);
  await page.evaluate(() => document.documentElement.classList.remove('large-text'));
  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill('第一人民医院');
  await search.press('Enter');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('陪诊协助');
  await page.locator('[data-action=reset-filter]').click();
  await applyFilter('category', 'category', '生活协助');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('居家清洁整理');
  await page.locator('[data-action=hall-filter][data-id=category]').click();
  await page.locator('[name=category]').selectOption('陪诊协助');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(cards).toContainText('居家清洁整理');
  await page.locator('[data-action=reset-filter]').click();
  await applyFilter('minutes', 'minutes', '90');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('陪同散步');
  await page.locator('[data-action=reset-filter]').click();
  await applyFilter(
    'date',
    'date',
    new Date(tasks[1].start).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }),
  );
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('陪诊协助');
  await page.locator('[data-action=reset-filter]').click();
  await applyFilter('minutes', 'minutes', '30');
  await expect(cards).toHaveCount(0);
  await expect(page.getByText('暂无符合条件的需求')).toBeVisible();
  await page.screenshot({ path: 'tmp/ui-checks/hall-empty.png' });
  await page.getByRole('button', { name: '重置筛选', exact: true }).click();
  await page.getByRole('tab', { name: /我参与的/ }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: '已完成', exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: '待处理', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.screenshot({ path: 'tmp/ui-checks/hall-mine.png' });
  await page.getByRole('tab', { name: '发现需求', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 170));
  // Playwright may scroll a partially visible card before clicking it. Compare
  // with the actual click position, which is the position the router preserves.
  await cards.first().evaluate((el) => el.addEventListener('click', () => { window.hallClickScroll = scrollY; }, { once: true }));
  await cards.first().click();
  const beforeScroll = await page.evaluate(() => window.hallClickScroll);
  await expect(page).toHaveURL(/#task\//);
  await page.getByRole('button', { name: '报名参与', exact: true }).click();
  await page.getByRole('button', { name: '提交报名', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我的参与' })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page).toHaveURL(/#services$/);
  await expect(page.locator('.hall-count')).toHaveText('3');
  expect(Math.abs((await page.evaluate(() => scrollY)) - beforeScroll)).toBeLessThan(5);
  await expect(cards.first()).toContainText('待确认');
  await expect(cards.nth(1)).toContainText('陪诊协助');
  await page.setViewportSize({ width: 470, height: 836 });
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'tmp/ui-checks/hall-start-order.png' });
  expect(errors).toEqual([]);
  console.log(
    '服务大厅通过：4种视口、图片字体加载、搜索、取消/重置筛选、类型/日期/时长、空状态、参与分组、报名后更新、详情返回滚动、开始时间排序、隐私检查。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
