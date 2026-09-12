import { chromium, expect } from '@playwright/test';
import { createTimewayServer } from '../server.mjs';
import { seedRequesterHall } from './requester-hall-fixture.mjs';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
const fixture = seedRequesterHall(server);
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
const cards = page.locator('.requester-card');
try {
  await page.goto(base + '/#services');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('.requester-count')).toHaveText('5');
  await expect(page.locator('.published-card')).toContainText([
    '陪伴聊天',
    '陪诊协助',
    '生活帮助',
    '上门探访',
  ]);
  await expect(page.getByText('测试私人门牌301')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [
    [320, 700],
    [390, 844],
    [470, 800],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.bottom-nav')).toBeInViewport();
    await page.screenshot({ path: `tmp/ui-checks/requester-published-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of await cards.all())
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.getByRole('tab', { name: /待办/ }).click();
    await expect(cards).toHaveCount(4);
    await page.screenshot({ path: `tmp/ui-checks/requester-todo-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: '已发布需求', exact: true }).click();
  }
  await page.setViewportSize({ width: 470, height: 800 });
  await page.getByRole('button', { name: '招募中', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('陪伴聊天');
  await page.getByRole('button', { name: '进行中', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await page.getByRole('button', { name: '已完成', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: '已取消', exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('tab', { name: /待办/ }).click();
  await page.getByRole('button', { name: '待处理报名 2项', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await cards.first().click();
  await expect(page).toHaveURL(/\/applications$/);
  await expect(page.locator('[data-task-section=applications]').first()).toBeFocused();
  await page.getByRole('button', { name: '确认参与', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '确认参与', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.requester-count')).toHaveText('4');
  await expect(page.getByRole('button', { name: '待处理报名 1项', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '待确认服务 1项', exact: true }).click();
  await cards.first().click();
  await expect(page.getByRole('button', { name: '核实服务', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: '核实服务', exact: true }).click();
  await page.locator('#modal-form button[type=submit]').click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.requester-count')).toHaveText('3');
  await page.getByRole('button', { name: '其他事项 2项', exact: true }).click();
  await cards.filter({ hasText: '陪诊协助' }).click();
  await page.getByRole('button', { name: '同意调整', exact: true }).click();
  await page.locator('#modal-form button[type=submit]').click();
  await expect(page.getByText('1 人尚未确认；全部处理后新安排生效。')).toBeVisible();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await cards.filter({ hasText: '上门探访' }).click();
  await page.getByRole('button', { name: '记录处理结果', exact: true }).click();
  await page.locator('#modal-form [name=reason]').fill('已联系社区并安排补充人员');
  await page.getByRole('button', { name: '完成处理', exact: true }).click();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.requester-count')).toHaveText('2');
  await page.getByRole('button', { name: '消息通知', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: '全部标为已读', exact: true }).click();
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await expect(page.locator('.requester-unread')).toHaveCount(0);
  await page.getByRole('tab', { name: '已发布需求', exact: true }).click();
  await page.getByRole('link', { name: '发布需求', exact: true }).click();
  await expect(page).toHaveURL(/#publish\/help$/);
  await expect(page.locator('#publish-form')).toBeVisible();
  await page.getByLabel('服务标题', { exact: true }).fill('待完善的社区服务');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page).toHaveURL(/#task\//);
  await page.locator('.bottom-nav a[href="#services"]').click();
  await page.getByRole('button', { name: '草稿', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('继续编辑');
  await cards.first().click();
  await expect(page.getByLabel('服务标题', { exact: true })).toHaveValue('待完善的社区服务');
  await page.locator('.bottom-nav a[href="#services"]').click();
  await page.getByRole('button', { name: '全部', exact: true }).click();
  const org = server.context.store.user(fixture.org.id);
  org.settings = { ...org.settings, fontSize: 'large' };
  server.context.store.saveUser(org);
  await page.reload();
  await expect(page.locator('.requester-hall')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'tmp/ui-checks/requester-large-text.png', fullPage: true });
  for (const card of await cards.all())
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const typography = await page
    .locator('.requester-card h2')
    .first()
    .evaluate((el) => ({ family: getComputedStyle(el).fontFamily, weight: getComputedStyle(el).fontWeight }));
  expect(typography.family).toContain('MiSans');
  expect(typography.weight).toBe('600');
  expect(errors).toEqual([]);
  console.log(
    '需求方服务大厅通过：四种视口、双页/状态/分类切换、真实待办计数、报名确认、服务核实、时间调整、退出处理、详情定位与返回、消息已读、发布入口。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
