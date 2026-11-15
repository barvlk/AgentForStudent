// مجموعة اختبارات تكاملية للـ API والقاعدة، تُشغَّل مرتين: على SQLite وعلى PostgreSQL (PGlite).
// يجب ضبط متغيرات البيئة (نوع القاعدة) قبل استيراد هذا الملف.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

const { server } = await import('../../server/index.js');
const svc = await import('../../server/services.js');
const auth = await import('../../server/auth.js');
const dbm = await import('../../server/db.js');
const { config } = await import('../../server/config.js');

export function defineApiTests(label) {
  let base;
  const DEMO = config.demoId;

  before(async () => {
    await svc.bootstrap();
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { server.close(); await dbm.close(); });

  async function call(method, url, body, cookie) {
    const res = await fetch(base + url, {
      method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})), cookie: res.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = async () => (await call('POST', '/api/login', { student_id: DEMO, password: config.demoPassword })).cookie;
  const otherStudents = async (n = 2) => (await dbm.all('SELECT student_id FROM students WHERE student_id <> ? ORDER BY student_id LIMIT ?', [DEMO, n])).map((r) => r.student_id);

  test(`[${label}] backend and migrations`, async () => {
    assert.equal(dbm.backend, { sqlite: 'SQLite', pglite: 'PostgreSQL (PGlite)', pg: 'PostgreSQL' }[label]);
    const m = await dbm.all('SELECT id FROM schema_migrations');
    assert.deepEqual(m.map((r) => r.id), ['001_init']);
  });

  test(`[${label}] data is loaded into normalized tables`, async () => {
    const n = async (t) => (await dbm.get(`SELECT COUNT(*) AS c FROM ${t}`)).c;
    assert.equal(await n('students'), 101);
    assert.equal(await n('courses'), 25);
    assert.ok((await n('enrollments')) > 1400);
    assert.ok((await n('tasks')) > 20);
    // العرض المسطّح يعيد نفس عدد التسجيلات
    assert.equal(await n('v_records'), await n('enrollments'));
  });

  test(`[${label}] SQL view computes GPA identically to the JS formula`, async () => {
    const p = await svc.profile(DEMO);
    const rows = await svc.transcript(DEMO);
    const graded = rows.filter((r) => r.credits > 0 && r.score != null);
    const hours = graded.reduce((a, r) => a + r.credits, 0);
    const gpa = graded.reduce((a, r) => a + r.points * r.credits, 0) / hours;
    assert.equal(p.gpa, Math.round(gpa * 100) / 100);
    assert.equal(p.earned_hours, graded.filter((r) => r.points > 0).reduce((a, r) => a + r.credits, 0));
    assert.equal(p.courses_count, rows.length);
  });

  test(`[${label}] constraints reject invalid data`, async () => {
    await assert.rejects(() => dbm.run('INSERT INTO tasks (student_id, course, title, priority, created_at) VALUES (?,?,?,?,?)', [DEMO, 'c', 't', 'bogus', 1]));
    await assert.rejects(() => dbm.run('INSERT INTO enrollments (student_id, course_code, term_no, score) VALUES (?,?,?,?)', [999000001, 'CS1011', 1, 90])); // طالب غير موجود
    await assert.rejects(() => dbm.run('INSERT INTO enrollments (student_id, course_code, term_no, score) VALUES (?,?,?,?)', [DEMO, 'CS1011', 1, 150])); // درجة خارج النطاق
    await assert.rejects(() => dbm.run('INSERT INTO users (student_id, password_hash) VALUES (?,?)', [999000002, 'x'])); // مستخدم بلا طالب
  });

  test(`[${label}] foreign keys cascade on delete, and transactions roll back`, async () => {
    await dbm.run('INSERT INTO students (student_id, name, level) VALUES (?,?,?)', [999000100, 'طالب اختبار', 'المستوى 1']);
    await svc.addTask(999000100, { course: 'x', title: 'y', priority: 'عادية' });
    assert.equal((await dbm.get('SELECT COUNT(*) AS c FROM tasks WHERE student_id = ?', [999000100])).c, 1);
    await dbm.run('DELETE FROM students WHERE student_id = ?', [999000100]);
    assert.equal((await dbm.get('SELECT COUNT(*) AS c FROM tasks WHERE student_id = ?', [999000100])).c, 0);

    await assert.rejects(() => dbm.tx(async (t) => {
      await t.run('INSERT INTO students (student_id, name, level) VALUES (?,?,?)', [999000101, 'مؤقت', 'x']);
      throw new Error('boom');
    }), /boom/);
    assert.equal(await dbm.get('SELECT 1 AS x FROM students WHERE student_id = ?', [999000101]), undefined);
  });

  test(`[${label}] security headers + static page`, async () => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
  });

  test(`[${label}] protected endpoints require login`, async () => {
    for (const u of ['/api/me', '/api/dashboard', '/api/tasks']) assert.equal((await call('GET', u)).status, 401);
    assert.equal((await call('POST', '/api/chat', { message: 'hi' })).status, 401);
  });

  test(`[${label}] login: wrong password and unknown id give the same message`, async () => {
    const a = await call('POST', '/api/login', { student_id: DEMO, password: 'wrong-pass1' });
    const b = await call('POST', '/api/login', { student_id: 999999999, password: 'wrong-pass1' });
    assert.equal(a.status, 401);
    assert.deepEqual(a.data, b.data);
  });

  test(`[${label}] login sets HttpOnly SameSite cookie, sessions are stored hashed`, async () => {
    const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: DEMO, password: config.demoPassword }) });
    assert.equal(res.status, 200);
    const sc = res.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/); assert.match(sc, /SameSite=Strict/);
    const token = sc.split(';')[0].split('=')[1];
    const rows = await dbm.all('SELECT token_hash FROM sessions');
    assert.ok(rows.length > 0 && rows.every((r) => r.token_hash !== token && r.token_hash.length === 64));
    const me = await call('GET', '/api/me', undefined, sc.split(';')[0]);
    assert.equal(me.data.profile.student_id, DEMO);
  });

  test(`[${label}] dashboard returns analytics and model metrics`, async () => {
    const c = await login();
    const d = (await call('GET', '/api/dashboard', undefined, c)).data;
    assert.equal(d.mastery.length, 4);
    assert.ok(d.mastery.every((m) => m.probability >= 0 && m.probability <= 1 && m.risk >= 0 && m.risk <= 1));
    assert.ok(d.model.metrics.roc_auc > 0.6);
    assert.ok(!('student_id' in d.transcript[0]));
    assert.equal((await call('GET', '/api/plan?hours=12', undefined, c)).data.weekly_hours, 12);
  });

  test(`[${label}] tasks: add, validate, complete, delete + IDOR protection`, async () => {
    const c = await login();
    const add = await call('POST', '/api/tasks', { course: 'تعلم الآلة', title: 'واجب <script>', priority: 'عالية', due_date: '2030-01-01', est_hours: 2 }, c);
    assert.equal(add.status, 200);
    assert.equal((await call('POST', '/api/tasks', { course: '', title: 'x', priority: 'عالية' }, c)).status, 400);
    assert.equal((await call('POST', '/api/tasks', { course: 'a', title: 'x', priority: 'bogus' }, c)).status, 400);
    const [other] = await otherStudents(1);
    const otherTask = await svc.addTask(other, { course: 'c', title: 't', priority: 'عادية' });
    assert.equal((await call('DELETE', `/api/tasks/${otherTask}`, undefined, c)).status, 404);
    assert.equal((await call('PATCH', `/api/tasks/${otherTask}`, { done: true }, c)).status, 404);
    assert.equal((await call('PATCH', `/api/tasks/${add.data.id}`, { done: true }, c)).status, 200);
    assert.equal((await call('DELETE', `/api/tasks/${add.data.id}`, undefined, c)).status, 200);
  });

  test(`[${label}] chat answers ANY typed message, not only preset prompts`, async () => {
    const c = await login();
    const ask = async (m) => (await call('POST', '/api/chat', { message: m }, c)).data;
    assert.match((await ask('وش مهامي؟')).reply, /مهام|\d\./);
    assert.match((await ask('ابغى اعرف وين ضعفي')).reply, /إتقان/);
    assert.match((await ask('سوي لي خطة 15 ساعة')).reply, /15 ساعة/);
    assert.match((await ask('كم يساوي 12*(3+4)')).reply, /84/);
    assert.match((await ask('اشرح لي شجرة البحث الثنائية')).reply, /BST/);
    assert.match((await ask('هلا')).reply, /أهلاً/);
    const sim = (await ask('لو اخذت A+ في مادة 4 ساعات كم يصير معدلي؟')).reply;
    assert.match(sim, /A\+/); assert.match(sim, /4 ساعات/); assert.match(sim, /يصبح معدلك التراكمي/);
    const unknown = await ask('qwerty zzz');
    assert.ok(unknown.reply.length > 10 && unknown.mode === 'local');
    assert.equal((await call('POST', '/api/chat', { message: '   ' }, c)).status, 400);
  });

  test(`[${label}] account lockout after repeated failures`, async () => {
    const [, sid] = await otherStudents(2);
    await auth.createUser(sid, 'Secret123');
    for (let i = 0; i < 5; i++) await call('POST', '/api/login', { student_id: sid, password: 'bad-pass-1' });
    const r = await call('POST', '/api/login', { student_id: sid, password: 'Secret123' });
    assert.equal(r.status, 423); // حتى كلمة المرور الصحيحة مرفوضة أثناء القفل
    assert.match(r.data.error, /قفل/);
  });

  test(`[${label}] password policy`, () => {
    assert.throws(() => auth.validatePassword('short1'), auth.PasswordPolicyError);
    assert.throws(() => auth.validatePassword('onlyletters'), auth.PasswordPolicyError);
    assert.throws(() => auth.validatePassword('12345678'), auth.PasswordPolicyError);
    assert.doesNotThrow(() => auth.validatePassword('GoodPass123'));
  });

  test(`[${label}] database errors do not leak to the client`, async () => {
    const c = await login();
    // قيمة صالحة شكلاً لكنها تخالف التحقق: يجب أن ترجع رسالة تحقق عربية، لا رسالة SQL
    const res = await call('POST', '/api/tasks', { course: 'a'.repeat(100), title: 'ok', priority: 'عالية', est_hours: 1e9 }, c);
    assert.equal(res.status, 400);
    assert.ok(!/constraint|violates|SQLITE|syntax/i.test(JSON.stringify(res.data)));
  });

  test(`[${label}] path traversal is blocked`, async () => {
    const text = await (await fetch(base + '/..%2f..%2fserver%2fconfig.js')).text();
    assert.ok(!text.includes('loadDotEnv'));
  });
}
