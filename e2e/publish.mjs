import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { mkdir } from 'node:fs/promises';
import { createTimewayServer } from '../server.mjs';

const server = createTimewayServer({
  environment: 'test',
  databasePath: ':memory:',
  mapProvider: 'baidu',
  baiduBrowserAk: 'isolated-test-key',
});
const { domain: d, auth, store: s } = server.context;
const session = auth.demoLogin({ role: 'requester', account: 'requester', password: 'timeway123' });
d.profile(session.user, {
  ...session.user,
  contact: '王老师',
  contactPhone: '13912345678',
  address: '社区公共服务中心',
  region: '杭州市 · 西湖区',
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
await context.addCookies([{ name: 'tw_session', value: session.token, url: base }]);
// Deterministic SDK contract tests. Real provider searches are verified separately.
await context.addInitScript(() => {
  window.__placeTest = { fail: false, denied: false, reverseDelay: 0 };
  class Point {
    constructor(lng, lat) {
      this.lng = lng;
      this.lat = lat;
    }
  }
  class Map {
    constructor(host) {
      this.host = host;
      this.events = {};
      this.point = new Point(120.15, 30.25);
      if (host.classList.contains('place-map')) window.__pickerMap = this;
    }
    centerAndZoom(p) {
      this.point = p;
    }
    panTo(p) {
      this.point = p;
    }
    getCenter() {
      return this.point;
    }
    enableScrollWheelZoom() {}
    disableScrollWheelZoom() {}
    disableDragging() {}
    checkResize() {}
    addControl() {}
    addOverlay() {}
    addEventListener(name, cb) {
      this.events[name] = cb;
    }
  }
  class Geocoder {
    getPoint(_q, cb) {
      setTimeout(() => cb(new Point(120.15, 30.25)), 5);
    }
    getLocation(p, cb) {
      setTimeout(
        () =>
          cb(
            window.__placeTest.fail
              ? null
              : {
                  address: `杭州市西湖区测试路${p.lng.toFixed(3)}号`,
                  addressComponents: { city: '杭州市', district: '西湖区' },
                  surroundingPois: [{ title: '测试社区服务站' }],
                },
          ),
        window.__placeTest.reverseDelay,
      );
    }
  }
  class LocalSearch {
    constructor(_map, options) {
      this.options = options;
    }
    getStatus() {
      return 0;
    }
    search(q) {
      setTimeout(
        () =>
          this.options.onSearchComplete({
            getCurrentNumPois: () => (q === '无匹配' ? 0 : 1),
            getPoi: () => ({
              title: '测试社区服务站',
              address: '杭州市西湖区测试路301号',
              point: new Point(120.15, 30.25),
            }),
          }),
        5,
      );
    }
  }
  class Convertor {
    translate(points, _from, _to, cb) {
      cb({ status: 0, points: points.map((p) => new Point(p.lng + 0.01, p.lat + 0.01)) });
    }
  }
  window.BMap = { Map, Point, Geocoder, LocalSearch, Convertor, ScaleControl: class {}, Marker: class {} };
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition(ok, fail) {
        window.__placeTest.denied
          ? fail({ code: 1 })
          : ok({ coords: { longitude: 120.15, latitude: 30.25 } });
      },
    },
  });
});
const page = await context.newPage(),
  errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await mkdir('tmp/ui-checks', { recursive: true });
