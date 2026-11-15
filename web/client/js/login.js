import { api, ApiError } from './api.js';
import { esc, $ } from './ui.js';

const FEATURES = [
  ['🧠', 'تتبع الإتقان', 'نموذج بايزي (BKT) يقيس إتقانك لكل مجال.'],
  ['⚠️', 'تنبؤ بالتعثر', 'غابة عشوائية تتوقع خطر ضعف درجتك القادمة.'],
  ['📅', 'ترتيب المهام', 'أولوية ذكية تجمع الأهمية وقرب الموعد.'],
  ['🤖', 'مساعد يفهمك', 'محادثة بأدوات حقيقية تجاوب على أي سؤال.'],
];

export function renderLogin(root, { onLoggedIn, flash }) {
  root.innerHTML = `
  <main class="login">
    <section class="hero fade-in">
      <div class="logo"><b>🎓</b><span>AgentForStudent</span></div>
      <h1>مساعدك الأكاديمي <span class="grad-text">الذكي</span><br>لجامعة أم القرى</h1>
      <p class="lead">يحلّل سجلك الأكاديمي، يتوقع خطر التعثر قبل ما يصير، يرتّب مهامك، ويبني لك خطة مذاكرة أسبوعية — وتسأله أي شي.</p>
      <div class="features">${FEATURES.map(([i, t, d]) => `<div class="feature"><span>${i}</span><h4>${t}</h4><p>${d}</p></div>`).join('')}</div>
    </section>
    <section class="login-panel">
      <form class="card login-card fade-in" id="login-form" novalidate>
        <h2>تسجيل الدخول</h2>
        <p class="muted" style="margin-bottom:1.2rem">ادخل برقمك الجامعي وكلمة المرور</p>
        ${flash ? `<div class="alert info">${esc(flash)}</div>` : ''}
        <div id="demo-box"></div>
        <div id="login-error"></div>
        <div class="field"><label for="sid">الرقم الجامعي</label>
          <input class="input" id="sid" inputmode="numeric" autocomplete="username" maxlength="12" placeholder="مثال: 441126225" required></div>
        <div class="field"><label for="pw">كلمة المرور</label>
          <input class="input" id="pw" type="password" autocomplete="current-password" maxlength="72" required></div>
        <button class="btn primary" style="width:100%" id="login-btn" type="submit">دخول</button>
      </form>
    </section>
  </main>`;

  const form = $('#login-form', root), err = $('#login-error', root);

  api.config().then((cfg) => {
    if (!cfg.demo) return;
    $('#demo-box', root).innerHTML = `<div class="alert info demo-box">🔓 <b>نسخة تجريبية</b> ببيانات وهمية<br>
      الرقم: <code>${esc(cfg.demo.id)}</code> · كلمة المرور: <code>${esc(cfg.demo.password)}</code>
      <br><button class="btn sm" type="button" id="fill-demo">تعبئة تلقائية</button></div>`;
    $('#fill-demo', root).onclick = () => { $('#sid', root).value = cfg.demo.id; $('#pw', root).value = cfg.demo.password; $('#login-btn', root).focus(); };
  }).catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.innerHTML = '';
    const sid = $('#sid', root).value.trim(), pw = $('#pw', root).value;
    if (!/^\d+$/.test(sid) || !pw) { err.innerHTML = '<div class="alert error">أدخل رقماً جامعياً صحيحاً وكلمة المرور.</div>'; return; }
    const btn = $('#login-btn', root);
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> جاري الدخول...';
    try {
      const r = await api.login(sid, pw);
      onLoggedIn(r);
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
      ${forced ? '<div class="alert info">كلمة مرورك الحالية مؤقتة. لازم تغيّرها قبل المتابعة.</div>' : ''}
      <div id="pw-error"></div>
      <div class="field"><label>كلمة المرور الحالية</label><input class="input" id="old" type="password" autocomplete="current-password" required></div>
      <div class="field"><label>كلمة المرور الجديدة <span class="muted">(8 خانات على الأقل، حرف ورقم)</span></label><input class="input" id="new" type="password" autocomplete="new-password" required></div>
      <div class="field"><label>تأكيد كلمة المرور الجديدة</label><input class="input" id="confirm" type="password" autocomplete="new-password" required></div>
      <button class="btn primary" style="width:100%" type="submit">حفظ</button>
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
