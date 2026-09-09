import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { Domain } from '../src/domain.mjs';
import { createTimewayServer } from '../server.mjs';
import { once } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function setup(t){const s=new Store(),d=new Domain(s);t.after(()=>s.close());let n=0;const user=role=>{const id=String(++n),u={id,phone:'1380000000'+id,role,name:role+id,region:'杭州西湖区',skills:'陪伴交流',contact:'联系人',address:'机构地址',profileComplete:true};s.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id,u.phone,role,JSON.stringify(u));return u;};return {s,d,org:user('requester'),vol:user('volunteer'),other:user('volunteer'),outsider:user('requester')};}
function taskInput(extra={}){const start=new Date(Date.now()+86400000).toISOString();return {kind:'help',title:'陪伴老人',description:'陪伴聊天',recipient:'社区老人',region:'杭州西湖区',address:'隐私门牌301',start,end:new Date(Date.now()+90000000).toISOString(),deadline:start,minutes:60,capacity:1,status:'published',lat:30.25,lng:120.15,...extra};}
function confirmService(ctx,vol=ctx.vol){const {s,d,org}=ctx;const task=d.createTask(org,taskInput());const a=d.apply(vol,task.id,{message:'参加'});d.applicationAction(org,a.id,{action:'accept'});const tr=s.get('task',task.id);tr.start=new Date(Date.now()-7200000).toISOString();tr.end=new Date(Date.now()-3600000).toISOString();s.put('task',tr);d.applicationAction(vol,a.id,{action:'submit',start:tr.start,end:tr.end,rest:0,content:'完成陪伴',note:'补录现场记录'});d.recordAction(org,a.id,{action:'confirm',minutes:60,recipients:1});return {task:tr,a};}

test('help → approval → confirmation → reservation → partial redemption; all financial actions idempotent',t=>{
 const c=setup(t),{s,d,org,vol,other}=c;
 const task=d.createTask(org,taskInput());assert.equal(d.task(other,task.id).address,undefined);
 const a=d.apply(vol,task.id,{}),b=d.apply(other,task.id,{});assert.equal(d.apply(vol,task.id,{}).id,a.id);
 d.applicationAction(org,a.id,{action:'accept'});assert.throws(()=>d.applicationAction(org,b.id,{action:'accept'}),/名额已满/);assert.equal(d.task(vol,task.id).address,'隐私门牌301');
 const tr=s.get('task',task.id);tr.start=new Date(Date.now()-7200000).toISOString();tr.end=new Date(Date.now()-3600000).toISOString();s.put('task',tr);
 d.applicationAction(vol,a.id,{action:'submit',start:tr.start,end:tr.end,rest:0,content:'聊天',note:'补录'});
 assert.equal(d.account(vol.id,org.id).available,0);assert.equal(d.map(vol).cells.length,0);
 d.recordAction(org,a.id,{action:'confirm',minutes:60,recipients:1});d.recordAction(org,a.id,{action:'confirm',minutes:60,recipients:1});assert.equal(d.account(vol.id,org.id).available,60);assert.equal(d.map(vol).summary.places,1);
 const offer=d.createTask(org,taskInput({kind:'redeem',minutes:45}));const book=d.book(vol,offer.id,{consent:true,recipient:'本人',phone:vol.phone});assert.equal(d.book(vol,offer.id,{consent:true,recipient:'本人',phone:vol.phone}).id,book.id);assert.equal(d.account(vol.id,org.id).available,15);
 assert.throws(()=>d.book(other,offer.id,{consent:true,recipient:'本人',phone:other.phone}),/名额/);
 d.bookingAction(org,book.id,{action:'accept'});const bk=s.get('booking',book.id);bk.start=tr.start;bk.end=tr.end;s.put('booking',bk);
 d.bookingAction(org,bk.id,{action:'result',minutes:30,content:'部分完成',recipients:1});assert.throws(()=>d.bookingAction(org,bk.id,{action:'complete'}),/仅申请人/);
 d.bookingAction(vol,bk.id,{action:'complete'});d.bookingAction(vol,bk.id,{action:'complete'});assert.equal(d.account(vol.id,org.id).available,30);assert.equal(d.account(vol.id,org.id).held,0);assert.equal(d.map(vol,'mine').summary.minutes,60);
 d.bookingAction(vol,bk.id,{action:'correction',minutes:15,reason:'核实只完成部分'});d.bookingAction(org,bk.id,{action:'correction-response',answer:'accept'});assert.equal(d.account(vol.id,org.id).available,45);
});
test('ownership, cancellation, disputes and correction preserve audit and recompute light',t=>{
 const c=setup(t),{s,d,org,vol,outsider}=c,{task,a}=confirmService(c);
 assert.throws(()=>d.recordAction(outsider,a.id,{action:'revoke',reason:'x'}),/无权/);
 d.recordAction(vol,a.id,{action:'dispute',reason:'时长有误'});assert.equal(d.map(vol).cells.length,0);
 d.recordAction(org,a.id,{action:'resolve',minutes:30,recipients:1,reason:'双方核实为30分钟'});assert.equal(d.account(vol.id,org.id).available,30);assert.equal(d.map(vol).cells.length,1);
 d.recordAction(org,a.id,{action:'revoke',reason:'记录无效',recipients:0});assert.equal(d.map(vol).cells.length,0);assert.equal(d.account(vol.id,org.id).available,0);
 assert.ok(s.all('audit').length>=3);assert.throws(()=>d.taskAction(outsider,task.id,{action:'cancel',reason:'x'}),/无权/);
});

