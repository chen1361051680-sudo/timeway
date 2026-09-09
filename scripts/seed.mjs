import { Store } from '../src/store.mjs';
import { Domain } from '../src/domain.mjs';
const environment=process.env.NODE_ENV||'development';
if(!['development','test'].includes(environment))throw new Error('模拟数据只能写入开发或测试环境');
const store=new Store(process.env.DATABASE_PATH||`data/${environment}.sqlite`,environment),domain=new Domain(store);
try{store.transaction(()=>{
 if(store.users().length||store.all('task').length)throw new Error('只允许在空数据库生成模拟数据，请使用独立 DATABASE_PATH');
 for(const [id,phone,role,name] of [['demo-org','13800000001','requester','模拟 · 西湖社区服务中心'],['demo-vol','13800000002','volunteer','模拟 · 志愿者小路']]){const user={id,phone,role,name,region:'杭州西湖区',contact:'模拟负责人',address:'模拟机构地址',skills:'陪伴交流、数字助老',profileComplete:true,settings:{fontSize:'normal',notifications:true}};store.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id,phone,role,JSON.stringify(user));}
 const org=store.user('demo-org');for(const [index,title,category] of [[1,'模拟 · 陪伴老人聊天','陪伴交流'],[2,'模拟 · 智能手机使用协助','数字助老'],[3,'模拟 · 公园陪同散步','出行陪同']]){const start=new Date(Date.now()+index*86400000).toISOString();domain.createTask(org,{kind:'help',title,category,description:'此为明确标记的开发演示需求，用于熟悉报名和核实流程。',recipient:'模拟受助对象',region:org.region,address:'模拟服务地址',start,end:new Date(Date.parse(start)+3600000).toISOString(),deadline:start,capacity:3,minutes:60,status:'published'});}
 store.db.prepare('INSERT INTO metadata VALUES (?,?)').run('demo','true');
 });console.log('Created development-only demonstration accounts: requester 13800000001, volunteer 13800000002. No fabricated completed services or time credits.');
}finally{store.close();}
