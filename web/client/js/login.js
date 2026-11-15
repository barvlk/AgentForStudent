import { api, ApiError } from './api.js';
import { esc, $ } from './ui.js';
import { icon } from './icons.js';

const POINTS = [
  ['تحليل مستوى الإتقان', 'قياس إتقانك لكل مجال دراسي اعتماداً على سجلك الأكاديمي.'],
  ['التنبؤ بخطر التعثر', 'تقدير احتمال انخفاض الأداء في المقررات القادمة قبل وقوعه.'],
  ['تنظيم المهام والمواعيد', 'ترتيب الواجبات حسب الأهمية وقرب موعد التسليم.'],
  ['خطة مذاكرة أسبوعية', 'توزيع ساعات المذاكرة على المجالات بحسب احتياجك الفعلي.'],
];

export function renderLogin(root, { onLoggedIn, flash }) {
  root.innerHTML = `
  <main class="login">
    <section class="hero">
      <div>
        <div class="logo"><b>${icon('book')}</b><span>جامعة أم القرى<small>نظام المساعد الأكاديمي</small></span></div>
        <div style="margin-top:3rem">
          <h1>نظام المساعد الأكاديمي للطلاب</h1>
          <p class="lead">منصة تساعد الطالب على متابعة أدائه الدراسي، وتحديد مجالات التحسين، وتنظيم وقته ومهامه.</p>
          <ul class="points">${POINTS.map(([t, d], i) => `<li><span class="n">0${i + 1}</span><div><b>${t}</b><span class="d">${d}</span></div></li>`).join('')}</ul>
        </div>
      </div>
      <div class="foot">جميع البيانات المعروضة في هذه النسخة بيانات تجريبية.</div>
    </section>
    <section class="login-panel">
      <form class="card login-card fade-in" id="login-form" novalidate>
        <h2>تسجيل الدخول</h2>
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
