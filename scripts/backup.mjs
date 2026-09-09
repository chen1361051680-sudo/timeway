import { DatabaseSync,backup } from 'node:sqlite';
import { mkdir,access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
if(existsSync('.env'))process.loadEnvFile('.env');
const environment=process.env.NODE_ENV||'development';
const source=resolve(process.env.DATABASE_PATH||`data/${environment}.sqlite`),directory=resolve(process.env.BACKUP_DIR||'backups');
await access(source);await mkdir(directory,{recursive:true});
const db=new DatabaseSync(source,{readOnly:true,timeout:5000});
try{
 const env=db.prepare("SELECT value FROM metadata WHERE key='environment'").get();if(env?.value!==environment)throw new Error('数据库环境不匹配');
 const destination=resolve(directory,`${environment}-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
 await backup(db,destination);const check=new DatabaseSync(destination,{readOnly:true});try{if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('备份完整性检查失败');}finally{check.close();}
 console.log(`SQLite consistent backup verified: ${destination}`);
}finally{db.close();}
