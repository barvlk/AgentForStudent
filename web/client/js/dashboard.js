import { api } from './api.js';
import { esc, $, pct, goodColor, riskColor, scoreColor, animateBars, toast } from './ui.js';
import { ring, sparkline, lineChart, hBars, radar, donut } from './charts.js';

const DOMAIN_COLOR = { AI: '#8b6cff', Math: '#fbbf24', Programming: '#22d3ee', Systems: '#34d399' };
const FEATURE_LABELS = {
  prev_avg_score: 'متوسط الدرجات السابق', prev_gpa: 'المعدل السابق', domain_prior_avg: 'متوسطك في نفس المجال',
  domain_prior_count: 'عدد مقررات المجال', prev_fail_count: 'مرات الرسوب', credits: 'ساعات المقرر', term_no: 'رقم الترم',
};

const statCard = (icon, label, value, color) =>
  `<div class="card stat" style="--c:${color}"><div class="ico">${icon}</div><div><small>${label}</small><strong>${value}</strong></div></div>`;

const meter = (label, v, color) =>
  `<div class="meter"><div class="row"><span>${label}</span><b style="color:${color}">${pct(v)}</b></div><div class="bar"><i data-w="${pct(v)}" style="background:${color}"></i></div></div>`;

export async function renderDashboard(root) {
  root.innerHTML = '<div class="empty"><span class="spinner" style="width:34px;height:34px;display:inline-block"></span></div>';
  const d = await api.dashboard();
  const p = d.profile;
  const withRisk = d.mastery.filter((m) => m.risk != null);
  const weakest = [...d.mastery].sort((a, b) => a.probability - b.probability)[0];

  root.innerHTML = `
  <div class="fade-in">
    <div class="grid stats">
      <div class="card stat" style="--c:var(--good)"><div>${ring(p.gpa / 4, { size: 64, stroke: 7, color: 'var(--good)', text: p.gpa.toFixed(2) })}</div><div><small>المعدل التراكمي</small><strong>من 4.00</strong></div></div>
      ${statCard('⏱️', 'الساعات المجتازة', p.earned_hours, 'var(--accent)')}
      ${statCard('📚', 'عدد المقررات', p.courses_count, 'var(--warn)')}
      ${statCard(p.failed_courses.length ? '⚠️' : '✅', 'مقررات راسبة', p.failed_courses.length, p.failed_courses.length ? 'var(--bad)' : 'var(--good)')}
    </div>

    <div class="grid two" style="margin-bottom:1rem">
      <div class="card">
        <h3>🕸️ نظرة عامة على المجالات</h3>
        <p class="sub">كل ما كان الإتقان أوسع والخطر أضيق، فوضعك أفضل.</p>
        ${radar(d.mastery.map((m) => m.label_ar.split(' ')[0]), [
    { values: d.mastery.map((m) => m.probability), color: '#34d399' },
    { values: d.mastery.map((m) => m.risk ?? 0), color: '#fb7185' },
  ])}
        <div class="legend"><span><i style="background:#34d399"></i>الإتقان (BKT)</span><span><i style="background:#fb7185"></i>خطر التعثر (Random Forest)</span></div>
        ${weakest ? `<div class="alert info" style="margin:1rem 0 0">🎯 أولى مجال يحتاج تركيزك: <b>${esc(weakest.label_ar)}</b> (إتقان ${pct(weakest.probability)})</div>` : ''}
      </div>
      <div class="card">
        <h3>📈 متوسط الدرجات لكل ترم</h3>
        <p class="sub">تطور أدائك الأكاديمي عبر الفصول.</p>
        ${lineChart(d.terms.map((t) => ({ value: t.avg, label: `ترم ${t.term}` })))}
      </div>
    </div>

    <h3 style="margin:1.4rem 0 .7rem">🧠 الإتقان وخطر التعثر لكل مجال</h3>
    <div class="grid mastery" id="mastery">
      ${d.mastery.map((m) => `
        <div class="card domain">
          <h4><span>${esc(m.label_ar)}</span><span class="chip ${m.probability >= 0.8 ? 'good' : m.probability >= 0.5 ? 'warn' : 'bad'}">${esc(m.label)}</span></h4>
          ${meter('الإتقان', m.probability, goodColor(m.probability))}
          ${m.risk != null ? meter('خطر التعثر', m.risk, riskColor(m.risk)) : ''}
          ${sparkline(m.history, DOMAIN_COLOR[m.domain])}
          <small class="muted">تطور الإتقان عبر ${m.observations} مقررات</small>
        </div>`).join('')}
    </div>

    <div class="grid two" style="margin-top:1rem">
      <div class="card">
        <h3>📊 الدرجات حسب المقرر</h3>
        <p class="sub">اللون يعكس مستوى الدرجة.</p>
        <div class="scroll-x">${hBars(d.transcript.filter((r) => r.score != null && r.credits > 0).map((r) => ({ label: r.course_name, value: r.score })), { color: scoreColor })}</div>
      </div>
      <div class="card" id="plan-card"></div>
    </div>

    ${d.model ? `
    <details class="card" style="margin-top:1rem">
      <summary>🔬 كيف يعمل نموذج التنبؤ؟ (تقييم حقيقي على بيانات لم يرها النموذج)</summary>
      <div class="metrics">
        <div class="metric"><strong>${d.model.metrics.roc_auc}</strong><small>ROC-AUC</small></div>
        <div class="metric"><strong>${d.model.metrics.f1}</strong><small>F1</small></div>
        <div class="metric"><strong>${d.model.metrics.precision}</strong><small>Precision</small></div>
        <div class="metric"><strong>${d.model.metrics.recall}</strong><small>Recall</small></div>
      </div>
      <p class="sub">أهمية الخصائص (ما الذي يعتمد عليه النموذج؟)</p>
      ${Object.entries(d.model.importance).map(([k, v]) => meter(FEATURE_LABELS[k] ?? k, v, 'var(--primary)')).join('')}
    </details>` : ''}

    <details class="card" style="margin-top:1rem">
      <summary>📄 السجل الأكاديمي الكامل</summary>
      <div class="scroll-x"><table class="tbl">
        <thead><tr><th>الترم</th><th>الرمز</th><th>المقرر</th><th>الساعات</th><th>الدرجة</th><th>التقدير</th></tr></thead>
        <tbody>${d.transcript.map((r) => `<tr><td>${r.term_no}</td><td dir="ltr" style="text-align:right">${esc(r.course_code)}</td><td>${esc(r.course_name)}</td><td>${r.credits}</td><td style="color:${scoreColor(r.score)};font-weight:700">${r.score ?? '—'}</td><td>${esc(r.letter)}</td></tr>`).join('')}</tbody>
      </table></div>
    </details>
  </div>`;

  animateBars(root);
  await renderPlan($('#plan-card', root), 10);
  void withRisk;
}

