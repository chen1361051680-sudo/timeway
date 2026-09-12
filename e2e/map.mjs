import { chromium, expect } from '@playwright/test';
import { createTimewayServer } from '../server.mjs';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
await mkdir('tmp/map-checks', { recursive: true });
const errors = [];
async function page(role) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 760 },
    isMobile: true,
    hasTouch: true,
  });
  const response = await context.request.post(base + '/api/auth/demo-login', {
    data: { role, account: role, password: 'timeway123' },
  });
  expect(response.ok()).toBe(true);
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await p.goto(base + '/#map');
  await expect(p.locator('.map-shell')).toBeVisible();
  return p;
}
async function shot(p, name) {
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `tmp/map-checks/${name}.png`, fullPage: true });
  expect(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}
try {
  const vol = await page('volunteer'),
    orgPage = await page('requester');
  await expect(vol.locator('.map-pin')).toHaveCount(0);
  await expect(vol.locator('.map-stat strong')).toHaveText(['0', '0', '0']);
  await expect(vol.getByText('暂时没有合适的爱心需求')).toBeVisible();
  await shot(vol, 'empty-390');

  const { store: s, domain: d } = server.context;
  const org = s.user('demo-org'),
    volunteer = s.user('demo-vol');
  const input = (i) => ({
    kind: 'help',
    title: ['陪诊协助', '陪伴老人聊天', '智能手机课堂', '社区助餐', '公园散步'][i % 5],
    category: ['陪诊协助', '陪伴交流', '数字助老', '生活协助', '出行陪同'][i % 5],
    description: '独立测试环境的服务需求',
    recipient: '测试受助对象',
    region: ['杭州西湖社区', '杭州湖滨街道', '杭州翠苑街道', '杭州古荡社区', '杭州文新社区'][i % 5],
    address: '测试私人门牌301',
    start: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    end: new Date(Date.now() + (i + 1) * 86400000 + 3600000).toISOString(),
    deadline: new Date(Date.now() + (i + 1) * 86400000 - 3600000).toISOString(),
    minutes: 60,
    capacity: 3,
    status: 'published',
    lat: 30.25 + i * 0.01,
    lng: 120.15 + i * 0.01,
  });
  // Generate confirmed records through the business workflow, solely in this in-memory test database.
  for (let i = 0; i < 3; i++) {
    const t = d.createTask(org, input(i)),
      a = d.apply(volunteer, t.id, {});
    d.applicationAction(org, a.id, { action: 'accept' });
    const row = s.get('task', t.id);
    row.start = new Date(Date.now() - (i + 2) * 86400000).toISOString();
    row.end = new Date(Date.parse(row.start) + 3600000).toISOString();
    s.put('task', row);
    d.applicationAction(volunteer, a.id, {
      action: 'submit',
      start: row.start,
      end: row.end,
      rest: 0,
      content: '测试已完成服务',
      note: '测试人工补录',
    });
    d.recordAction(org, a.id, { action: 'confirm', minutes: 60, recipients: 1 });
  }
  const needs = Array.from({ length: 5 }, (_, i) => d.createTask(org, input(i)));
  await vol.reload();
  await expect(vol.locator('.map-pin-love')).toHaveCount(3);
  await expect(vol.locator('.map-pin-need')).toHaveCount(5);
  await expect(vol.locator('.map-stat strong')).toHaveText(['3', '3', '3']);
  await expect(vol.locator('.map-task-card')).not.toContainText('私人门牌');
  for (const [width, height] of [
    [320, 680],
    [390, 760],
    [430, 850],
    [520, 924],
    [1440, 1000],
  ]) {
    await vol.setViewportSize({ width, height });
    await shot(vol, `map-${width}`);
  }
  await vol.setViewportSize({ width: 390, height: 760 });
  const stageHeight = await vol.locator('.map-stage').evaluate((el) => el.getBoundingClientRect().height);
  await vol.evaluate(() => {
    window.__mapHero = document.querySelector('.map-hero');
  });
  const dragHandle = async (dy) => {
    const box = await vol.locator('.map-sheet-grab').boundingBox();
    await vol.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await vol.mouse.down();
    await vol.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + dy, { steps: 12 });
    await vol.mouse.up();
  };
  await dragHandle(230);
  await expect(vol.locator('.map-sheet')).toHaveAttribute('data-snap', 'collapsed');
  await expect(vol.locator('#map-action')).toBeHidden();
  await expect(vol.locator('.map-stats')).toBeVisible();
  await vol.screenshot({ path: 'tmp/map-checks/sheet-collapsed.png' });
  await dragHandle(-230);
  await expect(vol.locator('.map-sheet')).toHaveAttribute('data-snap', 'expanded');
  await expect(vol.locator('.map-additional-needs .map-nearby-item')).toHaveCount(4);
  const scroll = vol.locator('.map-sheet-scroll');
  await scroll.hover();
  await vol.mouse.wheel(0, 300);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await vol.evaluate(() => window.scrollY)).toBe(0);
  expect(await vol.locator('.map-stage').evaluate((el) => el.getBoundingClientRect().height)).toBe(
    stageHeight,
  );
  expect(await vol.evaluate(() => window.__mapHero === document.querySelector('.map-hero'))).toBe(true);
  await vol.mouse.wheel(0, -1000);
  await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
  const touch = await vol.context().newCDPSession(vol);
  const box = await scroll.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + 12 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  for (let i = 1; i <= 10; i++)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: point.x, y: point.y + i * 20 }],
    });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(vol.locator('.map-sheet')).toHaveAttribute('data-snap', 'collapsed');
  await touch.detach();
  await vol.locator('.map-sheet-grab').press('ArrowUp');
  await expect(vol.locator('.map-sheet')).toHaveAttribute('data-snap', 'expanded');
  await vol.locator('.map-sheet-grab').press('ArrowDown');
  await expect(vol.locator('.map-sheet')).toHaveAttribute('data-snap', 'collapsed');
  await vol.locator('.map-pin-need').nth(2).click();
  await expect(vol.locator('.map-task-heading h3')).toHaveText('智能手机课堂');
  await vol.getByRole('button', { name: '收起需求面板' }).click();
  await expect(vol.locator('#map-action')).toBeHidden();
  await expect(vol.locator('.map-stats')).toBeVisible();
  await vol.getByRole('button', { name: '展开需求面板' }).click();
  await expect(vol.locator('.map-task-heading h3')).toHaveText('智能手机课堂');
  await vol.getByRole('switch').uncheck();
  await expect(vol.locator('.map-pin-need')).toHaveCount(0);
  await expect(vol.locator('.map-pin-love')).toHaveCount(3);
  await vol.getByRole('switch').check();
  await vol.getByRole('button', { name: '收起需求面板' }).click();
  await vol.locator('.map-pin-love').first().click();
  await expect(vol.locator('.map-region-card')).toBeVisible();
  await shot(vol, 'region-selected');
  await vol.getByRole('button', { name: '继续帮助这里' }).click();
  await expect(vol).toHaveURL(/#map$/);
  await expect(vol.locator('.map-pin-need')).toHaveCount(1);
  await vol.getByRole('button', { name: '切换城市或区域' }).click();
  await vol.getByLabel('城市或区县（留空查看全部）').fill('');
  await vol.getByRole('button', { name: '查看这个区域', exact: true }).click();
  await expect(vol.locator('.map-pin-need')).toHaveCount(5);
  await vol.getByRole('button', { name: '筛选爱心需求', exact: true }).click();
  await vol.locator('#modal-form select[name=category]').selectOption('数字助老');
  await vol.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(vol).toHaveURL(/#map$/);
  await expect(vol.locator('.map-pin-need')).toHaveCount(1);
  await expect(vol.locator('.map-pin-love')).toHaveCount(3);
  await vol.getByRole('button', { name: '筛选爱心需求', exact: true }).click();
  await vol.getByLabel('我有空闲时间（含往返）').selectOption('60');
  await vol.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(vol.locator('.map-pin-need')).toHaveCount(0);
  await vol.getByRole('button', { name: '筛选爱心需求', exact: true }).click();
  await vol.getByRole('button', { name: '重置筛选', exact: true }).click();
  await vol.getByRole('button', { name: '应用筛选', exact: true }).click();
  await expect(vol.locator('.map-pin-need')).toHaveCount(5);
  await vol.getByRole('button', { name: '搜索地点、社区服务', exact: true }).click();
  await vol.getByLabel('地点、需求或机构关键词').fill('公园');
  await vol.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(vol.locator('.map-task-heading h3')).toHaveText('公园散步');
  await vol.locator('.map-task-cta').click();
  await expect(vol).toHaveURL(new RegExp('#task/' + needs[4].id));
  await vol.getByRole('button', { name: '在爱心地图查看', exact: true }).click();
  await expect(vol.locator('.map-task-heading h3')).toHaveText('公园散步');
  await vol.getByRole('button', { name: '回到当前位置', exact: true }).click();
  await expect(vol.getByRole('dialog')).toContainText('手动选择');
  await vol.getByRole('button', { name: '关闭弹窗', exact: true }).click();
  await vol.getByRole('tab', { name: '我的足迹', exact: true }).click();
  await expect(vol.getByRole('tab', { name: '我的足迹', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await vol.getByRole('button', { name: /累计贡献/ }).click();
  await expect(vol).toHaveURL(/#bank$/);

  const application = d.apply(volunteer, needs[0].id, {});
  await orgPage.reload();
  await expect(orgPage.locator('.map-stat strong').last()).toHaveText('1');
  await expect(orgPage.locator('.map-task-heading h3')).toHaveText('陪诊协助');
  await expect(orgPage.getByRole('link', { name: '发布需求', exact: true })).toBeVisible();
  await shot(orgPage, 'requester');
  d.applicationAction(org, application.id, { action: 'accept' });
  await vol.goto(base + '/#map');
  await vol.getByRole('button', { name: '取消选中' }).click();
  await expect(vol.locator('.map-task-heading h3')).toHaveText('陪诊协助');
  await expect(vol.locator('.map-task-cta')).toHaveText('查看服务安排');
  expect(errors).toEqual([]);
  console.log(
    '爱心地图 UI 验证通过：空状态、真实成果、五种宽度、区域与需求选择、范围切换、收起展开、图层开关、筛选与未知路线、搜索、详情返回、时间明细、需求方待办和已确认服务优先。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
