import { chromium, expect } from '@playwright/test';
import { createTimewayServer } from '../server.mjs';
import { seedBank } from './bank-fixture.mjs';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
const c = seedBank(server);
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
await context.addCookies([{ name: 'tw_session', value: c.session.token, url: base }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
await mkdir('tmp/ui-checks', { recursive: true });
const cards = page.locator('.bank-service-card');
async function filter(id, value) {
  await page.locator(`[data-action=bank-filter][data-id=${id}]`).first().click();
  const input = page.locator(`#modal-form [name=${id}]`);
  if (await input.evaluate((el) => el.tagName === 'SELECT')) await input.selectOption(value);
  else await input.fill(value);
  await page.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
}
try {
  await page.goto(base + '/#bank');
  await expect(page.getByRole('heading', { name: '时间银行', exact: true })).toBeVisible();
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.bank-available strong')).toHaveText('96小时');
  await expect(page.locator('.bottom-nav [aria-current=page]')).toHaveText('时间银行');
  await expect(page.getByText('不可公开的测试私人门牌301')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [470, 836],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `tmp/ui-checks/bank-${width}.png`, fullPage: true });
    if (width === 470) await page.screenshot({ path: 'tmp/ui-checks/bank-preview.png' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of await cards.all())
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await filter('org', c.org.id);
  await expect(cards).toHaveCount(4);
  await filter('minutes', '90');
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('陪同散步');
  await page.locator('[data-action=bank-filter][data-id=minutes]').click();
  await page.locator('[name=minutes]').selectOption('180');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await filter('minutes', '');
  await filter('sort', 'remaining');
  await expect(cards.first()).toContainText('居家清洁整理');
  await filter('date', new Date(c.tasks[1].start).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }));
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('陪同就医');
  await filter('date', '2040-01-01');
  await expect(cards).toHaveCount(0);
  await expect(page.getByText('暂无可兑换服务', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'tmp/ui-checks/bank-empty.png' });
  await page.getByRole('button', { name: '重置筛选', exact: true }).first().click();
  await filter('org', c.other.id);
  await expect(page.locator('.bank-available strong')).toHaveText('0小时');
  await expect(cards).toHaveCount(1);
  await cards.first().click();
  await expect(page.getByRole('button', { name: '对应机构可用时间不足', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await filter('org', '');
  await page.getByRole('button', { name: '可用时间及累计贡献说明' }).click();
  await expect(page.getByRole('dialog')).toContainText('176 小时');
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.locator('.bank-ledger-button').click();
  await page.locator('#bank-ledger-form [name=type]').selectOption('credit');
  await page.getByRole('button', { name: '筛选明细' }).click();
  await expect(page.locator('.bank-ledger-rows .ledger-row')).toHaveCount(8);
  await page.locator('#bank-ledger-form [name=type]').selectOption('pending');
  await page.getByRole('button', { name: '筛选明细' }).click();
  await expect(page.locator('.bank-ledger-rows')).toContainText('8 小时');
  await page.screenshot({ path: 'tmp/ui-checks/bank-ledger.png' });
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('tab', { name: '我的兑换', exact: true }).click();
  await page.getByRole('button', { name: '待确认', exact: true }).click();
  await expect(page.locator('.bank-booking-card')).toHaveCount(1);
  await page.locator('.bank-booking-card').click();
  await page.getByRole('button', { name: '取消预约', exact: true }).click();
  await page.locator('[name=reason]').fill('测试取消并释放时间');
  await page.locator('#modal-form button[type=submit]').click();
  await expect(page.locator('.badge')).toContainText('已取消');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.bank-available strong')).toHaveText('108小时');
  await page.locator('.bank-ledger-button').click();
  await page.locator('#bank-ledger-form [name=type]').selectOption('release');
  await page.getByRole('button', { name: '筛选明细' }).click();
  await expect(page.locator('.bank-ledger-rows .ledger-row')).toHaveCount(1);
  await expect(page.locator('.bank-ledger-rows')).toContainText('12 小时');
  await page.getByRole('button', { name: '关闭弹窗' }).click();
  await page.getByRole('tab', { name: '可兑换服务', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 150));
  await cards.first().click();
  await page.getByRole('button', { name: '申请兑换', exact: true }).click();
  await page.locator('[name=recipient]').fill('本人');
  await page.locator('[name=consent]').check();
  await page.getByRole('button', { name: '确认申请', exact: true }).click();
  await expect(page).toHaveURL(/#booking\//);
  await expect(page.getByRole('heading', { name: '兑换预约详情', exact: true })).toBeVisible();
  await page.locator('.bottom-nav a[href="#bank"]').click();
  await expect(page.locator('.bank-available strong')).toHaveText('106小时');
  await expect(page.getByRole('tab', { name: '我的兑换', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: '可兑换服务', exact: true }).click();
  await page.evaluate(() => scrollTo(0, 150));
  const returnScroll = await page.evaluate(() => scrollY);
  await cards.first().click();
  await expect(page.getByRole('link', { name: '查看我的兑换安排', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  expect(Math.abs((await page.evaluate(() => scrollY)) - returnScroll)).toBeLessThan(5);
  await page.evaluate(() => document.documentElement.classList.add('large-text'));
  await page.screenshot({ path: 'tmp/ui-checks/bank-large-text.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  console.log(
    '时间银行通过：4种视口、字体/图片加载、机构/日期/时长/排序、取消筛选、空状态、余额不足、贡献说明、流水筛选、兑换状态、取消释放、申请占用、重复申请入口、详情返回滚动与大字模式。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
