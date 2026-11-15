// قاعدة البيانات: SQLite المدمجة في Node (node:sqlite) — بدون أي مكتبة خارجية.
// كل الاستعلامات parameterized (؟) فلا مجال لـ SQL Injection.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
export const db = new DatabaseSync(config.dbFile);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS records (
  student_id INTEGER NOT NULL, name TEXT NOT NULL, level TEXT, term_no INTEGER NOT NULL,
  course_code TEXT NOT NULL, course_name TEXT NOT NULL, credits REAL NOT NULL,
  score REAL, letter TEXT, points REAL, domain TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_records_student ON records(student_id);

CREATE TABLE IF NOT EXISTS users (
  student_id INTEGER PRIMARY KEY, password_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0, failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, student_id INTEGER NOT NULL, created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, course TEXT NOT NULL, title TEXT NOT NULL,
  priority TEXT NOT NULL, due_date TEXT, est_hours REAL, done INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_student ON tasks(student_id);

CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, event TEXT NOT NULL, student_id TEXT, detail TEXT
);
`);

export const audit = (event, studentId = null, detail = null) =>
  db.prepare('INSERT INTO audit (ts, event, student_id, detail) VALUES (?, ?, ?, ?)')
    .run(Date.now(), event, studentId == null ? null : maskId(studentId), detail);

// إخفاء الرقم الجامعي في السجلات: 4411••••5
export const maskId = (id) => { const s = String(id); return s.length <= 5 ? '••••' : `${s.slice(0, 4)}${'•'.repeat(s.length - 5)}${s.slice(-1)}`; };

export const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};
