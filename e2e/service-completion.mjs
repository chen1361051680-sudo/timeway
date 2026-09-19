import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createTimewayServer } from '../server.mjs';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
const { auth, domain, store } = server.context;
const org = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' });
const vol = auth.demoLogin({ role: 'volunteer', account: 'volunteer', password: 'timeway123' });
const start = new Date(Date.now() + 86400000).toISOString();
const task = domain.createTask(org.user, {
  kind: 'help', title: '陪伴长者聊天', category: '陪伴交流', description: '陪伴长者交流',
  region: '杭州市', address: '社区服务中心', start,
  end: new Date(Date.parse(start) + 3600000).toISOString(), deadline: start,
  minutes: 60, capacity: 1, status: 'published',
});
const app = domain.apply(vol.user, task.id, {});
domain.applicationAction(org.user, app.id, { action: 'accept' });
assert.throws(() => domain.applicationAction(org.user, app.id, { action: 'complete' }), /仅本人/);
// 使用尚未开始的服务，通过真实接口验证直接确认完成。
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'tw_session', value: vol.token, url: base }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/#task/${task.id}`);
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: '提交服务记录', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '感谢你的服务' })).toBeVisible();
  await expect(dialog.locator('input, textarea, select')).toHaveCount(0);
  await expect(dialog.getByRole('button')).toHaveCount(2);
  await expect(dialog.locator('img')).toHaveJSProperty('complete', true);
  expect(await dialog.locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  for (const width of [320, 390, 520]) {
    await page.setViewportSize({ width, height: 740 });
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: '确认完成', exact: true })).toBeInViewport();
  }
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  assert.equal(store.get('application', app.id).status, 'accepted');
  assert.equal(store.get('record', app.id), undefined);
  await page.getByRole('button', { name: '提交服务记录', exact: true }).click();
  await dialog.getByRole('button', { name: '确认完成', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('提交 60 分钟 · 已确认 0 分钟 · 0 受助人次')).toBeVisible();
  await expect(page.locator('.td-hero .status-submitted')).toHaveText('待机构确认');
  const record = store.get('record', app.id);
  assert.equal(record.status, 'submitted');
  assert.equal(record.submitted, 60);
  assert.equal(record.start, task.start);
  assert.equal(record.end, task.end);
  assert.equal(record.submissionMode, 'completion');
  assert.equal(store.db.prepare('SELECT COUNT(*) AS count FROM ledger').get().count, 0);
  domain.applicationAction(vol.user, app.id, { action: 'complete', minutes: 9999 });
  assert.deepEqual(store.get('record', app.id), record);
  domain.recordAction(org.user, app.id, { action: 'confirm', minutes: 60, recipients: 1 });
  assert.equal(store.db.prepare('SELECT SUM(minutes) AS minutes FROM ledger WHERE user_id = ?').get(vol.user.id).minutes, 60);
  await page.reload();
  await expect(page.locator('.td-hero .status-confirmed')).toHaveText('已完成');
  await expect(page.getByRole('button', { name: '提交服务记录', exact: true })).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log('完成确认通过：尚未开始可直接提交、三个屏幕宽度、取消无提交、待机构确认与已完成状态、重复请求不重复提交、核实后入账。');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
