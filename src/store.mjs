import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Store {
  constructor(path = ':memory:', environment = 'test') {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) {
      this.db.close();
      throw new Error('数据库版本高于当前程序，请使用兼容版本，禁止降级覆盖');
    }
    const metadataExists = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'")
      .get();
    const environmentRow = metadataExists
      ? this.db.prepare('SELECT value FROM metadata WHERE key=?').get('environment')
      : null;
    if (environmentRow && environmentRow.value !== environment) {
      this.db.close();
      throw new Error('数据库环境不匹配，禁止混用开发与生产数据');
    }
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    if (version < 1)
      this.transaction(() =>
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL,id TEXT NOT NULL,owner TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS entity_owner ON entities(kind,owner);
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,phone TEXT UNIQUE NOT NULL,role TEXT NOT NULL CHECK(role IN ('volunteer','requester')),data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS otps(phone TEXT PRIMARY KEY,hash TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL,sent INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),org_id TEXT NOT NULL REFERENCES users(id),minutes INTEGER NOT NULL,kind TEXT NOT NULL,ref TEXT NOT NULL UNIQUE,task_id TEXT,note TEXT NOT NULL,created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS ledger_account ON ledger(user_id,org_id);
      CREATE TABLE IF NOT EXISTS idempotency(user_id TEXT NOT NULL,key TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(user_id,key));
      PRAGMA user_version=1;`),
      );
    const prior = this.db.prepare('SELECT value FROM metadata WHERE key=?').get('environment');
    if (prior && prior.value !== environment) {
      this.db.close();
      throw new Error('数据库环境不匹配，禁止混用开发与生产数据');
    }
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run('environment', environment);
  }
  all(kind) {
    return this.db
      .prepare('SELECT data FROM entities WHERE kind=?')
      .all(kind)
      .map((r) => JSON.parse(r.data));
  }
  get(kind, id) {
    const row = this.db.prepare('SELECT data FROM entities WHERE kind=? AND id=?').get(kind, id);
    return row && JSON.parse(row.data);
  }
  put(kind, data) {
    data.id ||= randomUUID();
    data.created ||= new Date().toISOString();
    data.updated = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET owner=excluded.owner,data=excluded.data',
      )
      .run(kind, data.id, data.owner || data.userId || '', JSON.stringify(data));
    return data;
  }
  user(id) {
    const r = this.db.prepare('SELECT * FROM users WHERE id=?').get(id);
    return r && { ...JSON.parse(r.data), id: r.id, phone: r.phone, role: r.role };
  }
  users() {
    return this.db
      .prepare('SELECT id FROM users')
      .all()
      .map((r) => this.user(r.id));
  }
  saveUser(user) {
    this.db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(user), user.id);
    return user;
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  close() {
    this.db.close();
  }
}
