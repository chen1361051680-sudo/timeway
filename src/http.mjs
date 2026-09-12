import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { check, AppError, text } from './common.mjs';
import { Store } from './store.mjs';
import { Domain } from './domain.mjs';
import { Auth } from './auth.mjs';
import { externalAdapters } from './adapters.mjs';
export function services(options = {}) {
  const environment = options.environment || process.env.NODE_ENV || 'development';
  check(
    ['development', 'test', 'production'].includes(environment),
    'NODE_ENV 必须为 development、test 或 production',
  );
  const demoMode = environment === 'production' && (options.demoMode ?? process.env.DEMO_MODE === 'true');
  const productionPath = options.databasePath || process.env.DATABASE_PATH || `./data/${environment}.sqlite`;
  const databasePath = demoMode ? options.demoDatabasePath || process.env.DEMO_DATABASE_PATH || './data/demo.sqlite' : productionPath;
  check(!demoMode || resolve(databasePath) !== resolve(productionPath), '手机测试必须使用独立数据库');
  const store =
    options.store ||
    new Store(
      databasePath,
      demoMode ? 'demo' : environment,
    );
  const adapters = externalAdapters({
    environment,
    mapProvider: options.mapProvider ?? (environment === 'test' ? 'manual' : process.env.MAP_PROVIDER),
    browserAk: options.baiduBrowserAk ?? (environment === 'test' ? '' : process.env.BAIDU_MAP_BROWSER_AK),
    smsProvider: options.smsProvider || process.env.SMS_PROVIDER || 'development',
    smsUrl: process.env.SMS_WEBHOOK_URL,
    smsToken: process.env.SMS_WEBHOOK_TOKEN,
  });
  return {
    store,
    domain: new Domain(store, adapters),
    auth: new Auth(store, environment, demoMode),
    adapters,
    environment,
    demoMode,
    origin: options.origin || process.env.PUBLIC_ORIGIN,
    uploads: resolve(`./data/${environment}-uploads`),
  };
}
async function bodyOf(request) {
  let size = 0;
  const chunks = [];
  for await (const c of request) {
    size += c.length;
    check(size <= 4500000, '请求内容过大', 413);
    chunks.push(c);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    throw new AppError(400, '请求格式错误');
  }
}
export async function api(request, response, url, ctx) {
  const { store: s, domain: d, auth, adapters, environment } = ctx,
    method = request.method,
    path = url.pathname;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (data) => response.end(JSON.stringify(data));
  const write = !['GET', 'HEAD'].includes(method);
  if (write) {
    const origin = request.headers.origin;
    check(
      !origin ||
        origin ===
          (ctx.origin || `${environment === 'production' ? 'https' : 'http'}://${request.headers.host}`),
      '请求来源不受信任',
      403,
    );
    check(String(request.headers['content-type']).startsWith('application/json'), '请使用 JSON 请求', 415);
  }
  if (path === '/api/config' && method === 'GET')
    return send({ environment, demoMode: ctx.demoMode, adapters: adapters.status, map: adapters.browserMap, demoAccounts: auth.demoConfig() });
  const session = auth.session(request),
    user = session?.user;
  if (path === '/api/me' && method === 'GET')
    return send({ user: user || null, csrf: session?.csrf || null });
  const body = write ? await bodyOf(request) : {};
  check(body && typeof body === 'object' && !Array.isArray(body), '请求内容必须为 JSON 对象');
  if (['/api/auth/code', '/api/auth/verify', '/api/auth/register'].includes(path))
    throw new AppError(404, '该登录或注册方式已移除');
  if (path === '/api/auth/demo-login' && method === 'POST') {
    const result = auth.demoLogin(body);
    response.setHeader(
      'Set-Cookie',
      `tw_session=${result.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${environment === 'production' ? '; Secure' : ''}`,
    );
    delete result.token;
    return send(result);
  }
  check(user, '请先登录', 401);
  if (write) check(request.headers['x-csrf-token'] === session.csrf, '登录状态已变化，请刷新后重试', 403);
  if (path === '/api/auth/logout' && method === 'POST') {
    auth.logout(session);
    response.setHeader('Set-Cookie', 'tw_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return send({ ok: true });
  }
  if (path === '/api/profile' && method === 'PUT') return send(s.transaction(() => d.profile(user, body)));
  d.actor(user);
  if (path === '/api/tasks' && method === 'GET')
    return send(d.tasks(user, Object.fromEntries(url.searchParams)));
  if (path === '/api/bank' && method === 'GET') return send(d.bank(user));
  if (path === '/api/map' && method === 'GET')
    return send(d.map(user, url.searchParams.get('scope') || 'all'));
  if (path === '/api/records' && method === 'GET') return send(d.records(user));
  if (path === '/api/notices' && method === 'GET') return send(d.notices(user));
  if (path === '/api/route' && method === 'GET') return send(adapters.route());
  let m;
  if ((m = path.match(/^\/api\/tasks\/([^/]+)$/)) && method === 'GET') return send(d.task(user, m[1]));
  if ((m = path.match(/^\/api\/bookings\/([^/]+)$/)) && method === 'GET') {
    const b = s.get('booking', m[1]);
    check(b && [b.owner, b.userId].includes(user.id), '无权访问预约', 403);
    return send({ ...d.bookingView(user, b), task: d.task(user, b.taskId) });
  }
  if ((m = path.match(/^\/api\/comments\/([^/]+)$/)) && method === 'GET') return send(d.comments(user, m[1]));
  if ((m = path.match(/^\/api\/audit\/([^/]+)$/)) && method === 'GET') {
    const r = s.get('record', m[1]) || s.get('booking', m[1]) || s.get('task', m[1]);
    check(r && [r.owner, r.userId].includes(user.id), '无权访问', 403);
    return send(s.all('audit').filter((a) => a.ref === m[1]));
  }
  if (path === '/api/attachments' && method === 'POST') {
    check(adapters.status.upload === 'local', 'COS 尚未接入，生产环境暂不开放附件上传', 503);
    d.comments(user, body.ref);
    check(
      ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(body.type),
      '仅支持 PNG、JPEG、WebP 或 PDF',
    );
    const data = Buffer.from(text(body.base64, '附件', 4200000), 'base64');
    check(data.length > 0 && data.length <= 3000000, '附件最大3MB');
    const signatures = {
      'image/png': data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
      'image/jpeg': data[0] === 255 && data[1] === 216 && data[2] === 255,
      'image/webp': data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP',
      'application/pdf': data.toString('ascii', 0, 5) === '%PDF-',
    };
    check(signatures[body.type], '文件内容与类型不符');
    await mkdir(ctx.uploads, { recursive: true });
    const id = randomUUID();
    await writeFile(resolve(ctx.uploads, id), data, { flag: 'wx', mode: 0o600 });
    return send(
      s.put('attachment', {
        id,
        owner: user.id,
        ref: body.ref,
        type: body.type,
        name: text(body.name, '文件名', 100),
      }),
    );
  }
  if ((m = path.match(/^\/api\/attachments\/([^/]+)$/)) && method === 'GET') {
    const a = s.get('attachment', m[1]);
    check(a, '文件不存在', 404);
    d.comments(user, a.ref);
    const file = await readFile(resolve(ctx.uploads, a.id));
    response.setHeader('Content-Type', a.type);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`);
    response.end(file);
    return;
  }
  if ((m = path.match(/^\/api\/files\/([^/]+)$/)) && method === 'GET') {
    d.comments(user, m[1]);
    return send(s.all('attachment').filter((a) => a.ref === m[1]));
  }
  const fingerprint = createHash('sha256')
      .update(method + path + JSON.stringify(body))
      .digest('hex'),
    key = request.headers['idempotency-key'];
  check(!key || /^[a-zA-Z0-9_-]{8,100}$/.test(key), '幂等键格式错误');
  const perform = () => {
    if (path === '/api/tasks' && method === 'POST') return d.createTask(user, body);
    if ((m = path.match(/^\/api\/tasks\/([^/]+)$/)) && method === 'PUT') return d.saveTask(user, m[1], body);
    if ((m = path.match(/^\/api\/tasks\/([^/]+)\/action$/)) && method === 'POST')
      return d.taskAction(user, m[1], body);
    if ((m = path.match(/^\/api\/tasks\/([^/]+)\/apply$/)) && method === 'POST')
      return d.apply(user, m[1], body);
    if ((m = path.match(/^\/api\/tasks\/([^/]+)\/book$/)) && method === 'POST')
      return d.book(user, m[1], body);
    if ((m = path.match(/^\/api\/applications\/([^/]+)$/)) && method === 'POST')
      return d.applicationAction(user, m[1], body);
    if ((m = path.match(/^\/api\/records\/([^/]+)$/)) && method === 'POST')
      return d.recordAction(user, m[1], body);
    if ((m = path.match(/^\/api\/bookings\/([^/]+)$/)) && method === 'POST')
      return d.bookingAction(user, m[1], body);
    if ((m = path.match(/^\/api\/comments\/([^/]+)$/)) && method === 'POST')
      return d.comment(user, m[1], body);
    if ((m = path.match(/^\/api\/notices\/([^/]+)$/)) && method === 'POST') {
      const n = d.own('notice', m[1], user);
      n.read = true;
      return s.put('notice', n);
    }
    if (path === '/api/notices/read' && method === 'PUT') {
      for (const n of s.all('notice').filter((n) => n.owner === user.id)) {
        n.read = true;
        s.put('notice', n);
      }
      return { ok: true };
    }
    if (path === '/api/feedback' && method === 'POST')
      return s.put('feedback', {
        owner: user.id,
        content: text(body.content, '反馈内容', 2000),
        status: 'received',
      });
    if (path === '/api/feedback' && method === 'GET')
      return s.all('feedback').filter((f) => f.owner === user.id);
    throw new AppError(404, '接口不存在');
  };
  return send(
    s.transaction(() => {
      if (key) {
        const prior = s.db.prepare('SELECT * FROM idempotency WHERE user_id=? AND key=?').get(user.id, key);
        if (prior) {
          check(prior.fingerprint === fingerprint, '该请求标识已用于其他内容', 409);
          return JSON.parse(prior.result);
        }
      }
      const result = perform();
      if (key)
        s.db
          .prepare('INSERT INTO idempotency VALUES (?,?,?,?)')
          .run(user.id, key, fingerprint, JSON.stringify(result));
      return result;
    }),
  );
}