async function renderPlan(card, hours) {
  const draw = async (h) => {
    const plan = await api.plan(h);
    const colors = { AI: '#8b6cff', Math: '#fbbf24', Programming: '#22d3ee', Systems: '#34d399' };
    card.innerHTML = `
      <h3>🗓️ خطة المذاكرة لهالأسبوع</h3>
      <p class="sub">توزيع ساعاتك حسب الاحتياج = 0.6 × خطر التعثر + 0.4 × فجوة الإتقان.</p>
      <div class="slider-row"><label for="hrs">ساعات المذاكرة</label><input type="range" id="hrs" min="2" max="40" value="${h}"><span class="hours-pill" id="hrs-val">${h} ساعة</span></div>
      <div class="plan">
        <div>${donut(plan.focus.map((f) => ({ label: f.label, value: f.hours, color: colors[f.domain] })), { center: `${h}س` })}</div>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>المجال</th><th>الساعات</th><th>الإتقان</th><th>الخطر</th></tr></thead><tbody>
          ${plan.focus.map((f) => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${colors[f.domain]};margin-inline-end:.4rem"></i>${esc(f.label)}</td><td><b>${f.hours}</b></td><td>${pct(f.mastery)}</td><td style="color:${riskColor(f.risk)}">${pct(f.risk)}</td></tr>`).join('')}
        </tbody></table></div>
      </div>
      ${plan.top_tasks.length ? `<p class="sub" style="margin-top:1rem">📌 أهم مهامك القادمة</p>${plan.top_tasks.map((s) => `<div class="chip" style="margin:.15rem">${esc(s.task.title)} · ${esc(s.due_label)}</div>`).join('')}` : ''}
      <details style="margin-top:1rem"><summary class="muted" style="cursor:pointer">كيف فكّر الوكيل؟ (ReAct trace)</summary><pre class="trace">${esc(plan.trace.join('\n'))}</pre></details>`;
    const slider = card.querySelector('#hrs');
    slider.oninput = () => { card.querySelector('#hrs-val').textContent = `${slider.value} ساعة`; };
    slider.onchange = () => draw(Number(slider.value)).catch((e) => toast(e.message, 'error'));
  };
  await draw(hours);
}
