// نقطة الدخول: الحالة العامة + التوجيه بين الصفحات.
import { api, ApiError, setUnauthorizedHandler } from './api.js';
import { esc, $, $$, toast } from './ui.js';
import { icon } from './icons.js';
import { renderLogin, renderChangePassword } from './login.js';
import { renderDashboard } from './dashboard.js';
import { renderTasks } from './tasks.js';
import { renderChat, resetChat } from './chat.js';

const app = $('#app');
const initialTab = location.hash.slice(1);
const state = { me: null, tab: ['dashboard', 'tasks', 'chat'].includes(initialTab) ? initialTab : 'dashboard', flash: null, notified: false };

setUnauthorizedHandler((msg) => { if (state.me) { state.me = null; resetChat(); state.flash = msg || 'انتهت الجلسة. الرجاء تسجيل الدخول مرة أخرى.'; boot(); } });

const TABS = [
  ['dashboard', 'chart', 'لوحة الأداء'],
  ['tasks', 'calendar', 'المهام'],
  ['chat', 'chat', 'المساعد'],
];
const TITLES = { chat: 'المساعد الأكاديمي', dashboard: 'لوحة الأداء الأكاديمي', tasks: 'المهام والمواعيد' };
const SUBTITLES = {
  chat: 'اطرح سؤالك حول مهامك أو مستواك أو أي مفهوم دراسي',
  dashboard: 'تحليل الأداء الدراسي وتوقعات الفصل القادم',
  tasks: 'مرتبة حسب درجة الأولوية',
};

async function boot() {
  try {
    state.me = await api.me();
  } catch (e) {
    state.me = null;
    if (e instanceof ApiError && e.status === 0) { app.innerHTML = `<div class="empty"><span class="big">${icon('alert')}</span>${esc(e.message)}</div>`; return; }
  }
  if (!state.me) {
    const flash = state.flash; state.flash = null;
    return renderLogin(app, { flash, onLoggedIn: () => boot() });
  }
  if (state.me.must_change_password) return renderChangePassword(app, { forced: true, onDone: () => { state.flash = 'تم تغيير كلمة المرور. الرجاء تسجيل الدخول مجدداً.'; boot(); } });
  renderShell();
}

function renderShell() {
  const { profile } = state.me;
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="logo"><b>${icon('book')}</b><span>جامعة أم القرى<small>نظام المساعد الأكاديمي</small></span></div></div>
      <div class="profile"><div class="avatar">${esc(profile.first_name[0])}</div><div><h4>${esc(profile.name)}</h4><small>${esc(profile.level)}</small></div></div>
      <nav class="nav" aria-label="التنقل">${TABS.map(([k, i, l]) => `<button data-tab="${k}">${icon(i)}<span>${l}</span><span class="badge" id="badge-${k}" hidden></span></button>`).join('')}</nav>
      <div class="side-foot">
        <div class="status">
          <div><span class="dot ${state.me.ai ? '' : 'off'}"></span>${state.me.ai ? 'الذكاء الاصطناعي: متصل' : 'المساعد: الوضع المحلي'}</div>
          <div><span class="dot"></span>نموذج التنبؤ: جاهز</div>
        </div>
        ${state.me.is_demo ? '' : `<button class="btn sm" id="chg-pw">${icon('key')} تغيير كلمة المرور</button>`}
        <button class="btn sm" id="logout">${icon('logout')} تسجيل الخروج</button>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div><h1 id="title"></h1><p id="subtitle"></p></div>
        <div class="chip" title="المعدل التراكمي">المعدل التراكمي: <span dir="ltr">${profile.gpa.toFixed(2)} / 4.00</span></div>
      </header>
      <section id="view"></section>
    </main>
    <nav class="mobile-nav" aria-label="التنقل">${TABS.map(([k, i, l]) => `<button data-tab="${k}">${icon(i)}${l}</button>`).join('')}
      <button id="m-menu">${icon('logout')}خروج</button></nav>
  </div>`;

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  $('#logout').onclick = logout;
  $('#chg-pw')?.addEventListener('click', () => renderChangePassword(app, { forced: false, onDone: () => { state.flash = 'تم تغيير كلمة المرور. الرجاء تسجيل الدخول مجدداً.'; boot(); }, onCancel: renderShell }));
  $('#m-menu').onclick = () => { if (confirm('تسجيل الخروج؟')) logout(); };
  go(state.tab);
  updateBadge();
}

async function updateBadge() {
  try {
    const { tasks } = await api.tasks();
    const urgentList = tasks.filter((t) => t.overdue || (t.days_left != null && t.days_left <= 2));
    $$('#badge-tasks').forEach((b) => { b.hidden = !urgentList.length; b.textContent = urgentList.length; });
    if (!state.notified) {
      state.notified = true;
      urgentList.slice(0, 3).forEach((t) => toast(`تنبيه: ${t.task.title} — ${t.task.course} (${t.due_label})`, 'warn'));
    }
  } catch { /* ignore */ }
}

async function go(tab) {
  state.tab = tab;
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#title').textContent = TITLES[tab];
  $('#subtitle').textContent = SUBTITLES[tab];
  const { profile } = state.me;
  const view = $('#view');
  try {
    if (tab === 'chat') renderChat(view, { profile, ai: state.me.ai });
    else if (tab === 'dashboard') await renderDashboard(view);
    else await renderTasks(view, { onChange: async () => { await go('tasks'); updateBadge(); } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return;
    view.innerHTML = `<div class="alert error">${esc(e.message)}</div>`;
  }
}

async function logout() {
  await api.logout().catch(() => {});
  state.me = null; state.notified = false; resetChat();
  state.flash = 'تم تسجيل الخروج.';
  boot();
}

boot();
