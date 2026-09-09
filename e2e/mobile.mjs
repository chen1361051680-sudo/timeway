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
const errors = [];
await mkdir('tmp/ui-checks', { recursive: true });
async function page() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const p = await context.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  return p;
}
async function login(p, phone, role, name) {
  await p.goto(base);
  await p.getByLabel('手机号码').fill(phone);
  await p.getByRole('button', { name: '获取验证码' }).click();
  await expect(p.locator('#code-info')).toContainText('开发模拟验证码');
  const code = (await p.locator('#code-info').innerText()).match(/\d{6}/)[0];
  await p.getByLabel('验证码', { exact: true }).fill(code);
  await p.locator('[name=agreed]').check();
  await p
    .getByRole('button', {
      name: role === 'requester' ? '我是需求方（社区／机构）' : '我是志愿者',
      exact: true,
    })
    .click();
  await p.getByLabel(role === 'requester' ? '机构名称' : '姓名', { exact: true }).fill(name);
  await p.getByLabel('常用服务区域').fill('杭州西湖区');
  if (role === 'requester') {
    await p.getByLabel('机构联系人').fill('测试负责人');
    await p.getByLabel('机构地址', { exact: true }).fill('测试机构地址');
  }
  await p.getByRole('button', { name: '保存并进入' }).click();
  await expect(p.getByRole('heading', { name: '爱心地图', exact: true })).toBeVisible();
}
async function snapshot(p, name) {
  await p.screenshot({ path: `tmp/ui-checks/${name}.png`, fullPage: true });
  expect(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
}
async function visit(p, hash) {
  await p.goto(base + '/#' + hash);
  await expect(p.locator('#app[aria-busy=true]')).toHaveCount(0);
}
async function fillTask(p, kind) {
  await visit(p, 'publish/' + kind);
  await p.getByLabel('服务标题').fill(kind === 'help' ? '陪伴交流测试需求' : '生活协助兑换测试');
  await p.getByLabel('具体服务内容').fill('测试业务流程，陪伴老人交流一小时。');
  await p.getByLabel('受助对象／适用人群').fill('测试受助对象');
  await p.getByLabel('详细地址（仅相关人员可见）').fill('测试隐私地址 301');
  await p.getByLabel('纬度（可选）').fill('30.25');
  await p.getByLabel('经度（可选）').fill('120.15');
  if (kind === 'redeem') await p.getByLabel('兑换占用分钟').fill('30');
  await p.getByRole('button', { name: '发布服务', exact: true }).click();
  await expect(p).toHaveURL(/#task\//);
  return p.url().split('#task/')[1];
}
try {
  const org = await page(),
    vol = await page();
  await login(org, '13800000001', 'requester', '测试西湖社区');
  await login(vol, '13800000002', 'volunteer', '测试志愿者');
  const taskId = await fillTask(org, 'help');
  await snapshot(org, 'requester-task');
  await visit(vol, 'services');
  await expect(vol.getByRole('heading', { name: '陪伴交流测试需求' })).toBeVisible();
  await snapshot(vol, 'volunteer-hall');
  await visit(vol, 'task/' + taskId);
  await expect(vol.getByText('测试隐私地址 301', { exact: true })).toHaveCount(0);
  await vol.getByRole('button', { name: '报名参与', exact: true }).click();
  await vol.getByRole('button', { name: '提交报名', exact: true }).click();
  await expect(vol.getByRole('heading', { name: '我的参与' })).toBeVisible();
  await org.reload();
  await org.getByRole('button', { name: '确认参与', exact: true }).click();
  await expect(org.getByRole('button', { name: '确认参与', exact: true })).toHaveCount(0);
  // Test fixture advances an accepted scheduled event into the past, without any production clock override.
  const s = server.context.store,
    t = s.get('task', taskId);
  t.start = new Date(Date.now() - 7200000).toISOString();
  t.end = new Date(Date.now() - 3600000).toISOString();
  s.put('task', t);
  await vol.reload();
  await expect(vol.getByText('测试隐私地址 301', { exact: true })).toBeVisible();
  await vol.getByRole('button', { name: '提交服务记录', exact: true }).click();
  await vol.getByLabel('实际完成的服务').fill('完成了陪伴交流和数字设备协助。');
  await vol.getByLabel('未签到／补录／异常说明').fill('测试现场人工核实，未使用定位。');
  await vol.getByRole('button', { name: '提交核实', exact: true }).click();
  await expect(vol.getByText('提交 60 分钟 · 已确认 0 分钟 · 0 受助人次')).toBeVisible();
  await org.reload();
  await org.getByRole('button', { name: '核实服务', exact: true }).click();
  await org.locator('#modal-form').getByRole('button', { name: '确认', exact: true }).click();
  await expect(org.getByText('提交 60 分钟 · 已确认 60 分钟 · 1 受助人次')).toBeVisible();
  await visit(vol, 'map');
  await expect(vol.locator('.light-cell')).toHaveCount(1);
  await snapshot(vol, 'volunteer-map');
  await visit(vol, 'bank');
  await expect(vol.locator('.bank-hero>strong')).toContainText('1');
  await snapshot(vol, 'volunteer-bank');
  const offerId = await fillTask(org, 'redeem');
  await visit(vol, 'task/' + offerId);
  await vol.getByRole('button', { name: '申请兑换', exact: true }).click();
  await vol.getByLabel('受助对象（本人或家中老人）').fill('本人');
  await vol.locator('[name=consent]').check();
  await vol.getByRole('button', { name: '确认申请', exact: true }).click();
  await expect(vol.locator('#dialog')).not.toBeVisible();
  const bk = s.all('booking')[0];
  await visit(org, 'booking/' + bk.id);
  await org.getByRole('button', { name: '接受预约', exact: true }).click();
  await expect(org.getByRole('button', { name: '接受预约', exact: true })).toHaveCount(0);
  bk.status = 'accepted';
  bk.start = t.start;
  bk.end = t.end;
  s.put('booking', bk);
  await org.reload();
  await org.getByRole('button', { name: '记录实际履约', exact: true }).click();
  await org.getByLabel('实际服务分钟').fill('20');
  await org.getByLabel('实际完成内容／未完成原因').fill('部分完成20分钟，双方核实。');
  await org.getByRole('button', { name: '提交申请人确认' }).click();
  await expect(org.getByRole('heading', { name: '实际履约结果' })).toBeVisible();
  await visit(vol, 'booking/' + bk.id);
  await vol.getByRole('button', { name: '确认实际结果', exact: true }).click();
  await vol.getByRole('button', { name: '确认完成并结算' }).click();
  await expect(vol.getByText('占用 0 分钟 · 实际扣除 20 分钟')).toBeVisible();
  await vol.reload();
  await expect(vol.getByText('占用 0 分钟 · 实际扣除 20 分钟')).toBeVisible();
  await snapshot(vol, 'volunteer-booking');
  for (const [name, p] of [
    ['volunteer', vol],
    ['requester', org],
  ])
    for (const tab of ['map', 'services', 'bank', 'profile']) {
      await visit(p, tab);
      await snapshot(p, `${name}-${tab}`);
    }
  await visit(org, 'services');
  await org.getByRole('tab', { name: '待办', exact: true }).click();
  await expect(org.locator('.tab.active')).toHaveText('待办');
  await visit(vol, 'profile');
  await vol.getByRole('button', { name: '编辑', exact: true }).click();
  await vol.getByLabel('擅长服务').fill('耐心陪伴、出行协助');
  await vol.locator('#modal-form').getByRole('button', { name: '确认', exact: true }).click();
  await vol.reload();
  await vol.getByRole('button', { name: '编辑', exact: true }).click();
  await expect(vol.getByLabel('擅长服务')).toHaveValue('耐心陪伴、出行协助');
  expect(errors).toEqual([]);
  console.log(
    'Mobile UI passed: two-role registration, publishing, privacy, application, confirmation, credit/map, partial redemption, profile persistence; 4 tabs and no horizontal overflow.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