test('team and repeated area events deduplicate; missing locations can be corrected without crediting twice',t=>{
 const c=setup(t),{s,d,org,vol,other}=c;const task=d.createTask(org,taskInput({capacity:2,lat:null,lng:null}));
 const a=d.apply(vol,task.id,{}),b=d.apply(other,task.id,{});d.applicationAction(org,a.id,{action:'accept'});d.applicationAction(org,b.id,{action:'accept'});
 const tr=s.get('task',task.id);tr.start=new Date(Date.now()-7200000).toISOString();tr.end=new Date(Date.now()-3600000).toISOString();s.put('task',tr);
 for(const [u,x] of [[vol,a],[other,b]]){d.applicationAction(u,x.id,{action:'submit',start:tr.start,end:tr.end,content:'团队陪伴',note:'现场补录'});d.recordAction(org,x.id,{action:'confirm',minutes:60,recipients:3});}
 assert.equal(d.map(vol).cells.length,0);assert.equal(d.map(vol).summary.pendingLocation,1);
 d.taskAction(org,task.id,{action:'location',lat:30.25,lng:120.15,reason:'机构核实主要服务地点'});assert.equal(d.map(vol).cells[0].count,1);assert.equal(d.map(vol).cells[0].volunteers,2);assert.equal(d.account(vol.id,org.id).available,60);
 confirmService(c);assert.equal(d.map(vol).cells.length,1);assert.equal(d.map(vol).cells[0].count,2);assert.equal(d.map(vol).summary.services,2);
 d.recordAction(vol,a.id,{action:'dispute',reason:'需要核实记录'});assert.equal(d.account(vol.id,org.id).disputed,60);assert.equal(d.account(vol.id,org.id).available,60);assert.equal(d.map(vol).cells[0].count,2);
});

