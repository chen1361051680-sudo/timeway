import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Store } from '../src/store.mjs';
import { Auth } from '../src/auth.mjs';
import { createTimewayServer } from '../server.mjs';

test('hosted mobile testing reuses existing development data and keeps Secure sessions', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'timeway-hosted-demo-'));
  const productionPath = join(dir, 'production.sqlite'), demoPath = join(dir, 'development.sqlite');
  const production = new Store(productionPath, 'production');
  production.put('feedback', {owner:'preserved',content:'production record'});
  production.close();
  const local = new Store(demoPath,'development');
  const localUser = new Auth(local,'development').ensureDemoAccount('volunteer');
  local.saveUser({...localUser,name:'已有开发资料'});local.put('feedback',{owner:localUser.id,content:'已有开发业务记录'});local.close();
  const server = createTimewayServer({environment:'production',demoMode:true,databasePath:demoPath});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async()=>{await new Promise(r=>server.close(r));rmSync(dir,{recursive:true,force:true});});
  const base = `http://127.0.0.1:${server.address().port}`;
  const config = await (await fetch(base+'/api/config')).json();
  assert.equal(config.environment,'production');assert.equal(config.demoMode,true);
  for(const role of ['volunteer','requester']) {
    const r=await fetch(base+'/api/auth/demo-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...config.demoAccounts[role],role})});
    assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/; Secure/);
    const cookie=r.headers.get('set-cookie').split(';')[0];
    assert.equal((await (await fetch(base+'/api/me',{headers:{cookie}})).json()).user.role,role);
  }
  assert.match(await (await fetch(base)).text(),/手机测试环境/);
  assert.equal(server.context.store.db.prepare('SELECT value FROM metadata WHERE key=?').get('environment').value,'development');
  assert.equal(server.context.store.user('demo-vol').name,'已有开发资料');assert.equal(server.context.store.all('feedback').length,1);
  const verify = new Store(productionPath,'production');
  assert.equal(verify.users().length,0);assert.equal(verify.all('feedback').length,1);verify.close();
  assert.throws(()=>createTimewayServer({environment:'production',demoMode:true,databasePath:productionPath}),/环境不匹配/);
});
