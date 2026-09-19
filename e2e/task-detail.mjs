import { chromium, expect } from '@playwright/test';
import { createTimewayServer } from '../server.mjs';
import { seedRequesterHall } from './requester-hall-fixture.mjs';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
const fixture = seedRequesterHall(server);
const { store } = server.context;
const contactVolunteer = store.user(fixture.pending[0].user.id);
contactVolunteer.contactPhone = '+86 139-2222-3333';
store.saveUser(contactVolunteer);
const contactApplication = store.get('application', fixture.pending[0].app.id);
contactApplication.applicantPhone = contactVolunteer.contactPhone;
store.put('application', contactApplication);
const task = store.get('task', fixture.tasks[0].id);
Object.assign(task, {
  title: '社区长者陪伴聊天',
  description: '陪伴社区长者聊聊日常、读读报纸，倾听他们的生活故事。\n服务中请保持耐心，尊重长者的生活习惯。',
  requirements: '',
  contact: '林老师',
  phone: '13912345678',
  address: '杭州市西湖区文新街道社区服务中心二楼',
});
store.put('task', task);
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
await context.addCookies([{ name: 'tw_session', value: fixture.session.token, url: base }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await mkdir('tmp/ui-checks', { recursive: true });
const visit = async (id) => {
  await page.goto(`${base}/#task/${id}`);
  await expect(page.locator('.td-hero h1')).toHaveText(store.get('task', id).title);
  await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
};
try {
  await visit(task.id);
  await expect(page.locator('[data-action=comments], [data-action=files], .td-resources')).toHaveCount(0);
  await expect(page.locator('.td-attention')).toContainText('2 位志愿者等待确认');
  await expect(page.locator('.td-metrics')).toContainText('已确认参与1人');
  const call = page.getByRole('link', { name: `拨打${contactVolunteer.name}的电话`, exact: true });
  await expect(call).toHaveAttribute('href', 'tel:+8613922223333');
  await expect(call.locator('..')).toContainText(contactVolunteer.contactPhone);
  await expect(page.locator('.td-call')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: '受助对象', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '参与要求', exact: true })).toHaveCount(0);
  await expect(page.getByText('愿意耐心陪伴，按约定时间参加。')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '取消需求', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: task.phone, exact: true })).toHaveAttribute(
    'href',
    'tel:' + task.phone,
  );
  for (const width of [320, 390, 520, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.td-footer')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('.bottom-nav')).toBeInViewport({ ratio: 1 });
    const footer = await page.locator('.td-footer').boundingBox();
    const nav = await page.locator('.bottom-nav').boundingBox();
    expect(footer.y + footer.height).toBeLessThanOrEqual(nav.y + 1);
    for (const row of await page.locator('.td-volunteer-contact').all()) {
      expect(await row.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await page.screenshot({ path: `tmp/ui-checks/task-detail-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '处理报名', exact: true }).click();
  await expect(page.locator('[data-task-section=applications]').first()).toBeFocused();
  await page.getByRole('button', { name: '确认参与', exact: true }).first().click();
  await expect(page.locator('.td-attention')).toContainText('1 位志愿者等待确认');
  await expect(page.locator('.td-metrics')).toContainText('已确认参与2人');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: /需求变更记录/ })).toBeVisible();
  await page.screenshot({ path: 'tmp/ui-checks/task-detail-more.png' });
  await page.getByRole('button', { name: /暂停招募/ }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  expect(store.get('task', task.id).status).toBe('paused');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: /开放发布/ }).click();
  expect(store.get('task', task.id).status).toBe('published');
  await page.getByRole('button', { name: '更多', exact: true }).click();
  await page.getByRole('button', { name: /取消需求/ }).click();
  await expect(page.getByRole('heading', { name: '取消这项需求', exact: true })).toBeVisible();
  expect(store.get('task', task.id).status).toBe('published');
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await page.getByRole('link', { name: '编辑内容', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('#publish/' + task.id + '$'));
  for (const item of fixture.tasks.slice(1)) {
    await visit(item.id);
    await page.screenshot({ path: `tmp/ui-checks/task-detail-${item.category}.png`, fullPage: true });
  }
  await visit(fixture.tasks[2].id);
  await page.getByRole('button', { name: '查看待核实', exact: true }).click();
  await expect(page.getByRole('button', { name: '核实服务', exact: true })).toBeInViewport();
  await expect(page.locator('.td-footer')).toBeInViewport({ ratio: 1 });
  // Long real input, escaped markup and the large font preference must fit a narrow phone.
  store.put('task', {
    ...store.get('task', task.id),
    title: '社区长者陪伴与数字设备使用协助'.repeat(4) + '<img src=x onerror=alert(1)>',
    requirements: '请耐心沟通，尊重长者隐私。',
    address: task.address.repeat(4),
  });
  const user = store.user(fixture.org.id);
  user.settings = { ...user.settings, fontSize: 'large' };
  store.saveUser(user);
  await page.setViewportSize({ width: 320, height: 700 });
  await page.reload();
  await visit(task.id);
  await expect(page.locator('.td-hero h1 img')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('heading', { name: '参与要求', exact: true })).toBeVisible();
  await page.screenshot({ path: 'tmp/ui-checks/task-detail-large.png', fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    '帮扶详情通过：四种宽度、长内容与大字、待办定位、报名确认、编辑、暂停与恢复、取消确认保护、状态与内容精简。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
