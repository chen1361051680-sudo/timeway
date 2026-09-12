import { chromium, expect } from '@playwright/test';
import { createTimewayServer } from '../server.mjs';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
const { auth, domain: d, store: s } = server.context;
const session = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' });
const volunteer = d.profile(session.user, { ...session.user, name: '林小暖', region: '西湖区、上城区', skills: '陪伴聊天、生活帮助、陪诊协助' });
const org = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' }).user;
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ viewport: { width: 470, height: 836 }, isMobile: true, hasTouch: true });
await context.addCookies([{ name: 'tw_session', value: session.token, url: base }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await mkdir('tmp/ui-checks', { recursive: true });
async function profile() {
  await page.goto(base + '/#profile');
  await expect(page.locator('.profile-identity')).toBeVisible();
}
async function close() { await page.getByRole('button', { name: '关闭弹窗', exact: true }).click(); }
try {
  await profile();
  await expect(page.locator('.profile-stat-number strong')).toHaveText(['0', '0', '0']);
  await expect(page.locator('.profile-balance-number strong')).toHaveText('0');
  // Only confirmed service workflows produce the visual fixture, in this in-memory database.
  for (let i = 0; i < 28; i++) {
    const minutes = i < 27 ? 180 : 900;
    const start = Date.now() + (i + 2) * 86400000;
    const task = d.createTask(org, {
      kind: 'help', title: `陪伴服务 ${i + 1}`, description: '隔离测试资料', recipient: '测试受助者',
      region: '西湖区', address: '测试私人门牌', category: '陪伴交流', status: 'published',
      start: new Date(start).toISOString(), end: new Date(start + minutes * 60000).toISOString(),
      deadline: new Date(start).toISOString(), minutes, capacity: 1, lat: 30.25 + (i % 12) * .01, lng: 120.15,
    });
    const app = d.apply(volunteer, task.id, {});
    d.applicationAction(org, app.id, { action: 'accept' });
    const row = s.get('task', task.id);
    row.start = new Date(Date.now() - (i + 2) * 86400000).toISOString();
    row.end = new Date(Date.parse(row.start) + minutes * 60000).toISOString();
    s.put('task', row);
    d.applicationAction(volunteer, app.id, { action: 'submit', start: row.start, end: row.end, rest: 0, content: '已完成测试服务', note: '人工补录' });
    d.recordAction(org, app.id, { action: 'confirm', minutes, recipients: 1 });
  }
  await page.reload();
  await expect(page.locator('.profile-stat-number strong')).toHaveText(['12', '28', '96']);
  await expect(page.locator('.profile-balance-number strong')).toHaveText('96');
  await page.evaluate(() => document.fonts.ready);
  for (const [width, height] of [[470, 836], [390, 844], [320, 700], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `tmp/ui-checks/profile-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const future = Date.now() + 40 * 86400000;
  const offer = d.createTask(org, { kind: 'redeem', title: '测试兑换', description: '隔离测试', recipient: '本人', region: '西湖区', address: '测试地点', start: new Date(future).toISOString(), end: new Date(future + 3600000).toISOString(), deadline: new Date(future).toISOString(), minutes: 60, capacity: 1, status: 'published' });
  const booking = d.book(volunteer, offer.id, { recipient: '本人', phone: volunteer.phone, consent: true });
  await page.reload();
  await expect(page.locator('.profile-balance-number strong')).toHaveText('95');
  await expect(page.locator('.profile-stat-number strong')).toHaveText(['12', '28', '96']);
  d.bookingAction(volunteer, booking.id, { action: 'cancel', reason: '取消测试' });
  await page.reload();
  await expect(page.locator('.profile-balance-number strong')).toHaveText('96');
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await page.getByLabel('姓名', { exact: true }).fill('未保存资料');
  page.once('dialog', (dialog) => dialog.dismiss());
  await close();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('姓名', { exact: true })).toHaveValue('未保存资料');
  page.once('dialog', (dialog) => dialog.accept());
  await close();
  await expect(page.locator('.profile-name-row h2')).toHaveText('林小暖');
  await page.getByRole('button', { name: '编辑资料', exact: true }).click();
  await page.getByLabel('姓名', { exact: true }).fill('小暖');
  await page.getByLabel('联系电话', { exact: true }).fill('13912345678');
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.profile-name-row h2')).toHaveText('小暖');
  expect(s.user(volunteer.id).contactPhone).toBe('13912345678');
  expect(s.user(volunteer.id).phone).toBe(session.user.phone);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('文字大小').selectOption('large');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await expect(page.locator('html')).toHaveClass('large-text');
  await page.screenshot({ path: 'tmp/ui-checks/profile-large-text.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByLabel('文字大小').selectOption('normal');
  await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.locator('[data-action=profile-balance-help]').click();
  await expect(page.getByRole('dialog')).toContainText('兑换使用时间不会减少累计志愿贡献');
  await close();
  await page.locator('[data-action=profile-history]').last().click();
  await expect(page.locator('.hall-status.active')).toHaveText('已完成');
  await expect(page.locator('.hall-card')).toHaveCount(28);
  await profile();
  await page.locator('[data-action=my-bookings]').click();
  await expect(page.getByRole('tab', { name: /我的兑换/ })).toHaveAttribute('aria-selected', 'true');
  await profile();
  await page.locator('[data-action=profile-bank][data-id=ledger]').click();
  await expect(page.getByRole('dialog')).toContainText('收支明细');
  await close();
  await profile();
  await page.locator('[data-action=footprints]').last().click();
  await expect(page.getByRole('tab', { name: '我的足迹' })).toHaveAttribute('aria-selected', 'true');
  await profile();
  await page.locator('[data-action=notices]').click();
  await expect(page.getByRole('dialog')).toContainText('消息通知');
  await close();
  await page.locator('[data-action=profile-help]').click();
  await page.getByRole('button', { name: '意见反馈', exact: true }).click();
  await page.getByLabel('你的建议或遇到的问题').fill('个人页反馈测试');
  await page.getByRole('button', { name: '提交反馈', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(s.all('feedback').some((f) => f.content === '个人页反馈测试')).toBe(true);
  expect(errors).toEqual([]);
  console.log('个人页：空账户、真实贡献、4种宽度、资料持久化、大字模式、全部入口与反馈验证通过。');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
