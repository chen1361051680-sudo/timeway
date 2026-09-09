import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
]);

export function createTimewayServer({ version = 'development' } = {}) {
  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    response.setHeader('Cache-Control', 'no-store');

    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    } catch {
      response.writeHead(400);
      response.end('Bad request');
      return;
    }

    try {
      let body;
      let contentType;
      if (pathname === '/healthz') {
        contentType = 'application/json; charset=utf-8';
        body = Buffer.from(JSON.stringify({ status: 'ok', service: 'timeway', version }));
      } else {
        const asset = routes.get(pathname);
        if (!asset) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end(request.method === 'HEAD' ? undefined : 'Not found');
          return;
        }
        contentType = asset[1];
        body = await readFile(new URL(`./public/${asset[0]}`, import.meta.url));
      }
      response.writeHead(200, { 'Content-Type': contentType, 'Content-Length': body.length });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      console.error('Unable to serve a public asset');
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(request.method === 'HEAD' ? undefined : 'Internal server error');
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4312);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('PORT must be an integer between 1024 and 65535');
  }
  const version = /^[0-9a-f]{7,40}$/.test(process.env.APP_VERSION || '')
    ? process.env.APP_VERSION
    : 'development';
  const server = createTimewayServer({ version });
  server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`Timeway listening on 127.0.0.1:${port} (${version})`));
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      const deadline = setTimeout(() => process.exit(1), 10_000);
      deadline.unref();
      server.close(() => { clearTimeout(deadline); process.exit(0); });
    });
  }
}
