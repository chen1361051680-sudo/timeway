import { randomBytes, createHash } from 'node:crypto';
import { check } from './common.mjs';
const hash = (s) => createHash('sha256').update(s).digest('hex');

// Public demonstration credentials; never authenticate production users.
const demoAccounts = {
  volunteer: {
    account: 'volunteer',
    password: 'timeway123',
    id: 'demo-vol',
    phone: '13800000002',
    name: '模拟志愿者',
  },
  requester: {
    account: 'requester',
    password: 'timeway123',
    id: 'demo-org',
    phone: '13800000001',
    name: '模拟需求方',
  },
};
export class Auth {
  constructor(store, environment) {
    this.s = store;
    this.environment = environment;
  }
  demoConfig() {
    if (!['development', 'test'].includes(this.environment)) return null;
    return Object.fromEntries(
      Object.entries(demoAccounts).map(([role, { account, password }]) => [role, { account, password }]),
    );
  }
  demoLogin(body) {
    check(this.demoConfig(), '当前环境不开放模拟账号登录', 403);
    check(['volunteer', 'requester'].includes(body.role), '请选择正确身份');
    const account = demoAccounts[body.role];
    check(
      body.account === account.account && body.password === account.password,
      '账号或密码错误，请使用当前身份的模拟账号',
      401,
    );
    this.ensureDemoAccount(body.role);
    return this.createSession(account.id);
  }
  ensureDemoAccount(role) {
    check(this.demoConfig(), '当前环境不开放模拟账号', 403);
    check(['volunteer', 'requester'].includes(role), '请选择正确身份');
    const account = demoAccounts[role];
    return this.s.transaction(() => {
      const existing = this.s.user(account.id);
      // Reuse only the named demo identity, never an arbitrary phone account.
      check(
        !existing || (existing.role === role && existing.phone === account.phone),
        '模拟账号数据冲突，请检查本地演示数据',
        409,
      );
      if (!existing) {
        check(
          !this.s.db.prepare('SELECT id FROM users WHERE phone=?').get(account.phone),
          '模拟账号号码已被占用，请检查本地演示数据',
          409,
        );
        const user = {
          name: account.name,
          region: '杭州西湖区',
          contact: '',
          address: '',
          skills: '',
          profileComplete: true,
          settings: { fontSize: 'normal', notifications: true },
        };
        this.s.db
          .prepare('INSERT INTO users VALUES (?,?,?,?)')
          .run(account.id, account.phone, role, JSON.stringify(user));
      }
      return this.s.user(account.id);
    });
  }
  createSession(userId) {
    const token = randomBytes(32).toString('hex'),
      csrf = randomBytes(24).toString('hex');
    this.s.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    this.s.db
      .prepare('INSERT INTO sessions VALUES (?,?,?,?)')
      .run(hash(token), userId, csrf, Date.now() + 30 * 86400000);
    return { token, csrf, user: this.s.user(userId) };
  }
  session(request) {
    const token = (request.headers.cookie || '')
      .split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('tw_session='))
      ?.slice(11);
    if (!token) return null;
    const session = this.s.db
      .prepare('SELECT * FROM sessions WHERE token=? AND expires>?')
      .get(hash(token), Date.now());
    return session ? { ...session, user: this.s.user(session.user_id) } : null;
  }
  logout(session) {
    if (session) this.s.db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);
    return { ok: true };
  }
}
