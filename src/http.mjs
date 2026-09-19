import { createHash } from 'node:crypto';
import { check, AppError, text } from './common.mjs';
import { Store } from './store.mjs';
import { Domain } from './domain.mjs';
import { Auth } from './auth.mjs';
import { externalAdapters } from './adapters.mjs';
import { OfferCovers } from './offer-covers.mjs';
export function services(options = {}) {
  const environment = options.environment || process.env.NODE_ENV || 'development';
  check(
    ['development', 'test', 'production'].includes(environment),
    'NODE_ENV 必须为 development、test 或 production',
  );
  const demoMode = environment === 'production' && (options.demoMode ?? process.env.DEMO_MODE === 'true');
  const databaseEnvironment = demoMode ? 'development' : environment;
  const databasePath = options.databasePath || process.env.DATABASE_PATH || `./data/${databaseEnvironment}.sqlite`;
  const store =
    options.store ||
    new Store(
      databasePath,
      databaseEnvironment,
    );
  const adapters = externalAdapters({
    environment,
    mapProvider: options.mapProvider ?? (environment === 'test' ? 'manual' : process.env.MAP_PROVIDER),
    browserAk: options.baiduBrowserAk ?? (environment === 'test' ? '' : process.env.BAIDU_MAP_BROWSER_AK),
    smsProvider: options.smsProvider || process.env.SMS_PROVIDER || 'development',
    smsUrl: process.env.SMS_WEBHOOK_URL,
    smsToken: process.env.SMS_WEBHOOK_TOKEN,
  });
  const domain = new Domain(store, adapters);
  return {
    store,
    domain,
    offerCovers: new OfferCovers(store, environment, options.offerCoverDirectory),
    auth: new Auth(store, environment, demoMode),
    adapters,
    environment,
    demoMode,
    origin: options.origin || process.env.PUBLIC_ORIGIN,
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
          (ctx.origin || `${environment === 'production' ? 'https' : 'http'}://${request.headers.host}`) ||
        (environment === 'development' && origin === `http://${request.headers.host}`),
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
  if (path === '/api/offer-covers' && method === 'POST') {
    d.actor(user, 'requester');
    return send(await ctx.offerCovers.save(user, body));
  }
  if (path.startsWith('/api/offer-covers/') && method === 'GET') {
    const image = await ctx.offerCovers.read(user, path.slice('/api/offer-covers/'.length));
    response.setHeader('Content-Type', 'image/webp');
    response.setHeader('Cache-Control', 'private, no-cache');
    return response.end(image);
  }
  // Retired endpoints must also reject cached idempotent responses from older clients.
  if (/^\/api\/(comments|files|attachments)(\/|$)/.test(path))
    throw new AppError(404, '该功能已移除');
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
    return send({ ...d.bookingView(user, b), task: d.taskView(user, s.get('task', b.taskId)) });
  }
  if ((m = path.match(/^\/api\/audit\/([^/]+)$/)) && method === 'GET') {
    const r = s.get('record', m[1]) || s.get('booking', m[1]) || s.get('task', m[1]);
    check(r && [r.owner, r.userId].includes(user.id), '无权访问', 403);
    return send(s.all('audit').filter((a) => a.ref === m[1]));
  }
  const fingerprint = createHash('sha256')
      .update(method + path + JSON.stringify(body))
      .digest('hex'),
    key = request.headers['idempotency-key'];
  check(!key || /^[a-zA-Z0-9_-]{8,100}$/.test(key), '幂等键格式错误');
  const perform = () => {
    if (path === '/api/tasks' && method === 'POST') return d.createTask(user, body);
    if ((m = path.match(/^\/api\/tasks\/([^/]+)$/)) && method === 'PUT') return d.saveTask(user, m[1], body);
    if ((m = path.match(/^\/api\/tasks\/([^/]+)$/)) && method === 'DELETE') return d.deleteOffer(user, m[1]);
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
