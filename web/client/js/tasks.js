import { api } from './api.js';
import { esc, $, $$, toast, PRIORITY_COLOR } from './ui.js';
import { ring } from './charts.js';

const scoreColor = (s) => (s >= 80 ? 'var(--bad)' : s >= 60 ? 'var(--warn)' : 'var(--good)');

export async function renderTasks(root, { onChange }) {
  const { tasks } = await api.tasks();
  const urgent = tasks.filter((t) => t.overdue || (t.days_left != null && t.days_left <= 2)).length;
  const today = new Date().toISOString().slice(0, 10);

  root.innerHTML = `
  <div class="fade-in">
    <div class="grid stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="card stat" style="--c:var(--primary)"><div class="ico">📋</div><div><small>مهام معلقة</small><strong>${tasks.length}</strong></div></div>
      <div class="card stat" style="--c:var(--bad)"><div class="ico">🔥</div><div><small>عاجلة</small><strong>${urgent}</strong></div></div>
      <div class="card stat" style="--c:var(--accent)"><div class="ico">⏳</div><div><small>ساعات العمل المتوقعة</small><strong>${tasks.reduce((a, t) => a + (t.task.est_hours || 0), 0)}</strong></div></div>
    </div>

    <details class="card" ${tasks.length ? '' : 'open'}>
      <summary>➕ إضافة مهمة جديدة</summary>
      <form class="task-form" id="task-form">
        <div class="field"><label>المادة</label><input class="input" name="course" maxlength="100" required placeholder="مثال: تعلم الآلة"></div>
        <div class="field"><label>المهمة</label><input class="input" name="title" maxlength="200" required placeholder="واجب، كويز، مشروع..."></div>
        <div class="three">
          <div class="field"><label>الأهمية</label><select class="input" name="priority"><option>عالية</option><option selected>متوسطة</option><option>عادية</option></select></div>
          <div class="field"><label>موعد التسليم</label><input class="input" type="date" name="due_date" min="2020-01-01" value=""></div>
          <div class="field"><label>الوقت المتوقع (ساعات)</label><input class="input" type="number" name="est_hours" min="0" max="200" step="0.5" placeholder="اختياري"></div>
        </div>
        <div class="full"><button class="btn primary" type="submit">إضافة المهمة</button></div>
      </form>
    </details>

    ${tasks.length ? `
    <p class="muted" style="margin-top:1rem;font-size:.85rem">الترتيب حسب درجة أولوية تجمع الأهمية وقرب الموعد، وعند التساوي المهمة الأقصر أولاً (SJF).</p>
    <div class="tasks">
      ${tasks.map((s, i) => `
      <div class="card task" data-id="${s.task.id}" style="--pc:${PRIORITY_COLOR[s.task.priority] ?? 'var(--muted)'}">
        <div class="rank">${i + 1}</div>
        <div class="body">
          <h4>${esc(s.task.title)}</h4>
          <div class="muted" style="font-size:.88rem">${esc(s.task.course)}</div>
          <div class="meta">
            <span class="chip ${s.overdue ? 'bad' : s.days_left != null && s.days_left <= 2 ? 'warn' : ''}">📅 ${esc(s.due_label)}</span>
            <span class="chip" style="color:${PRIORITY_COLOR[s.task.priority]}">● ${esc(s.task.priority)}</span>
            ${s.task.est_hours ? `<span class="chip">⏱️ ${s.task.est_hours} ساعة</span>` : ''}
          </div>
        </div>
        ${ring(s.score / 100, { color: scoreColor(s.score), text: Math.round(s.score), size: 54 })}
        <div class="acts">
          <button class="btn sm icon" data-act="done" title="تم الإنجاز" aria-label="تم الإنجاز">✅</button>
          <button class="btn sm icon danger" data-act="del" title="حذف" aria-label="حذف">🗑️</button>
        </div>
      </div>`).join('')}
    </div>` : '<div class="empty card" style="margin-top:1rem"><span>🎉</span><h3>ما عندك مهام معلقة</h3><p>أضف مهمة جديدة أو ارتح شوي!</p></div>'}
  </div>`;

  void today;
  $('#task-form', root).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    try { await api.addTask(f); toast('تمت إضافة المهمة ✅', 'good'); onChange(); }
    catch (ex) { toast(ex.message, 'error'); }
  });

  $$('.task', root).forEach((card) => {
    card.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const id = card.dataset.id;
      try {
        if (btn.dataset.act === 'del' && !confirm('حذف هذه المهمة؟')) return;
        await (btn.dataset.act === 'done' ? api.doneTask(id) : api.deleteTask(id));
        card.classList.add('leaving');
        if (btn.dataset.act === 'done') toast('أحسنت! أنجزت مهمة 🎉', 'good');
        setTimeout(onChange, 250);
      } catch (ex) { toast(ex.message, 'error'); }
    });
  });
}
