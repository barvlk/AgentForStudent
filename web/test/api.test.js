// اختبار تكاملي للـ API على قاعدة بيانات مؤقتة وبدون Gemini (يختبر المحرك المحلي).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
process.env.AFS_WEB_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'afs-')), 'test.db');
process.env.GEMINI_API_KEY = '';
process.env.AFS_DEMO_STUDENT_ID = '441126225';
process.env.AFS_DEMO_PASSWORD = 'Demo2026x';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

const { server } = await import('../server/index.js');
const svc = await import('../server/services.js');
const auth = await import('../server/auth.js');
let base;

before(async () => {
  svc.bootstrap();
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(method, url, body, cookie) {
  const res = await fetch(base + url, {
    method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const login = async () => (await call('POST', '/api/login', { student_id: 441126225, password: 'Demo2026x' })).cookie;

test('security headers + static page', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('protected endpoints require login', async () => {
  for (const u of ['/api/me', '/api/dashboard', '/api/tasks']) assert.equal((await call('GET', u)).status, 401);
  assert.equal((await call('POST', '/api/chat', { message: 'hi' })).status, 401);
});

test('login: wrong password and unknown id give the same message', async () => {
  const a = await call('POST', '/api/login', { student_id: 441126225, password: 'wrong-pass1' });
  const b = await call('POST', '/api/login', { student_id: 999999999, password: 'wrong-pass1' });
  assert.equal(a.status, 401);
  assert.deepEqual(a.data, b.data);
});

test('login ok sets HttpOnly SameSite cookie and /api/me works', async () => {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: 441126225, password: 'Demo2026x' }) });
  assert.equal(res.status, 200);
  const sc = res.headers.get('set-cookie');
  assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
  const me = await call('GET', '/api/me', undefined, sc.split(';')[0]);
  assert.equal(me.data.profile.student_id, 441126225);
});

test('dashboard returns analytics and model metrics', async () => {
  const c = await login();
  const d = (await call('GET', '/api/dashboard', undefined, c)).data;
  assert.equal(d.mastery.length, 4);
  assert.ok(d.mastery.every((m) => m.probability >= 0 && m.probability <= 1 && m.risk >= 0 && m.risk <= 1));
  assert.ok(d.model.metrics.roc_auc > 0.6);
  assert.ok(!('student_id' in d.transcript[0]));
  const plan = (await call('GET', '/api/plan?hours=12', undefined, c)).data;
  assert.equal(plan.weekly_hours, 12);
});

test('tasks: add, validate, complete, delete + IDOR protection', async () => {
  const c = await login();
  const add = await call('POST', '/api/tasks', { course: 'تعلم الآلة', title: 'واجب <script>', priority: 'عالية', due_date: '2030-01-01', est_hours: 2 }, c);
  assert.equal(add.status, 200);
  assert.equal((await call('POST', '/api/tasks', { course: '', title: 'x', priority: 'عالية' }, c)).status, 400);
  assert.equal((await call('POST', '/api/tasks', { course: 'a', title: 'x', priority: 'bogus' }, c)).status, 400);
  // مهمة طالب آخر لا يمكن لمسها
  const other = svc.addTask(441000001, { course: 'c', title: 't', priority: 'عادية' });
  assert.equal((await call('DELETE', `/api/tasks/${other}`, undefined, c)).status, 404);
  assert.equal((await call('PATCH', `/api/tasks/${other}`, { done: true }, c)).status, 404);
  assert.equal((await call('PATCH', `/api/tasks/${add.data.id}`, { done: true }, c)).status, 200);
  assert.equal((await call('DELETE', `/api/tasks/${add.data.id}`, undefined, c)).status, 200);
});

test('chat answers ANY typed message, not only preset prompts', async () => {
  const c = await login();
  const ask = async (m) => (await call('POST', '/api/chat', { message: m }, c)).data;
  assert.match((await ask('وش مهامي؟')).reply, /مهام|\d\./);
  assert.match((await ask('ابغى اعرف وين ضعفي')).reply, /إتقان/);
  assert.match((await ask('سوي لي خطة 15 ساعة')).reply, /15 ساعة/);
  assert.match((await ask('كم يساوي 12*(3+4)')).reply, /84/);
  assert.match((await ask('اشرح لي شجرة البحث الثنائية')).reply, /BST/);
  assert.match((await ask('هلا')).reply, /هلا/);
  const unknown = await ask('qwerty zzz');
  assert.ok(unknown.reply.length > 10 && unknown.mode === 'local');
  assert.equal((await call('POST', '/api/chat', { message: '   ' }, c)).status, 400);
});

test('account lockout after repeated failures', async () => {
  auth.createUser(441000002, 'Secret123');
  for (let i = 0; i < 5; i++) await call('POST', '/api/login', { student_id: 441000002, password: 'bad-pass-1' });
  const r = await call('POST', '/api/login', { student_id: 441000002, password: 'Secret123' });
  assert.equal(r.status, 423); // حتى كلمة المرور الصحيحة مرفوضة أثناء القفل
  assert.match(r.data.error, /قفل/);
});

test('password policy', () => {
  assert.throws(() => auth.validatePassword('short1'), auth.PasswordPolicyError);
  assert.throws(() => auth.validatePassword('onlyletters'), auth.PasswordPolicyError);
  assert.throws(() => auth.validatePassword('12345678'), auth.PasswordPolicyError);
  assert.doesNotThrow(() => auth.validatePassword('GoodPass123'));
});

test('path traversal is blocked', async () => {
  const res = await fetch(base + '/..%2f..%2fserver%2fconfig.js');
  const text = await res.text();
  assert.ok(!text.includes('loadDotEnv'));
});