test('accepted service cancellation supports genuine partial work and reapplication releases capacity',t=>{
 const {s,d,org,vol,other}=setup(t),task=d.createTask(org,taskInput()),a=d.apply(vol,task.id,{});
 assert.throws(()=>d.comments(vol,task.id),/无权/);d.applicationAction(org,a.id,{action:'accept'});assert.deepEqual(d.comments(vol,task.id),[]);
 d.applicationAction(vol,a.id,{action:'withdraw',reason:'安排冲突'});const repeated=d.apply(vol,task.id,{});assert.equal(repeated.status,'pending');d.applicationAction(org,a.id,{action:'accept'});
 const tr=s.get('task',task.id);tr.start=new Date(Date.now()-7200000).toISOString();tr.end=new Date(Date.now()-3600000).toISOString();s.put('task',tr);d.taskAction(org,task.id,{action:'cancel',reason:'活动提前结束'});
 d.applicationAction(vol,a.id,{action:'submit',start:tr.start,end:new Date(Date.parse(tr.start)+1800000).toISOString(),content:'实际完成30分钟',note:'现场已开始，提前结束'});d.recordAction(org,a.id,{action:'confirm',minutes:30,recipients:1});assert.equal(d.account(vol.id,org.id).available,30);
 assert.throws(()=>d.comment(other,task.id,{content:'越权留言'}),/仅相关/);
});

test('reschedule, extra consent and disputes cannot spend more than issuer credit',t=>{
 const c=setup(t),{s,d,org,vol,outsider}=c;confirmService(c);const offer=d.createTask(org,taskInput({kind:'redeem',minutes:30})),bk=d.book(vol,offer.id,{consent:true,recipient:'本人',phone:vol.phone});
 d.bookingAction(org,bk.id,{action:'accept'});d.bookingAction(vol,bk.id,{action:'reschedule',start:new Date(Date.now()+172800000).toISOString(),end:new Date(Date.now()+176400000).toISOString(),reason:'改到后天'});assert.throws(()=>d.bookingAction(vol,bk.id,{action:'respond',answer:'accept'}),/另一方/);d.bookingAction(org,bk.id,{action:'respond',answer:'accept'});
 d.bookingAction(org,bk.id,{action:'extra',minutes:15,reason:'增加协助项目'});assert.throws(()=>d.bookingAction(outsider,bk.id,{action:'extra-response',answer:'accept'}),/无权/);d.bookingAction(vol,bk.id,{action:'extra-response',answer:'accept'});assert.equal(d.account(vol.id,org.id).held,45);assert.equal(d.account(vol.id,org.id).available,15);
 const b=s.get('booking',bk.id);b.start=new Date(Date.now()-7200000).toISOString();b.end=new Date(Date.now()-3600000).toISOString();s.put('booking',b);assert.throws(()=>d.bookingAction(org,b.id,{action:'result',minutes:46,content:'过多',recipients:1}),/追加/);
 d.bookingAction(org,b.id,{action:'result',minutes:45,content:'实际协助',recipients:1});d.bookingAction(vol,b.id,{action:'dispute',reason:'实际应为30分钟'});assert.equal(d.account(vol.id,org.id).held,45);d.bookingAction(org,b.id,{action:'result',minutes:30,content:'双方核实30分钟',recipients:1});d.bookingAction(vol,b.id,{action:'complete'});assert.equal(d.account(vol.id,org.id).available,30);assert.ok(s.all('audit').filter(a=>a.ref===b.id).length>=6);
});

