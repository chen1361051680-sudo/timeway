import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import { check, text } from './common.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
export class Auth {
  constructor(store,adapters){this.s=store;this.adapters=adapters;}
  async code(body){
    const phone=text(body.phone,'手机号',11);check(/^1\d{10}$/.test(phone),'请输入正确的11位手机号');
    const old=this.s.db.prepare('SELECT * FROM otps WHERE phone=?').get(phone);
    check(!old||Date.now()-old.sent>=60000,'请等待60秒后重新获取验证码',429);
    const code=String(randomInt(100000,1000000));
    this.s.db.prepare('INSERT OR REPLACE INTO otps VALUES (?,?,?,?,?)').run(phone,hash(phone+code),Date.now()+300000,0,Date.now());
    try{const result=await this.adapters.sendCode(phone,code);return {sent:true,cooldown:60,...result};}
    catch(error){this.s.db.prepare('DELETE FROM otps WHERE phone=? AND hash=?').run(phone,hash(phone+code));throw error;}
  }
  verify(body){
    const phone=text(body.phone,'手机号',11),code=text(body.code,'验证码',6);
    check(body.agreed===true,'请阅读并同意用户协议和隐私说明');
    check(['volunteer','requester'].includes(body.role),'请选择正确身份');
    const otp=this.s.db.prepare('SELECT * FROM otps WHERE phone=?').get(phone);
    check(otp&&otp.expires>Date.now()&&otp.attempts<5,'验证码已失效，请重新获取');
    this.s.db.prepare('UPDATE otps SET attempts=attempts+1 WHERE phone=?').run(phone);
    check(otp.hash===hash(phone+code),'验证码错误');
    let row=this.s.db.prepare('SELECT id,role FROM users WHERE phone=?').get(phone);
    check(!row||row.role===body.role,'该手机号已注册为另一身份，请选择对应入口',409);
    return this.s.transaction(()=>{
      if(!row){const id=randomUUID();this.s.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id,phone,body.role,JSON.stringify({name:'',region:'',skills:'',contact:'',address:'',profileComplete:false,settings:{notifications:true,fontSize:'normal'}}));row={id};}
      this.s.db.prepare('DELETE FROM otps WHERE phone=?').run(phone);
      const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
      this.s.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
      this.s.db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token),row.id,csrf,Date.now()+30*86400000);
      return {token,csrf,user:this.s.user(row.id)};
    });
  }
  session(request){const token=(request.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tw_session='))?.slice(11);if(!token)return null;const session=this.s.db.prepare('SELECT * FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now());return session?{...session,user:this.s.user(session.user_id)}:null;}
  logout(session){if(session)this.s.db.prepare('DELETE FROM sessions WHERE token=?').run(session.token);return {ok:true};}
}
