import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { listenHost } from './src/listen.mjs';
import { api, services } from './src/http.mjs';
import { publicAssets, assetTypes } from './src/assets.mjs';
export function createTimewayServer(options = {}) {
  const ctx = services(options),
    version = options.version || 'development',
    limits = new Map();
  // Baidu's blob workers derive HTTP tile URLs from local HTTP pages.
  // Keep this compatibility exception out of production HTTPS responses.
  const localMapScripts = ctx.environment === 'production' ? '' : ' http://api.map.baidu.com';
  const localMapTiles = ctx.environment === 'production' ? '' : ' http://apimaponline0.bdimg.com http://apimaponline1.bdimg.com http://apimaponline2.bdimg.com http://apimaponline3.bdimg.com';
  const upgradeRequests = ctx.environment === 'production' ? 'upgrade-insecure-requests; ' : '';
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      ctx.adapters.status.map === 'baidu'
        ? `${upgradeRequests}default-src 'self'; script-src 'self' 'unsafe-eval'${localMapScripts} https://api.map.baidu.com https://*.bdimg.com https://dlswbr.baidu.com https://map.baidu.com; style-src 'self' 'unsafe-inline' https://api.map.baidu.com https://*.map.bdimg.com; img-src 'self' data: blob: https://miao.baidu.com https://*.bdimg.com https://*.map.baidu.com https://map.baidu.com https://*.bdstatic.com; connect-src 'self'${localMapTiles} https://miao.baidu.com https://*.map.baidu.com https://map.baidu.com https://*.bdimg.com https://*.bdstatic.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'`
        : "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
    );
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        const remote = req.socket.remoteAddress,
          forwarded = req.headers['x-real-ip'];
        const ip =
          ctx.environment === 'production' &&
          ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) &&
          typeof forwarded === 'string' &&
          isIP(forwarded)
            ? forwarded
            : remote;
        const key = ip + (url.pathname.startsWith('/api/auth') ? ':auth' : ':api'),
          entry = limits.get(key) || { count: 0, until: Date.now() + 60000 };
        if (entry.until < Date.now()) {
          entry.count = 0;
          entry.until = Date.now() + 60000;
        }
        entry.count++;
        limits.set(key, entry);
        if (limits.size > 10000) for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
        if (entry.count > (key.endsWith(':auth') ? 40 : 600)) {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '操作过于频繁，请稍后再试' }));
          return;
        }
        return await api(req, res, url, ctx);
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        res.end('Method not allowed');
        return;
      }
      let body, type;
      if (url.pathname === '/healthz') {
        body = JSON.stringify({ status: 'ok', service: 'timeway', version });
        type = 'application/json';
      } else {
        // Refresh the public asset inventory per request so new frontend modules
        // are available without restarting the development server.
        const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const file = (await publicAssets()).includes(requested) ? requested : null;
        if (!file) {
          res.writeHead(404);
          res.end(req.method === 'HEAD' ? undefined : 'Not found');
          return;
        }
        body = await readFile(new URL(`./public/${file}`, import.meta.url));
        if (file === 'index.html' && ctx.demoMode) body = body.toString().replace('</head>', '<link rel="stylesheet" href="/demo-mode.css"></head>').replace('<body>', '<body><div class="timeway-demo-banner" role="status">手机测试环境 · 开发数据库 · 模拟账号</div>');
        type = assetTypes[file.split('.').pop().toLowerCase()];
      }
      res.writeHead(200, { 'Content-Type': /^(image|font)\//.test(type) ? type : `${type}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (e) {
      if (!e.status) console.error('Request failed:', e.message);
      res.writeHead(e.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.status ? e.message : '服务暂时不可用，请重试' }));
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.context = ctx;
  server.on('close', () => {
    if (!options.store) ctx.store.close();
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { existsSync } = await import('node:fs');
  if (existsSync('.env')) process.loadEnvFile('.env');
  const port = Number(process.env.PORT || 4312);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid PORT');
  const server = createTimewayServer({ version: process.env.APP_VERSION || 'development' });
  const host = listenHost(server.context.environment, process.env.BIND_HOST);
  server.listen(port, host, () => {
    console.log(`Timeway: http://${host === '0.0.0.0' ? '127.0.0.1' : host.includes(':') ? `[${host}]` : host}:${port} (${server.context.environment})`);
    if (host === '0.0.0.0') {
      for (const addresses of Object.values(networkInterfaces()))
        for (const address of addresses || [])
          if (address.family === 'IPv4' && !address.internal)
            console.log(`局域网: http://${address.address}:${port}`);
    }
  });
  server.on('error', (e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => {
      const timer = setTimeout(() => process.exit(1), 10000);
      timer.unref();
      server.close(() => {
        clearTimeout(timer);
        process.exit(0);
      });
    });
}
