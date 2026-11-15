// خادم HTTP (Node.js بدون أي إطار): REST API + تقديم الواجهة الأمامية الثابتة.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, WEB_ROOT } from './config.js';
import { audit, backend } from './db.js';
import * as auth from './auth.js';
import * as svc from './services.js';
import { chat, clearChat } from './chat.js';
import { PRIORITIES } from './ml/scheduler.js';
import { DOMAIN_LABELS } from './ml/planner.js';

const CLIENT_DIR = path.join(WEB_ROOT, 'client');
const COOKIE = 'afs_session';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ---------- أدوات مساعدة ----------
function send(res, status, body, headers = {}) {
  const isJson = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { ...SECURITY_HEADERS, ...(isJson ? { 'Content-Type': 'application/json; charset=utf-8' } : {}), ...headers });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) return reject(new HttpError(415, 'نوع المحتوى غير مدعوم.'));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 32 * 1024) { reject(new HttpError(413, 'الطلب كبير جداً.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new HttpError(400, 'JSON غير صالح.')); } });
    req.on('error', reject);
  });
}

const parseCookies = (h = '') => Object.fromEntries(h.split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, v.join('=')]));
const setCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secureCookie ? '; Secure' : ''}`;

// تحديد معدل الطلبات لكل IP (نافذة منزلقة بسيطة) — حماية إضافية من التخمين والإغراق
const hits = new Map();
function rateLimit(ip, key, max, windowMs) {
  const k = `${key}:${ip}`, now = Date.now();
  const arr = (hits.get(k) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(k, arr);
  if (arr.length > max) throw new HttpError(429, 'طلبات كثيرة، حاول بعد قليل.');
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (!v.some((t) => now - t < 120000)) hits.delete(k); }, 60000).unref();

// ---------- المسارات ----------
const routes = [];
const route = (method, pattern, handler, { public: isPublic = false, allowMustChange = false } = {}) =>
  routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler, isPublic, allowMustChange });

route('GET', '/api/health', () => ({ ok: true, ai: !!config.geminiKey }), { public: true });

route('GET', '/api/config', () => ({
  demo: { id: config.demoId, password: config.demoPassword }, ai: !!config.geminiKey, priorities: PRIORITIES, domain_labels: DOMAIN_LABELS,
}), { public: true });

route('POST', '/api/login', async (ctx) => {
  rateLimit(ctx.ip, 'login', 20, 60000);
  const { student_id, password } = await readJson(ctx.req);
  const sid = Number(String(student_id ?? '').trim());
  if (!Number.isSafeInteger(sid) || sid <= 0 || typeof password !== 'string' || !password) throw new HttpError(400, 'أدخل رقماً جامعياً صحيحاً وكلمة المرور.');
  if (sid === config.demoId) await auth.ensureFixedPassword(sid, config.demoPassword);
  const r = await auth.authenticate(sid, password);
  if (r.status === 'locked') throw new HttpError(423, `تم قفل الحساب مؤقتاً بسبب محاولات متكررة. حاول بعد ${r.minutesLeft} دقيقة.`);
  if (r.status !== 'ok' || !(await svc.profile(sid))) throw new HttpError(401, 'الرقم الجامعي أو كلمة المرور غير صحيحة.'); // رسالة موحّدة
  const token = await auth.createSession(sid);
  ctx.headers['Set-Cookie'] = setCookie(token, config.sessionTimeoutMinutes * 60 * 4);
  return { ok: true, must_change_password: r.mustChange };
}, { public: true });

route('POST', '/api/logout', async (ctx) => {
  await audit('logout', ctx.session.studentId);
  clearChat(ctx.session.id);
  await auth.destroySession(ctx.token);
  ctx.headers['Set-Cookie'] = setCookie('', 0);
  return { ok: true };
}, { allowMustChange: true });

route('GET', '/api/me', async (ctx) => {
  const p = await svc.profile(ctx.session.studentId);
  if (!p) throw new HttpError(404, 'تعذر العثور على سجلك الأكاديمي.');
  return { profile: p, must_change_password: ctx.session.mustChange, is_demo: ctx.session.studentId === config.demoId, ai: !!config.geminiKey };
}, { allowMustChange: true });

route('POST', '/api/change-password', async (ctx) => {
  if (ctx.session.studentId === config.demoId) throw new HttpError(403, 'لا يمكن تغيير كلمة مرور الحساب التجريبي.');
  const { old_password, new_password } = await readJson(ctx.req);
  try {
    if (!(await auth.changePassword(ctx.session.studentId, String(old_password ?? ''), String(new_password ?? '')))) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة.');
  } catch (e) { if (e instanceof auth.PasswordPolicyError) throw new HttpError(400, e.message); throw e; }
  ctx.headers['Set-Cookie'] = setCookie('', 0); // الجلسات القديمة أُنهيت: يلزم دخول جديد
  return { ok: true };
}, { allowMustChange: true });

route('GET', '/api/dashboard', async (ctx) => {
  const sid = ctx.session.studentId;
  const a = await svc.analytics(sid);
  const transcript = await svc.transcript(sid);
  const byTerm = {};
  for (const r of transcript) if (r.score != null) (byTerm[r.term_no] ??= []).push(r.score);
  return {
    profile: await svc.profile(sid),
    mastery: Object.entries(a.mastery).map(([domain, e]) => ({ ...e, domain, label_ar: DOMAIN_LABELS[domain], risk: a.risk[domain] ?? null })),
    terms: Object.entries(byTerm).map(([term, s]) => ({ term: Number(term), avg: Math.round((s.reduce((x, y) => x + y, 0) / s.length) * 10) / 10 })),
    transcript: transcript.map(({ student_id, name, level, domain, ...r }) => ({ ...r, domain })),
    model: svc.riskModel ? { metrics: svc.riskModel.metrics, importance: svc.riskModel.featureImportance() } : null,
  };
});

route('GET', '/api/plan', async (ctx) => {
  const hours = Math.min(Math.max(Number(ctx.url.searchParams.get('hours')) || 10, 1), 60);
  return await svc.weeklyPlan(ctx.session.studentId, hours);
});

route('GET', '/api/tasks', async (ctx) => ({ tasks: await svc.scheduledTasks(ctx.session.studentId) }));
route('POST', '/api/tasks', async (ctx) => {
  const body = await readJson(ctx.req);
  try { const id = await svc.addTask(ctx.session.studentId, body); await audit('task_added', ctx.session.studentId); return { ok: true, id: Number(id) }; }
  catch (e) { if (e instanceof svc.ValidationError) throw new HttpError(400, e.message); throw e; }
});
route('PATCH', '/api/tasks/:id', async (ctx) => {
  const { done } = await readJson(ctx.req);
  if (!(await svc.setTaskDone(ctx.session.studentId, Number(ctx.params.id), done !== false))) throw new HttpError(404, 'المهمة غير موجودة.');
  return { ok: true };
});
route('DELETE', '/api/tasks/:id', async (ctx) => {
  if (!(await svc.deleteTask(ctx.session.studentId, Number(ctx.params.id)))) throw new HttpError(404, 'المهمة غير موجودة.');
  return { ok: true };
});

route('POST', '/api/chat', async (ctx) => {
  rateLimit(ctx.ip, 'chat', 30, 60000);
  const { message } = await readJson(ctx.req);
  try { return await chat(ctx.session.id, ctx.session.studentId, message); } catch (e) { if (e instanceof svc.ValidationError) throw new HttpError(400, e.message); throw e; }
});
route('DELETE', '/api/chat', (ctx) => { clearChat(ctx.session.id); return { ok: true }; });

// ---------- الملفات الثابتة ----------
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(CLIENT_DIR, rel);
  if (!file.startsWith(CLIENT_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 200, fs.readFileSync(path.join(CLIENT_DIR, 'index.html')), { 'Content-Type': MIME['.html'] }); // SPA fallback
  }
  send(res, 200, fs.readFileSync(file), { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
}

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method Not Allowed');
      return serveStatic(req, res, url.pathname);
    }
    // حماية CSRF إضافية: الطلبات المغيِّرة يجب أن تأتي من نفس الأصل
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new HttpError(403, 'أصل الطلب غير مسموح.');
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'غير موجود.');
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const ctx = { req, url, params: r.re.exec(url.pathname).groups ?? {}, ip: req.socket.remoteAddress ?? '', headers: {}, token, session: null };
    if (!r.isPublic) {
      ctx.session = await auth.getSession(token);
      if (!ctx.session) throw new HttpError(401, 'انتهت الجلسة. سجّل دخولك مرة أخرى.');
      if (ctx.session.mustChange && !r.allowMustChange) {
        throw new HttpError(403, 'يجب تغيير كلمة المرور أولاً.');
      }
    }
    const out = await r.handler(ctx);
    send(res, 200, out, ctx.headers);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('[server]', e);
    send(res, status, { error: status === 500 ? 'خطأ داخلي في الخادم.' : e.message });
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  await svc.bootstrap();
  setInterval(() => auth.purgeExpiredSessions().catch(() => {}), 10 * 60000).unref();
  console.log(`✔ قاعدة البيانات: ${backend} · تم تجهيز البيانات وتدريب نموذج التنبؤ في ${Date.now() - t0}ms — ROC-AUC = ${svc.riskModel.metrics.roc_auc}`);
  server.listen(config.port, () => {
    console.log(`✔ AgentForStudent جاهز على http://localhost:${config.port}`);
    console.log(config.geminiKey ? '✔ Gemini مفعّل (مع محرك محلي احتياطي)' : 'ℹ بدون GEMINI_API_KEY: المحادثة تعمل بالمحرك المحلي');
    console.log(`ℹ الحساب التجريبي: ${config.demoId} / ${config.demoPassword}`);
  });
}
