// المصادقة والجلسات.
//  - كلمات المرور: scrypt (دالة بطيئة عمداً ومستهلكة للذاكرة) مع salt عشوائي لكل مستخدم.
//  - مقارنة ثابتة الزمن (timingSafeEqual) + hash وهمي عند عدم وجود المستخدم (منع Timing Attack).
//  - قفل الحساب مؤقتاً بعد محاولات فاشلة متكررة (Brute Force).
//  - رسالة خطأ موحّدة لا تكشف هل الرقم موجود (منع User Enumeration).
//  - الجلسة: رمز عشوائي 256 بت في كوكي HttpOnly + SameSite=Strict، ويُخزَّن في القاعدة كـ SHA-256 فقط.
//  - انتهاء الجلسة بعد فترة خمول.
import crypto from 'node:crypto';
import { get, run, audit } from './db.js';
import { config } from './config.js';

const N = 16384, KEYLEN = 64;
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEYLEN, { N });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N });
  return crypto.timingSafeEqual(actual, expected);
}

export class PasswordPolicyError extends Error {}
export function validatePassword(pw) {
  if (typeof pw !== 'string' || pw.length < config.minPasswordLength) throw new PasswordPolicyError(`كلمة المرور يجب ألا تقل عن ${config.minPasswordLength} خانات.`);
  if (!/\p{L}/u.test(pw)) throw new PasswordPolicyError('كلمة المرور يجب أن تحتوي على حرف واحد على الأقل.');
  if (!/\d/.test(pw)) throw new PasswordPolicyError('كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.');
  if (pw.length > 72) throw new PasswordPolicyError('كلمة المرور طويلة جداً.');
}

// يتطلب أن يكون الطالب موجوداً في جدول students (مفتاح أجنبي)
export const createUser = (studentId, password, mustChange = false) => run(
  `INSERT INTO users (student_id, password_hash, must_change, failed_attempts, locked_until) VALUES (?, ?, ?, 0, NULL)
   ON CONFLICT (student_id) DO UPDATE SET password_hash = excluded.password_hash, must_change = excluded.must_change,
     failed_attempts = 0, locked_until = NULL`,
  [studentId, hashPassword(password), mustChange ? 1 : 0],
);

// حساب العرض العام: كلمة مروره منشورة، فنثبّتها ونمنع قفله على بقية الزوار
export async function ensureFixedPassword(studentId, password) {
  const u = await get('SELECT password_hash FROM users WHERE student_id = ?', [studentId]);
  if (!u || !verifyPassword(password, u.password_hash)) await createUser(studentId, password, false);
  else await run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE student_id = ?', [studentId]);
}

export async function authenticate(studentId, password) {
  const now = Date.now();
  const u = await get('SELECT * FROM users WHERE student_id = ?', [studentId]);
  if (u?.locked_until && u.locked_until > now) {
    await audit('login_locked', studentId);
    return { status: 'locked', minutesLeft: Math.ceil((u.locked_until - now) / 60000) };
  }
  const ok = verifyPassword(password, u ? u.password_hash : DUMMY_HASH) && !!u;
  if (!ok) {
    if (u) {
      const attempts = u.failed_attempts + 1;
      const lock = attempts >= config.maxLoginAttempts ? now + config.lockoutMinutes * 60000 : null;
      await run('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE student_id = ?', [lock ? 0 : attempts, lock, studentId]);
    }
    await audit('login_failed', studentId);
    return { status: 'invalid' };
  }
  await run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE student_id = ?', [studentId]);
  await audit('login_ok', studentId);
  return { status: 'ok', mustChange: !!u.must_change };
}

export async function changePassword(studentId, oldPw, newPw) {
  const u = await get('SELECT password_hash FROM users WHERE student_id = ?', [studentId]);
  if (!u || !verifyPassword(oldPw, u.password_hash)) return false;
  validatePassword(newPw);
  await run('UPDATE users SET password_hash = ?, must_change = 0 WHERE student_id = ?', [hashPassword(newPw), studentId]);
  await run('DELETE FROM sessions WHERE student_id = ?', [studentId]); // إنهاء كل الجلسات القديمة
  await audit('password_changed', studentId);
  return true;
}

// ---------- الجلسات ----------
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export async function createSession(studentId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  await run('INSERT INTO sessions (token_hash, student_id, created_at, last_seen) VALUES (?, ?, ?, ?)', [sha(token), studentId, now, now]);
  return token;
}

export async function getSession(token) {
  if (!token) return null;
  const h = sha(token);
  const s = await get('SELECT * FROM sessions WHERE token_hash = ?', [h]);
  if (!s) return null;
  const now = Date.now();
  if (now - s.last_seen > config.sessionTimeoutMinutes * 60000) {
    await run('DELETE FROM sessions WHERE token_hash = ?', [h]);
    return null;
  }
  await run('UPDATE sessions SET last_seen = ? WHERE token_hash = ?', [now, h]);
  const u = await get('SELECT must_change FROM users WHERE student_id = ?', [s.student_id]);
  return { id: h, studentId: s.student_id, mustChange: !!u?.must_change };
}

export const destroySession = (token) => (token ? run('DELETE FROM sessions WHERE token_hash = ?', [sha(token)]) : null);

// تنظيف الجلسات المنتهية (يُستدعى دورياً حتى لا تكبر الجدول)
export const purgeExpiredSessions = () => run('DELETE FROM sessions WHERE last_seen < ?', [Date.now() - config.sessionTimeoutMinutes * 60000]);
