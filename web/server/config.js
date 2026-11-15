// الإعدادات: تُقرأ من متغيرات البيئة أو من ملف .env في جذر المشروع (بدون أي مكتبة خارجية).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = path.resolve(here, '..');
const PROJECT_ROOT = path.resolve(WEB_ROOT, '..');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}
loadDotEnv(path.join(WEB_ROOT, '.env'));
loadDotEnv(path.join(PROJECT_ROOT, '.env'));

const num = (name, def) => {
  const v = Number(process.env[name]);
  return process.env[name] && Number.isFinite(v) ? v : def;
};

export const config = {
  port: num('PORT', 3000),
  geminiKey: process.env.GEMINI_API_KEY || null,
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  temperature: num('GEMINI_TEMPERATURE', 0.3),
  // قاعدة البيانات: PostgreSQL إن وُجد DATABASE_URL (للنشر ويحفظ البيانات دائماً)، وإلا SQLite محلياً.
  // AFS_DB=pglite يشغّل PostgreSQL مدمجاً في الذاكرة (يُستخدم للاختبارات).
  databaseUrl: process.env.DATABASE_URL || null,
  dbDriver: process.env.AFS_DB || (process.env.DATABASE_URL ? 'pg' : 'sqlite'),
  dbFile: process.env.AFS_WEB_DB || path.join(WEB_ROOT, 'data', 'afs.db'),
  pgliteDir: process.env.AFS_PGLITE_DIR || null,
  maxLoginAttempts: num('AFS_MAX_LOGIN_ATTEMPTS', 5),
  lockoutMinutes: num('AFS_LOCKOUT_MINUTES', 15),
  sessionTimeoutMinutes: num('AFS_SESSION_TIMEOUT_MINUTES', 30),
  minPasswordLength: num('AFS_MIN_PASSWORD_LENGTH', 8),
  demoId: num('AFS_DEMO_STUDENT_ID', 441126225),
  demoPassword: process.env.AFS_DEMO_PASSWORD || 'Demo2026x',
  demoName: process.env.AFS_DEMO_NAME || 'عبدالمجيد',
  atRiskThreshold: 75,
  masteryThreshold: 80,
  domains: ['AI', 'Math', 'Programming', 'Systems'],
  secureCookie: process.env.NODE_ENV === 'production',
};
