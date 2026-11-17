import { api, ApiError } from './api.js';
import { esc, $ } from './ui.js';
import { icon } from './icons.js';
import { heroArt } from './hero-art.js';

// مزايا مختصرة تظهر كشارات تحت الرسمة: [أيقونة، نص]
// النص قصير عن قصد: الرسمة هي اللي تشرح الفكرة، والشارات بس تأكدها.
const FEATURES = [
  ['chart', 'تحليل مستوى الإتقان'],
  ['alert', 'التنبؤ بخطر التعثر'],
  ['list', 'ترتيب المهام بالأولوية'],
  ['calendar', 'خطة مذاكرة أسبوعية'],
];

export function renderLogin(root, { onLoggedIn, flash }) {
  root.innerHTML = `
  <main class="login">
    <section class="hero">
      <div class="logo"><b>${icon('book')}</b><span>جامعة أم القرى<small>نظام المساعد الأكاديمي</small></span></div>
      <div class="hero-copy">
        <span class="eyebrow">مساعد أكاديمي ذكي</span>
        <h1>من زحمة الواجبات<br><span class="grad-text">إلى خطة واضحة</span></h1>
        <p class="lead">يرتّب مهامك حسب الأولوية وقرب التسليم، ويكشف المقررات المعرّضة للتعثر مبكراً، ويبني لك خطة مذاكرة أسبوعية تناسبك.</p>
      </div>
      <div class="hero-art">${heroArt()}</div>
      <ul class="features">${FEATURES.map(([ic, t]) => `<li><span class="fi">${icon(ic)}</span>${t}</li>`).join('')}</ul>
      <div class="foot">جميع البيانات المعروضة في هذه النسخة بيانات تجريبية.</div>
    </section>
    <section class="login-panel">
      <form class="card login-card fade-in" id="login-form" novalidate>
        <h2>تسجيل الدخول</h2>
        <p class="hello">أهلاً بك، ادخل برقمك الجامعي للمتابعة.</p>
        <div class="rule"></div>
        ${flash ? `<div class="alert info">${esc(flash)}</div>` : ''}
        <div id="demo-box"></div>
        <div id="login-error"></div>
        <div class="field"><label for="sid">الرقم الجامعي</label>
          <input class="input" id="sid" inputmode="numeric" autocomplete="username" maxlength="12" required></div>
        <div class="field"><label for="pw">كلمة المرور</label>
          <input class="input" id="pw" type="password" autocomplete="current-password" maxlength="72" required></div>
        <button class="btn primary" style="width:100%;padding:.7rem" id="login-btn" type="submit">دخول</button>
      </form>
    </section>
  </main>`;

  const err = $('#login-error', root);

  api.config().then((cfg) => {
    if (!cfg.demo) return;
    $('#demo-box', root).innerHTML = `<div class="alert info demo-box"><b>نسخة تجريبية</b> ببيانات افتراضية<br>
      الرقم الجامعي: <code>${esc(cfg.demo.id)}</code> &nbsp; كلمة المرور: <code>${esc(cfg.demo.password)}</code>
      <br><button class="btn sm" type="button" id="fill-demo">تعبئة بيانات الحساب التجريبي</button></div>`;
    $('#fill-demo', root).onclick = () => { $('#sid', root).value = cfg.demo.id; $('#pw', root).value = cfg.demo.password; $('#login-btn', root).focus(); };
  }).catch(() => {});

  $('#login-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    err.innerHTML = '';
    const sid = $('#sid', root).value.trim(), pw = $('#pw', root).value;
    if (!/^\d+$/.test(sid) || !pw) { err.innerHTML = '<div class="alert error">الرجاء إدخال رقم جامعي صحيح وكلمة المرور.</div>'; return; }
    const btn = $('#login-btn', root);
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> جارٍ التحقق...';
    try {
      onLoggedIn(await api.login(sid, pw));
    } catch (ex) {
      err.innerHTML = `<div class="alert error">${esc(ex instanceof ApiError ? ex.message : 'حدث خطأ.')}</div>`;
      btn.disabled = false; btn.textContent = 'دخول';
    }
  });
}

export function renderChangePassword(root, { forced, onDone, onCancel }) {
  root.innerHTML = `
  <main class="login-panel" style="min-height:100vh">
    <form class="card login-card fade-in" id="pw-form">
      <h2>تغيير كلمة المرور</h2>
      <div class="rule"></div>
      ${forced ? '<div class="alert info">كلمة المرور الحالية مؤقتة، ويلزم تغييرها قبل المتابعة.</div>' : ''}
      <div id="pw-error"></div>
      <div class="field"><label>كلمة المرور الحالية</label><input class="input" id="old" type="password" autocomplete="current-password" required></div>
      <div class="field"><label>كلمة المرور الجديدة <span class="muted">(8 خانات على الأقل، تحتوي حرفاً ورقماً)</span></label><input class="input" id="new" type="password" autocomplete="new-password" required></div>
      <div class="field"><label>تأكيد كلمة المرور الجديدة</label><input class="input" id="confirm" type="password" autocomplete="new-password" required></div>
      <button class="btn primary" style="width:100%;padding:.7rem" type="submit">حفظ</button>
      ${forced ? '' : '<button class="btn ghost" style="width:100%;margin-top:.6rem" type="button" id="cancel">رجوع</button>'}
    </form>
  </main>`;
  $('#cancel', root)?.addEventListener('click', onCancel);
  $('#pw-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#pw-error', root);
    if ($('#new', root).value !== $('#confirm', root).value) { err.innerHTML = '<div class="alert error">كلمتا المرور غير متطابقتين.</div>'; return; }
    try { await api.changePassword($('#old', root).value, $('#new', root).value); onDone(); }
    catch (ex) { err.innerHTML = `<div class="alert error">${esc(ex.message)}</div>`; }
  });
}
