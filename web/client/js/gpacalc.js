// صفحة حاسبة المعدل: فصلي وتراكمي، سلم 4 أو 5، وجدول "ماذا لو" والمعدل المطلوب.
import { esc, $, $$, toast } from './ui.js';
import { api } from './api.js';
import { icon } from './icons.js';
import { SCALES, LETTER_LIST, semesterGpa, cumulative, whatIf, requiredAverage } from './gpa.js';

const fmt = (n) => Number(n).toFixed(2);
const signed = (n) => (n > 0 ? `+${fmt(n)}` : fmt(n));

const state = { scale: 4, rows: null, prev: { 4: null, 5: '' }, prevHours: null, whatHours: 4, target: '', nextHours: 15 };

const newRow = (hours = 3, letter = 'A') => ({ name: '', hours, letter });

export function renderGpaCalc(root, { profile }) {
  if (!state.rows) {
    state.rows = [newRow(3, 'A+'), newRow(3, 'A'), newRow(3, 'B+'), newRow(4, 'B')];
    state.prev[4] = profile.gpa.toFixed(2);
    state.prevHours = String(profile.earned_hours);
  }

  root.innerHTML = `
  <div class="fade-in gpa">
    <div class="card" style="margin-bottom:1rem">
      <div class="gpa-head">
        <div><h3>سلم التقدير</h3><p class="sub" style="margin:0">اختر السلم المعتمد في جامعتك. سلم 4.00 يطابق جدول جامعة أم القرى، وسلم 5.00 شائع في جامعات سعودية أخرى.</p></div>
        <div class="seg" id="scale-seg" role="group" aria-label="سلم التقدير">
          <button data-scale="4">من 4.00</button><button data-scale="5">من 5.00</button>
        </div>
      </div>
    </div>

    <div class="grid two gpa-grid">
      <div class="card">
        <h3>معدل الفصل الدراسي</h3>
        <p class="sub">أدخل مقررات الفصل، وسيُحسب المعدل مرجَّحاً بساعات كل مقرر.</p>
        <div id="rows"></div>
        <button class="btn sm" id="add-row" type="button">${icon('plus')} إضافة مقرر</button>
        <div class="result" id="sem-result"></div>
      </div>

      <div class="card">
        <h3>المعدل التراكمي</h3>
        <p class="sub">أدخل معدلك وساعاتك المنجزة قبل هذا الفصل، لنحسب المعدل بعد إضافة الفصل.</p>
        <div class="two-f">
          <div class="field"><label for="prev-gpa">المعدل التراكمي الحالي</label><input class="input" id="prev-gpa" inputmode="decimal" placeholder="مثال: 3.50"></div>
          <div class="field"><label for="prev-hours">الساعات المنجزة</label><input class="input" id="prev-hours" inputmode="numeric" placeholder="مثال: 60"></div>
        </div>
        <p class="muted" id="prefill-note" style="font-size:.82rem;margin:-.4rem 0 .8rem"></p>
        <div class="result" id="cum-result"></div>
      </div>
    </div>

    <div class="grid two gpa-grid" style="margin-top:1rem">
      <div class="card">
        <h3>ماذا لو؟ أثر مقرر واحد</h3>
        <p class="sub">يعرض معدلك التراكمي الجديد لو حصلت على كل تقدير ممكن في مقرر بعدد ساعات معيّن (يعتمد على المعدل والساعات المدخلة في البطاقة المجاورة).</p>
        <div class="field" style="max-width:220px"><label for="what-hours">ساعات المقرر</label>
          <select class="input" id="what-hours">${[1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}">${h} ساعات</option>`).join('')}</select></div>
        <div class="scroll-x" id="what-result"></div>
      </div>

      <div class="card">
        <h3>المعدل المطلوب لبلوغ هدف</h3>
        <p class="sub">كم يجب أن يكون متوسطك في الساعات القادمة لتصل إلى المعدل التراكمي المستهدف؟</p>
        <div class="two-f">
          <div class="field"><label for="target">المعدل المستهدف</label><input class="input" id="target" inputmode="decimal" placeholder="مثال: 3.75"></div>
          <div class="field"><label for="next-hours">الساعات القادمة</label><input class="input" id="next-hours" inputmode="numeric" value="15"></div>
        </div>
        <div class="result" id="target-result"></div>
      </div>
    </div>

    <div class="card" style="margin-top:1rem">
      <h3>السيناريوهات المحفوظة</h3>
      <p class="sub">احفظ المقررات والمعدل المدخلين الآن باسم تختاره، وارجع لها لاحقاً لمقارنة الخيارات (حتى 20 سيناريو).</p>
      <div class="save-row">
        <input class="input" id="sc-name" maxlength="60" placeholder="اسم السيناريو، مثال: لو رفعت الخوارزميات" aria-label="اسم السيناريو">
        <button class="btn primary sm" id="sc-save" type="button">حفظ السيناريو</button>
      </div>
      <div id="sc-list" class="sc-list"></div>
    </div>

    <details class="card" style="margin-top:1rem">
      <summary>جدول التقديرات المعتمد في الحاسبة</summary>
      <div class="scroll-x" id="ref-table"></div>
      <p class="muted" style="font-size:.82rem;margin-top:.8rem">الجدول مبني على اللوائح المنشورة (جامعة أم القرى لسلم 4.00، وجداول جامعات سعودية أخرى لسلم 5.00). قد تختلف حدود النسب والنقاط قليلاً بين الجامعات، فارجع للائحة جامعتك للاعتماد الرسمي.</p>
    </details>
  </div>`;

  const rowsBox = $('#rows', root);

  const drawRows = () => {
    rowsBox.innerHTML = state.rows.map((r, i) => `
      <div class="crow" data-i="${i}">
        <input class="input" data-f="name" placeholder="اسم المقرر (اختياري)" maxlength="60" value="${esc(r.name)}" aria-label="اسم المقرر">
        <select class="input" data-f="hours" aria-label="الساعات">${[1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}" ${h === Number(r.hours) ? 'selected' : ''}>${h} ساعات</option>`).join('')}</select>
        <select class="input" data-f="letter" dir="ltr" aria-label="التقدير">${LETTER_LIST.map((l) => `<option ${l === r.letter ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm icon danger" data-del type="button" title="حذف المقرر" aria-label="حذف المقرر">${icon('trash')}</button>
      </div>`).join('') || '<p class="muted">أضف مقرراً للبدء.</p>';
  };

  const box = (label, value, sub = '') => `<div class="rbox"><small>${label}</small><strong>${value}</strong>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const err = (m) => `<div class="alert error" style="margin:0">${esc(m)}</div>`;

  const drawRef = () => {
    const s = SCALES[state.scale];
    $('#ref-table', root).innerHTML = `<table class="tbl"><thead><tr><th>التقدير</th><th>الوصف</th><th>النسبة المئوية</th><th>النقاط من ${state.scale}.00</th></tr></thead><tbody>
      ${s.grades.map((g, i) => `<tr><td><b dir="ltr">${g.letter}</b></td><td>${g.label}</td><td dir="ltr" style="text-align:right">${i === 0 ? '95 – 100' : i === s.grades.length - 1 ? 'أقل من 60' : `${g.min} – ${(s.grades[i - 1].min - 0.01).toFixed(2)}`}</td><td><b>${fmt(g.points)}</b></td></tr>`).join('')}
    </tbody></table>`;
  };

  const update = () => {
    const sc = state.scale;
    $$('#scale-seg button', root).forEach((b) => b.classList.toggle('active', Number(b.dataset.scale) === sc));

    // معدل الفصل
    let sem = null;
    try {
      sem = semesterGpa(state.rows, sc);
      $('#sem-result', root).innerHTML = state.rows.length
        ? `<div class="rgrid">${box('معدل الفصل', fmt(sem.gpa), `من ${sc}.00`)}${box('ساعات الفصل', sem.hours)}${box('مجموع النقاط', fmt(sem.points))}</div>`
        : '';
    } catch (e) { $('#sem-result', root).innerHTML = err(e.message); }

    // التراكمي
    const gpaStr = state.prev[sc] ?? '', hrsStr = state.prevHours ?? '';
    const pg = parseFloat(gpaStr), ph = parseFloat(hrsStr);
    const hasPrev = gpaStr !== '' && hrsStr !== '';
    let cum = null;
    try {
      if (!hasPrev) $('#cum-result', root).innerHTML = '<p class="muted" style="margin:0">أدخل المعدل الحالي والساعات المنجزة لعرض النتيجة.</p>';
      else {
        cum = cumulative(pg, ph, state.rows, sc);
        $('#cum-result', root).innerHTML = `<div class="rgrid">${box('المعدل التراكمي الجديد', fmt(cum.gpa), `من ${sc}.00`)}${box('التغيّر', `<span class="${cum.delta >= 0 ? 'up' : 'down'}" dir="ltr">${signed(cum.delta)}</span>`)}${box('إجمالي الساعات', cum.hours)}</div>`;
      }
    } catch (e) { $('#cum-result', root).innerHTML = err(e.message); }

    $('#prefill-note', root).textContent = sc === 4 && gpaStr === profile.gpa.toFixed(2) && hrsStr === String(profile.earned_hours)
      ? 'تمت تعبئة القيم من سجلك الأكاديمي، ويمكنك تعديلها.' : (sc === 5 ? 'أدخل معدلك من 5.00 كما يظهر في كشف درجاتك.' : '');

    // ماذا لو
    try {
      if (!hasPrev) $('#what-result', root).innerHTML = '<p class="muted">أدخل المعدل الحالي والساعات المنجزة أولاً.</p>';
      else {
        const rows = whatIf(pg, ph, state.whatHours, sc);
        $('#what-result', root).innerHTML = `<table class="tbl"><thead><tr><th>التقدير</th><th>الوصف</th><th>معدلك الجديد</th><th>التغيّر</th></tr></thead><tbody>
          ${rows.map((r) => `<tr><td><b dir="ltr">${r.letter}</b></td><td>${r.label}</td><td><b>${fmt(r.gpa)}</b></td><td dir="ltr" style="text-align:right" class="${r.delta >= 0 ? 'up' : 'down'}">${signed(r.delta)}</td></tr>`).join('')}</tbody></table>`;
      }
    } catch (e) { $('#what-result', root).innerHTML = err(e.message); }

    // الهدف
    try {
      if (!hasPrev || state.target === '') $('#target-result', root).innerHTML = '<p class="muted" style="margin:0">أدخل المعدل المستهدف (وتأكد من إدخال معدلك الحالي وساعاتك).</p>';
      else {
        const r = requiredAverage(pg, ph, parseFloat(state.target), parseFloat(state.nextHours), sc);
        $('#target-result', root).innerHTML = r.feasible
          ? `<div class="rgrid">${box('المتوسط المطلوب', fmt(r.needed), `من ${sc}.00`)}${box('أقل تقدير تقريباً', r.needed <= 0 ? 'أي تقدير' : `<span dir="ltr">${r.minGrade.letter}</span>`, r.needed <= 0 ? '' : r.minGrade.label)}</div>`
          : `<div class="alert error" style="margin:0">لا يمكن بلوغ هذا الهدف خلال ${state.nextHours} ساعة؛ أعلى معدل ممكن هو <b>${fmt(r.maxPossible)}</b> حتى لو حصلت على أعلى تقدير في كل المقررات.</div>`;
      }
    } catch (e) { $('#target-result', root).innerHTML = err(e.message); }
    void sem; void cum;
    drawRef();
  };

  // ---- الأحداث ----
  $('#scale-seg', root).addEventListener('click', (e) => {
    const b = e.target.closest('button[data-scale]');
    if (!b) return;
    state.scale = Number(b.dataset.scale);
    $('#prev-gpa', root).value = state.prev[state.scale] ?? '';
    update();
  });
  rowsBox.addEventListener('input', (e) => {
    const f = e.target.dataset.f, i = Number(e.target.closest('.crow')?.dataset.i);
    if (f && Number.isInteger(i)) { state.rows[i][f] = e.target.value; update(); }
  });
  rowsBox.addEventListener('click', (e) => {
    if (!e.target.closest('[data-del]')) return;
    state.rows.splice(Number(e.target.closest('.crow').dataset.i), 1);
    drawRows(); update();
  });
  $('#add-row', root).addEventListener('click', () => { if (state.rows.length < 12) { state.rows.push(newRow()); drawRows(); update(); } });
  $('#prev-gpa', root).addEventListener('input', (e) => { state.prev[state.scale] = e.target.value; update(); });
  $('#prev-hours', root).addEventListener('input', (e) => { state.prevHours = e.target.value; update(); });
  $('#what-hours', root).addEventListener('change', (e) => { state.whatHours = Number(e.target.value); update(); });
  $('#target', root).addEventListener('input', (e) => { state.target = e.target.value; update(); });
  $('#next-hours', root).addEventListener('input', (e) => { state.nextHours = e.target.value; update(); });

  // ---- السيناريوهات المحفوظة ----
  const drawScenarios = async () => {
    const box = $('#sc-list', root);
    try {
      const { scenarios } = await api.scenarios();
      box.innerHTML = scenarios.length ? scenarios.map((s) => `
        <div class="sc-item" data-id="${s.id}">
          <div class="sc-info"><b>${esc(s.name)}</b>
            <small>${s.courses.length} مقررات · سلم ${s.scale}.00 · النتيجة <b dir="ltr">${fmt(s.result_gpa)}</b></small></div>
          <div class="sc-actions">
            <button class="btn sm" data-load type="button">تحميل</button>
            <button class="btn sm icon danger" data-del-sc type="button" title="حذف" aria-label="حذف السيناريو">${icon('trash')}</button>
          </div>
        </div>`).join('') : '<p class="muted" style="margin:0">لا توجد سيناريوهات محفوظة بعد.</p>';
      box.__data = scenarios;
    } catch (e) { box.innerHTML = err(e.message); }
  };
  $('#sc-save', root).addEventListener('click', async () => {
    const sc = state.scale;
    try {
      await api.saveScenario({
        name: $('#sc-name', root).value, scale: sc, prev_gpa: parseFloat(state.prev[sc]), prev_hours: parseFloat(state.prevHours),
        courses: state.rows.map((r) => ({ name: r.name, hours: Number(r.hours), letter: r.letter })),
      });
      $('#sc-name', root).value = '';
      toast('تم حفظ السيناريو.', 'ok');
      drawScenarios();
    } catch (e) { toast(e.message, 'warn'); }
  });
  $('#sc-list', root).addEventListener('click', async (e) => {
    const item = e.target.closest('.sc-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    if (e.target.closest('[data-del-sc]')) {
      try { await api.deleteScenario(id); drawScenarios(); } catch (x) { toast(x.message, 'warn'); }
    } else if (e.target.closest('[data-load]')) {
      const s = $('#sc-list', root).__data?.find((x) => x.id === id);
      if (!s) return;
      state.scale = s.scale;
      state.prev[s.scale] = String(s.prev_gpa);
      state.prevHours = String(s.prev_hours);
      state.rows = s.courses.map((c) => ({ name: c.name, hours: c.hours, letter: c.letter }));
      $('#prev-gpa', root).value = state.prev[s.scale];
      $('#prev-hours', root).value = state.prevHours;
      drawRows(); update();
      toast('تم تحميل السيناريو.', 'ok');
    }
  });
  drawScenarios();

  $('#prev-gpa', root).value = state.prev[state.scale] ?? '';
  $('#prev-hours', root).value = state.prevHours ?? '';
  $('#what-hours', root).value = String(state.whatHours);
  $('#target', root).value = state.target;
  $('#next-hours', root).value = state.nextHours;
  drawRows();
  update();
}
