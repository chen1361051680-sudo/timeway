import { chromium, expect } from '@playwright/test';
import { once } from 'node:events';
import { createTimewayServer } from '../server.mjs';

const server = createTimewayServer({ environment: 'test', databasePath: ':memory:' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  // A missing dependency used to strand users on the initial loading message.
  await page.route('**/profile.js', (route) => route.fulfill({ status: 404, body: 'Not found' }));
  await page.goto(`http://127.0.0.1:${server.address().port}/#login`);
  await expect(page.getByRole('heading', { name: '页面暂时无法打开' })).toBeVisible();
  await expect(page.locator('.loading[aria-busy=true]')).toHaveCount(0);
  await page.unroute('**/profile.js');
  const failures = [];
  page.on('response', (response) => { if (response.status() >= 400) failures.push(response.url()); });
  await page.getByRole('button', { name: '重新加载' }).click();
  await expect(page.getByRole('button', { name: '志愿者登录', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '志愿者登录', exact: true }).click();
  await page.getByRole('button', { name: '一键快速登录（模拟账号）', exact: true }).click();
  await expect(page.locator('.bottom-nav')).toBeVisible();
  expect(failures).toEqual([]);
  console.log('Startup passed: missing module shows retry; reload recovers and quick login succeeds without resource errors.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
