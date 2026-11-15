// نقطة الدخول: الحالة العامة + التوجيه بين الصفحات.
import { api, ApiError, setUnauthorizedHandler } from './api.js';
import { esc, $, $$, toast } from './ui.js';
import { renderLogin, renderChangePassword } from './login.js';
import { renderDashboard } from './dashboard.js';
import { renderTasks } from './tasks.js';
import { renderChat, resetChat } from './chat.js';

const app = $('#app');
const state = { me: null, tab: 'chat', flash: null };

// الثيم: يُحفظ تفضيل المستخدم (ويُتجاهل إن تعذر التخزين)
try { document.documentElement.dataset.theme = localStorage.getItem('afs-theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch { /* ignore */ }
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('afs-theme', next); } catch { /* ignore */ }
}

setUnauthorizedHandler((msg) => { if (state.me) { state.me = null; resetChat(); state.flash = msg || 'انتهت الجلسة. سجّل دخولك مرة أخرى.'; boot(); } });

const TABS = [
  ['chat', '💬', 'المساعد الذكي'],
  ['dashboard', '📊', 'لوحة الأداء'],
  ['tasks', '📅', 'المهام'],
];
const TITLES = { chat: 'المساعد الذكي', dashboard: 'لوحة الأداء', tasks: 'مهامي' };

async function boot() {
  try {
    state.me = await api.me();
  } catch (e) {
    state.me = null;
    if (e instanceof ApiError && e.status === 0) { app.innerHTML = `<div class="empty"><span>🔌</span>${esc(e.message)}</div>`; return; }
  }
  if (!state.me) {
    const flash = state.flash; state.flash = null;
    return renderLogin(app, { flash, onLoggedIn: () => boot() });
  }
  if (state.me.must_change_password) return renderChangePassword(app, { forced: true, onDone: () => { state.flash = 'تم تغيير كلمة المرور. سجّل دخولك من جديد.'; boot(); } });
  renderShell();
}

function renderShell() {
  const { profile } = state.me;
  app.innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="logo"><b>🎓</b><span>AgentForStudent</span></div>
      <div class="profile"><div class="avatar">${esc(profile.first_name[0])}</div><div><h4>${esc(profile.name)}</h4><small>${esc(profile.level)}</small></div></div>
      <nav class="nav" aria-label="التنقل">${TABS.map(([k, i, l]) => `<button data-tab="${k}">${i}<span>${l}</span><span class="badge" id="badge-${k}" hidden></span></button>`).join('')}</nav>
      <div class="side-foot">
        <div class="status">
          <div><span class="dot ${state.me.ai ? '' : 'off'}"></span>${state.me.ai ? 'Gemini متصل' : 'المحرك المحلي'}</div>
          <div><span class="dot"></span>نموذج التنبؤ جاهز</div>
          <div>🔒 جلسة آمنة · كلمات مرور مشفّرة</div>
        </div>
        ${state.me.is_demo ? '' : '<button class="btn sm" id="chg-pw">🔑 تغيير كلمة المرور</button>'}
        <div style="display:flex;gap:.5rem"><button class="btn sm" id="theme" style="flex:1" aria-label="تبديل الثيم">🌓 الثيم</button><button class="btn sm danger" id="logout" style="flex:1">🚪 خروج</button></div>
      </div>
    </aside>
    <main class="main">
      <header class="topbar">
        <div><h1 id="title"></h1><p id="subtitle"></p></div>
        <div class="chip" title="المعدل التراكمي">📈 المعدل ${profile.gpa.toFixed(2)} / 4.00</div>
      </header>
      <section id="view"></section>
    </main>
    <nav class="mobile-nav" aria-label="التنقل">${TABS.map(([k, i, l]) => `<button data-tab="${k}"><span>${i}</span>${l}</button>`).join('')}
      <button id="m-menu"><span>⚙️</span>المزيد</button></nav>
  </div>`;

  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  $('#logout').onclick = logout;
  $('#theme').onclick = toggleTheme;
  $('#chg-pw')?.addEventListener('click', () => renderChangePassword(app, { forced: false, onDone: () => { state.flash = 'تم تغيير كلمة المرور. سجّل دخولك من جديد.'; boot(); }, onCancel: renderShell }));
  $('#m-menu').onclick = () => { if (confirm('تسجيل الخروج؟')) logout(); };
  go(state.tab);
  updateBadge();
}

async function updateBadge() {
  try {
    const { tasks } = await api.tasks();
    const urgent = tasks.filter((t) => t.overdue || (t.days_left != null && t.days_left <= 2)).length;
    $$('#badge-tasks').forEach((b) => { b.hidden = !urgent; b.textContent = urgent; });
    if (!state.notified) {
      state.notified = true;
      tasks.filter((t) => t.overdue || (t.days_left != null && t.days_left <= 2)).slice(0, 3)
        .forEach((t) => toast(`🚨 ${t.task.title} — ${t.task.course} (${t.due_label})`, 'warn'));
    }
  } catch { /* ignore */ }
}

async function go(tab) {
  state.tab = tab;
  $$('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#title').textContent = TITLES[tab];
  const { profile } = state.me;
  $('#subtitle').textContent = tab === 'chat' ? `أهلاً ${profile.first_name}، اسألني أي شي` : tab === 'dashboard' ? 'تحليل أدائك الأكاديمي بالذكاء الاصطناعي' : 'مرتبة حسب الأولوية الذكية';
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
