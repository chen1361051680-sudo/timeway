import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createTimewayServer } from '../server.mjs';
import { seedRequesterAccount } from './requester-account-fixture.mjs';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
const fixture = seedRequesterAccount(server);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
const context = await browser.newContext({
  viewport: { width: 470, height: 800 },
  isMobile: true,
  hasTouch: true,
});
await context.addCookies([{ name: 'tw_session', value: fixture.session.token, url: base }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
await mkdir('tmp/ui-checks', { recursive: true });
const records = page.locator('.rb-record');
const close = () => page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
const visit = async (route, locator) => {
  await page.goto(base + '/#' + route);
  await expect(page.locator(locator)).toBeVisible();
};
try {
  await visit('bank', '.requester-bank');
  await expect(records).toHaveCount(4);
  await expect(page.locator('.rb-metric-value strong')).toHaveText(['8.5', '18', '1']);
  await expect(page.getByText('测试私人门牌301')).toHaveCount(0);
  await expect(page.locator('.dev-banner')).toHaveCount(0);
  for (const [width, height] of [
    [470, 800],
    [390, 844],
    [320, 700],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    for (const [route, selector] of [
      ['bank', '.requester-bank'],
      ['profile', '.requester-profile'],
    ]) {
      await visit(route, selector);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.bottom-nav')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `tmp/ui-checks/requester-${route}-${width}.png`, fullPage: true });
      for (const card of await page.locator('.rb-record, .rp-card').all())
        expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 470, height: 800 });
  await visit('bank', '.requester-bank');
  await page.locator('[data-action=requester-bank-filter][data-id=task]').click();
  await page.locator('#modal-form [name=task]').selectOption(fixture.tasks[1].id);
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(records).toHaveCount(1);
  await expect(records).toContainText('陈雨欣');
  await records.first().click();
  await expect(page.locator(`[data-record-id="${fixture.tasks[1].recordId}"]`)).toBeFocused();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(records).toHaveCount(1);
  await page.locator('[data-action=requester-bank-filter][data-id=date]').click();
  await page.locator('#modal-form [name=date]').fill('2020-01-01');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(records).toHaveCount(1);
  await page.locator('[data-action=requester-bank-filter][data-id=date]').click();
  await page.locator('#modal-form [name=date]').fill('2020-01-01');
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(records).toHaveCount(0);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(records).toHaveCount(4);
  await page.getByRole('button', { name: '待核实时长 18小时', exact: true }).click();
  await expect(records).toHaveCount(1);
  await expect(records).toContainText('李小雨');
  await page.getByRole('tab', { name: '发放记录', exact: true }).click();
  await expect(records).toHaveCount(4);
  await page.getByRole('tab', { name: '兑换服务', exact: true }).click();
  await expect(page.locator('.rb-offer')).toHaveCount(1);
  await page.getByRole('link', { name: '新增兑换服务', exact: true }).click();
  await expect(page).toHaveURL(/#publish\/redeem$/);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '待处理兑换 1条', exact: true }).click();
  await expect(page.locator('.rb-booking')).toHaveCount(1);
  await page.locator('.rb-booking').click();
  await page.getByRole('button', { name: '接受预约', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('button', { name: '待处理兑换 0条', exact: true })).toBeVisible();
  await expect(page.locator('.rb-booking')).toHaveCount(0);
  await page.getByRole('button', { name: '待处理事项', exact: true }).click();
  await expect(page.locator('.rb-booking')).toHaveCount(2);
  await visit('profile', '.requester-profile');
  await page.locator('.rp-menu-row[data-action=notices]').click();
  await page.getByRole('button', { name: '全部标为已读', exact: true }).click();
  await close();
  await visit('profile', '.requester-profile');
  await expect(page.locator('.rp-stat-value strong')).toHaveText(['4', '4', '8.5']);
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await page.getByLabel('机构名称', { exact: true }).fill('西湖社区服务中心（更新）');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(page.locator('.rp-name-row h2')).toHaveText('西湖社区服务中心（更新）');
  await page.reload();
  await expect(page.locator('.rp-name-row h2')).toHaveText('西湖社区服务中心（更新）');
  await page.getByRole('button', { name: /累计确认发放时长/ }).click();
  await expect(page).toHaveURL(/#bank$/);
  await expect(records).toHaveCount(4);
  await expect(page.locator('.rb-org-name')).toContainText('西湖社区服务中心（更新）');
  await visit('profile', '.requester-profile');
  await page.getByRole('button', { name: '已完成帮扶 4次', exact: true }).click();
  await expect(page.locator('.requester-filter.active')).toHaveText('历史记录');
  await visit('profile', '.requester-profile');
  await page.locator('.rp-menu-row[data-action=history]').click();
  await expect(page.locator('.requester-filter.active')).toHaveText('历史记录');
  await visit('profile', '.requester-profile');
  await page.locator('.rp-menu-row[data-action=my-bookings]').click();
  await expect(page.locator('.rb-tab.active')).toHaveText('兑换预约');
  await expect(page.locator('.rb-booking')).toHaveCount(2);
  await visit('profile', '.requester-profile');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('文字大小', { exact: true }).selectOption('large');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 700 });
  for (const [route, selector] of [
    ['profile', '.requester-profile'],
    ['bank', '.requester-bank'],
  ]) {
    await visit(route, selector);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `tmp/ui-checks/requester-${route}-large.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
  console.log(
    '需求方时间银行与我的通过：四种视口、真实统计、日期/任务筛选、逐人记录定位、返回保持筛选、兑换预约处理、消息已读、机构资料持久化、成果/服务/预约入口、大字模式。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