const visit = async (kind = 'help') => {
  await page.goto(base + '/#publish/' + kind);
  await expect(page.locator('#publish-form')).toBeVisible();
};
const field = (name) => page.locator(`#publish-form [name="${name}"]`);
try {
  await visit();
  await expect(field('phone')).toHaveValue('13912345678');
  await expect(field('start')).toHaveValue(/T09:00$/);
  await page.getByRole('button', { name: '预览并发布', exact: true }).click();
  await expect(field('title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#dialog')).not.toBeVisible();
  await field('title').fill('陪伴聊天');
  await field('description').fill('测试服务内容');
  await page.getByRole('button', { name: '预览并发布', exact: true }).click();
  await expect(page.locator('.pub-preview-card')).toBeVisible();
  await page.getByRole('button', { name: '返回继续编辑', exact: true }).click();
  await expect(page.locator('.pub-more')).not.toHaveAttribute('open', '');
  expect(
    await page
      .locator('#publish-form input:visible, #publish-form textarea:visible, #publish-form select:visible')
      .count(),
  ).toBe(6);
  await page.locator('.pub-more > summary').click();
  await field('recipient').fill('私人受助对象');
  await page.locator('[data-action=pub-duration][data-id="120"]').click();
  await expect(field('end')).toHaveValue(/T11:00$/);
  await field('restMinutes').fill('30');
  await expect(page.locator('#pub-duration-text')).toHaveText('1.5 小时');
  const start = await field('start').inputValue();
  await field('start').fill(start.replace('T09:00', 'T10:00'));
  await expect(field('end')).toHaveValue(/T12:00$/);
  await expect(field('deadline')).toHaveValue(/T10:00$/);
  await field('end').fill(start.replace('T09:00', 'T09:30'));
  await page.getByRole('button', { name: '预览并发布', exact: true }).click();
  await expect(field('end')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('[data-action=pub-duration][data-id="120"]').click();
  await expect(field('end')).not.toHaveAttribute('aria-invalid', 'true');
  await page.locator('[data-action=pub-place]').click();
  await expect(page.locator('#place-picker')).toBeVisible();
  await page.getByRole('textbox', { name: '搜索服务地点', exact: true }).fill('无匹配');
  await page.locator('.place-search button').click();
  await expect(page.locator('.place-status')).toContainText('没有找到');
  await page.getByRole('textbox', { name: '搜索服务地点', exact: true }).fill('测试社区');
  await page.locator('.place-search button').click();
  await page.locator('.place-results button').first().click();
  await expect(page.locator('[data-pick=confirm]')).toBeEnabled();
  await page.locator('[data-pick=close]').click();
  await expect(field('place')).toHaveValue('');
  await expect(field('title')).toHaveValue('陪伴聊天');
  await page.locator('[data-action=pub-place]').click();
  await page.evaluate(() => {
    window.__placeTest.denied = true;
  });
  await page.locator('[data-pick=locate]').click();
  await expect(page.locator('.place-status')).toContainText('定位权限未开启');
  await page.evaluate(() => {
    window.__placeTest.denied = false;
  });
  await page.locator('[data-pick=locate]').click();
  await expect(page.locator('[data-pick=confirm]')).toBeEnabled();
  // Late address responses must not replace the last point the user selected.
  await page.evaluate(() => {
    window.__placeTest.reverseDelay = 200;
    window.__pickerMap.events.click({ point: new window.BMap.Point(120.17, 30.27) });
    window.__placeTest.reverseDelay = 0;
    window.__pickerMap.events.click({ point: new window.BMap.Point(120.18, 30.28) });
  });
  await expect(page.locator('.place-selected p')).toContainText('120.180');
  await page.waitForTimeout(250);
  await expect(page.locator('.place-selected p')).toContainText('120.180');
  await page.locator('[data-pick=confirm]').click();
  await expect(field('place')).toHaveValue(/120.18/);
  await expect(field('region')).toHaveValue('杭州市 · 西湖区');
  await page.locator('.pub-more > summary').click();
  for (const width of [320, 390, 470, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.pub-actions .primary')).toBeInViewport();
    await page.screenshot({ path: `tmp/ui-checks/publish-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '预览并发布', exact: true }).click();
  await expect(page.locator('.pub-preview-card')).toContainText('陪伴聊天');
  await expect(page.locator('.pub-preview-card')).not.toContainText('私人受助对象');
  await expect(page.locator('.pub-preview-card')).not.toContainText('120.180');
  await expect(page.locator('.pub-preview-card')).not.toContainText('13912345678');
  await page.getByRole('button', { name: '返回继续编辑', exact: true }).click();
  await expect(field('title')).toHaveValue('陪伴聊天');
  await page.getByRole('button', { name: '预览并发布', exact: true }).click();
  let rejectOnce = true;
  await page.route('**/api/tasks', async (route) => {
    if (route.request().method() === 'POST' && rejectOnce) {
      rejectOnce = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: '测试：暂时无法保存' }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page.locator('#modal-form .form-error')).toContainText('暂时无法保存');
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page).toHaveURL(/#task\//);
  const id = page.url().split('#task/')[1];
  expect(s.all('task')).toHaveLength(1);
  expect(s.get('task', id).place.lng).toBe(120.18);
  expect(s.get('task', id).minutes).toBe(90);
  await page.getByRole('link', { name: '编辑内容', exact: true }).click();
  await expect(field('place')).toHaveValue(/120.18/);
  await expect(field('recipient')).toHaveValue('私人受助对象');
  await expect(field('restMinutes')).toHaveValue('30');
  await page.locator('.pub-address-details > summary').click();
  await field('address').fill('改为手动地址');
  await expect(field('place')).toHaveValue('');
  await expect(field('lat')).toHaveValue('');
  await page.getByRole('button', { name: '预览并保存修改', exact: true }).click();
  await expect(page.locator('.pub-changes')).toContainText('服务地址');
  await page.getByRole('button', { name: '确认保存修改', exact: true }).click();
  await expect(page).toHaveURL(/#task\//);
  expect(s.get('task', id).place).toBeUndefined();
  expect(s.get('task', id).cell).toBeNull();
  await visit();
  await field('title').fill('未完成草稿');
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page).toHaveURL(/#task\//);
  const draftId = page.url().split('#task/')[1];
  expect(s.get('task', draftId).status).toBe('draft');
  await page.getByRole('link', { name: '编辑内容', exact: true }).click();
  await expect(field('title')).toHaveValue('未完成草稿');
  await visit('redeem');
  await field('title').fill('社区兑换');
  await field('description').fill('机构提供服务');
  await field('durationHours').fill('0');
  await field('durationMinutes').fill('30');
  await expect(page.locator('#pub-duration-text')).toHaveText('0.5 小时');
  await page.getByRole('button', { name: '预览并发布', exact: true }).click();
  await expect(page.locator('.pub-preview-card')).toContainText('预约名额');
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  await expect(page).toHaveURL(/#task\//);
  expect(s.get('task', page.url().split('#task/')[1]).minutes).toBe(30);
  const org = s.user(session.user.id);
  org.settings = { fontSize: 'large' };
  s.saveUser(org);
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const cfg = await response.json();
    await route.fulfill({ json: { ...cfg, map: { provider: 'manual' } } });
  });
  await visit();
  await page.reload();
  await expect(page.locator('#publish-form')).toBeVisible();
  await expect(page.locator('html')).toHaveClass('large-text');
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-action=pub-place]').click();
  await expect(page.locator('.place-status')).toContainText('地图暂不可用');
  await page.locator('[data-pick=manual]').click();
  await expect(field('address')).toBeVisible();
  await expect(field('address')).toBeFocused();
  await expect(field('title')).toHaveValue('');
  await page.screenshot({ path: 'tmp/ui-checks/publish-large.png', fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    '发布优化通过：时间联动、校验、选址搜索/拒绝定位/选点竞态/取消回填、预览隐私、失败重试、保存编辑、手动地址、草稿、兑换、四种宽度和大字模式。',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
