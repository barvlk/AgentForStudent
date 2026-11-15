// طبقة قاعدة البيانات: واجهة async واحدة فوق ثلاثة محركات:
//   sqlite  : node:sqlite المدمجة (محلياً، بدون تثبيت أي شيء)
//   pg      : PostgreSQL عبر DATABASE_URL (للنشر؛ البيانات تبقى محفوظة بعد إعادة التشغيل)
//   pglite  : PostgreSQL كامل يعمل داخل Node في الذاكرة (للاختبارات)
// كل الاستعلامات تُكتب بـ "?" وتُحوَّل تلقائياً إلى $1,$2.. لـ PostgreSQL، وكلها parameterized
// فلا مجال لـ SQL Injection. مخطط الجداول في db/migrations/*.sql ويُطبَّق تلقائياً عند الإقلاع.
import fs from 'node:fs';
import path from 'node:path';
import { config, WEB_ROOT } from './config.js';

export const dialect = config.dbDriver === 'sqlite' ? 'sqlite' : 'pg';
const MIGRATIONS_DIR = path.join(WEB_ROOT, 'db', 'migrations');

const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);
const normRows = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v)])));

// ---------------------------------------------------------------- المحركات
// كل محرك يعيد "اتصالاً" بواجهة: rows(sql, params) · exec(sql, params) · insert(sql, params) · script(sql)
async function openSqlite() {
  const { DatabaseSync } = await import('node:sqlite');
  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  const d = new DatabaseSync(config.dbFile);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const conn = {
    rows: async (sql, p = []) => d.prepare(sql).all(...p),
    exec: async (sql, p = []) => Number(d.prepare(sql).run(...p).changes),
    insert: async (sql, p = []) => Number(d.prepare(sql).run(...p).lastInsertRowid),
    script: async (sql) => { d.exec(sql); },
  };
  let queue = Promise.resolve(); // معاملة واحدة في وقت واحد على اتصال SQLite الوحيد
  return {
    conn,
    transaction: (fn) => {
      const run = queue.then(async () => {
        d.exec('BEGIN');
        try { const r = await fn(conn); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; }
      });
      queue = run.catch(() => {});
      return run;
    },
    close: async () => d.close(),
  };
}

const pgConn = (q) => ({
  rows: async (sql, p = []) => (await q.query(toPg(sql), p)).rows,
  exec: async (sql, p = []) => (await q.query(toPg(sql), p)).rowCount ?? 0,
  insert: async (sql, p = []) => (await q.query(`${toPg(sql)} RETURNING id`, p)).rows[0].id,
  script: async (sql) => { await q.query(sql); },
});

async function openPg() {
  const pg = (await import('pg')).default;
  pg.types.setTypeParser(20, (v) => Number(v)); // BIGINT (طوابع الوقت ms) كأرقام
  // نتحكم بـ SSL بأنفسنا: مزودو السحابة (Neon, Supabase, Render) يستخدمون شهادات تتطلب هذا الإعداد
  const url = new URL(config.databaseUrl);
  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  url.searchParams.delete('sslmode');
  const pool = new pg.Pool({
    connectionString: url.toString(), max: 5, idleTimeoutMillis: 30000,
    ssl: local ? false : { rejectUnauthorized: false },
  });
  // مزودو السحابة يغلقون الاتصالات الخاملة؛ نسجّل الخطأ بدل أن يسقط الخادم
  pool.on('error', (e) => console.warn('[db] idle client error:', e.message));
  return {
    conn: pgConn(pool),
    transaction: async (fn) => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const r = await fn(pgConn(client)); await client.query('COMMIT'); return r; }
      catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
      finally { client.release(); }
    },
    close: async () => pool.end(),
  };
}

async function openPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const d = new PGlite(config.pgliteDir ?? undefined);
  await d.waitReady;
  const mk = (q) => ({
    rows: async (sql, p = []) => normRows((await q.query(toPg(sql), p)).rows),
    exec: async (sql, p = []) => (await q.query(toPg(sql), p)).affectedRows ?? 0,
    insert: async (sql, p = []) => num((await q.query(`${toPg(sql)} RETURNING id`, p)).rows[0].id),
    script: async (sql) => { await q.exec(sql); },
  });
  return { conn: mk(d), transaction: (fn) => d.transaction((tx) => fn(mk(tx))), close: async () => d.close() };
}

// ---------------------------------------------------------------- الواجهة العامة
const wrap = (c) => ({
  all: (sql, p) => c.rows(sql, p),
  get: async (sql, p) => (await c.rows(sql, p))[0],
  run: async (sql, p) => ({ changes: await c.exec(sql, p) }),
  insert: (sql, p) => c.insert(sql, p),
  script: (sql) => c.script(sql),
});

let driver;
let api;

// إدراج صفوف كثيرة بأقل عدد من الرحلات للقاعدة (مهم عند القاعدة البعيدة)
export async function insertMany(a, table, columns, rows, suffix = 'ON CONFLICT DO NOTHING', chunk = 300) {
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const ph = `(${columns.map(() => '?').join(',')})`;
    await a.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${part.map(() => ph).join(',')} ${suffix}`, part.flat());
  }
}

async function migrate() {
  await api.script('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)'.replace('BIGINT', dialect === 'sqlite' ? 'INTEGER' : 'BIGINT'));
  const suffix = `.${dialect}.sql`;
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(suffix)).sort();
  const done = new Set((await api.all('SELECT id FROM schema_migrations')).map((r) => r.id));
  const applied = [];
  for (const f of files) {
    const id = f.slice(0, -suffix.length);
    if (done.has(id)) continue;
    await tx(async (t) => {
      await t.script(fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8'));
      await t.run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [id, Date.now()]);
    });
    applied.push(id);
  }
  return applied;
}

export const backend = config.dbDriver === 'pg' ? 'PostgreSQL' : config.dbDriver === 'pglite' ? 'PostgreSQL (PGlite)' : 'SQLite';

export const all = (sql, p) => api.all(sql, p);
export const get = (sql, p) => api.get(sql, p);
export const run = (sql, p) => api.run(sql, p);
export const insert = (sql, p) => api.insert(sql, p);
export const tx = (fn) => driver.transaction((conn) => fn(wrap(conn)));
export const close = () => driver.close();

driver = config.dbDriver === 'pg' ? await openPg() : config.dbDriver === 'pglite' ? await openPglite() : await openSqlite();
api = wrap(driver.conn);
export const migrations = await migrate(); // يطبّق ملفات db/migrations/*.sql التي لم تُطبَّق بعد

// إخفاء الرقم الجامعي في السجلات: 4411••••5
export const maskId = (id) => { const s = String(id); return s.length <= 5 ? '••••' : `${s.slice(0, 4)}${'•'.repeat(s.length - 5)}${s.slice(-1)}`; };

// سجل التدقيق: فشل التسجيل لا يجب أن يكسر الطلب
export async function audit(event, studentId = null, detail = null) {
  try {
    await run('INSERT INTO audit (ts, event, student_id, detail) VALUES (?, ?, ?, ?)', [Date.now(), event, studentId == null ? null : maskId(studentId), detail]);
  } catch (e) { console.warn('[audit] failed:', e.message); }
}
