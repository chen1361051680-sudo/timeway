import { Store } from '../src/store.mjs';
import { Auth } from '../src/auth.mjs';
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const environment = process.env.NODE_ENV || 'development';
if (!['development', 'test'].includes(environment)) throw new Error('模拟账号只能写入开发或测试环境');
const store = new Store(process.env.DATABASE_PATH || `data/${environment}.sqlite`, environment);
try {
  const auth = new Auth(store, environment);
  for (const role of ['volunteer', 'requester']) auth.ensureDemoAccount(role);
  console.log(
    '已准备模拟志愿者、模拟需求方两个账号；不创建需求、服务、成果或时间余额，已有业务记录保持不变。',
  );
} finally {
  store.close();
}