test('record reversals after redemption expose debt without creating usable time',t=>{
 const c=setup(t),{s,d,org,vol}=c,{a}=confirmService(c),offer=d.createTask(org,taskInput({kind:'redeem',minutes:60})),bk=d.book(vol,offer.id,{consent:true,recipient:'本人',phone:vol.phone});d.bookingAction(org,bk.id,{action:'accept'});const b=s.get('booking',bk.id);b.start=new Date(Date.now()-3600000).toISOString();s.put('booking',b);d.bookingAction(org,b.id,{action:'result',minutes:60,content:'完成',recipients:1});d.bookingAction(vol,b.id,{action:'complete'});d.recordAction(org,a.id,{action:'revoke',reason:'原始记录错误',recipients:0});assert.equal(d.account(vol.id,org.id).available,0);assert.equal(d.account(vol.id,org.id).debt,60);assert.throws(()=>d.book(vol,d.createTask(org,taskInput({kind:'redeem'})).id,{consent:true,recipient:'本人',phone:vol.phone}),/不足/);
});
test('core changes wait for participant confirmation; decline releases accepted place',t=>{
 const {s,d,org,vol}=setup(t),task=d.createTask(org,taskInput()),a=d.apply(vol,task.id,{});d.applicationAction(org,a.id,{action:'accept'});
 const edit=d.saveTask(org,task.id,{...task,address:'新的集合地址'});assert.ok(edit.pending);assert.equal(d.task(vol,task.id).address,'隐私门牌301');
 d.applicationAction(vol,a.id,{action:'change',answer:'accept'});assert.equal(d.task(vol,task.id).address,'新的集合地址');
 const current=d.task(org,task.id);d.saveTask(org,task.id,{...current,address:'第三个地址'});d.applicationAction(vol,a.id,{action:'change',answer:'decline'});assert.equal(s.get('application',a.id).status,'withdrawn');assert.equal(d.task(org,task.id).remaining,1);
});
test('cancelled redemption releases held balance; other organization cannot spend it',t=>{
 const c=setup(t),{d,org,vol,outsider}=c;confirmService(c);
 const offer=d.createTask(org,taskInput({kind:'redeem',minutes:30})),bk=d.book(vol,offer.id,{consent:true,recipient:'本人',phone:vol.phone});
 d.bookingAction(vol,bk.id,{action:'cancel',reason:'行程变化'});d.bookingAction(vol,bk.id,{action:'cancel',reason:'重试'});assert.equal(d.account(vol.id,org.id).available,60);
 const foreign=d.createTask(outsider,taskInput({kind:'redeem',minutes:10}));assert.throws(()=>d.book(vol,foreign.id,{consent:true,recipient:'本人',phone:vol.phone}),/对应机构/);
});
test('sqlite survives reopening; production cannot open development data',()=>{
 const folder=mkdtempSync(join(tmpdir(),'timeway-db-')),path=join(folder,'test.sqlite');try{const s=new Store(path,'development');s.put('feedback',{id:'saved',owner:'test',content:'persistent'});s.close();const reopened=new Store(path,'development');assert.equal(reopened.get('feedback','saved').content,'persistent');reopened.close();assert.throws(()=>new Store(path,'production'),/环境不匹配/);}finally{rmSync(folder,{recursive:true,force:true});}
});
test('HTTP auth, csrf, idempotent creation and production mock gate',async t=>{
 const server=createTimewayServer({environment:'test',databasePath:':memory:'});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,data,headers={},method='POST')=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(data)});
 const code=await (await post('/api/auth/code',{phone:'13800000001'})).json();assert.match(code.developmentCode,/^\d{6}$/);
 const login=await post('/api/auth/verify',{phone:'13800000001',code:code.developmentCode,role:'requester',agreed:true});const cookie=login.headers.get('set-cookie').split(';')[0],auth=await login.json(),h={cookie,'x-csrf-token':auth.csrf};
 assert.equal((await post('/api/profile',{name:'机构',region:'杭州',contact:'张',address:'地址'},h,'PUT')).status,200);
 assert.equal((await post('/api/tasks',taskInput(),{cookie})).status,403);
 const hh={...h,'idempotency-key':'test-create-001'},first=await(await post('/api/tasks',taskInput(),hh)).json();
 const original=server.context.store.get('task',first.id);const payload=taskInput({start:original.start,end:original.end,deadline:original.deadline});
 // A different payload using a previous key must be rejected rather than duplicated.
 assert.equal((await post('/api/tasks',{...payload,title:'different'},hh)).status,409);
 assert.equal((await post('/api/tasks',taskInput(),{...h,Origin:'https://evil.invalid'})).status,403);
 const prod=createTimewayServer({environment:'production',databasePath:':memory:'});prod.listen(0,'127.0.0.1');await once(prod,'listening');t.after(()=>new Promise(r=>prod.close(r)));const r=await fetch(`http://127.0.0.1:${prod.address().port}/api/auth/code`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:'13800000002'})});assert.equal(r.status,503);assert.equal((await r.json()).developmentCode,undefined);
});
