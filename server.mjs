import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isIP } from 'node:net';
import { api, services } from './src/http.mjs';
const assets = new Map([
  ['/', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js'],
  ['/ui.js', 'ui.js'],
]);
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript' };
export function createTimewayServer(options = {}) {
  const ctx = services(options),
    version = options.version || 'development',
    limits = new Map();
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
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
        const file = assets.get(url.pathname);
        if (!file) {
          res.writeHead(404);
          res.end(req.method === 'HEAD' ? undefined : 'Not found');
          return;
        }
        body = await readFile(new URL(`./public/${file}`, import.meta.url));
        type = types[file.split('.').pop()];
      }
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
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
  server.listen(port, '127.0.0.1', () =>
    console.log(`Timeway: http://127.0.0.1:${port} (${server.context.environment})`),
  );
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
