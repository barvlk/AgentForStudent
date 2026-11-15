// منطق حساب المعدل (نقي بدون واجهة) — يستخدمه المتصفح والخادم والاختبارات من نفس الملف.
//
// المعدل = مجموع (نقاط التقدير × ساعات المقرر) ÷ مجموع الساعات.
//  - سلم 4.00: يطابق جدول جامعة أم القرى (A+ عند 95–100 = 4.00 ... D عند 60–64 = 1.00، والأقل من 60 = 0).
//  - سلم 5.00: الجدول الشائع في الجامعات السعودية (مثل جامعة الإمام): A+ = 5.00 ... D = 2.00، و F = 1.00.
// تنبيه: حدود النسب والنقاط قد تختلف قليلاً بين الجامعات؛ يُرجع للائحة جامعتك للاعتماد الرسمي.

const NAMES = ['ممتاز مرتفع', 'ممتاز', 'جيد جداً مرتفع', 'جيد جداً', 'جيد مرتفع', 'جيد', 'مقبول مرتفع', 'مقبول', 'راسب'];
const LETTERS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'];
const MIN_SCORE = [95, 90, 85, 80, 75, 70, 65, 60, 0];
const POINTS = {
  4: [4.0, 3.75, 3.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0],
  5: [5.0, 4.75, 4.5, 4.0, 3.5, 3.0, 2.5, 2.0, 1.0],
};

export const SCALES = Object.fromEntries([4, 5].map((s) => [s, {
  max: s,
  fail: POINTS[s][8],
  grades: LETTERS.map((letter, i) => ({ letter, label: NAMES[i], min: MIN_SCORE[i], points: POINTS[s][i] })),
}]));

export const LETTER_LIST = LETTERS;

const scaleOf = (scale) => {
  const s = SCALES[Number(scale)];
  if (!s) throw new RangeError('سلم غير مدعوم: اختر 4 أو 5.');
  return s;
};

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function gradePoints(letter, scale = 4) {
  const g = scaleOf(scale).grades.find((x) => x.letter === String(letter).toUpperCase().trim());
  if (!g) throw new RangeError(`تقدير غير معروف: ${letter}`);
  return g.points;
}

// من الدرجة المئوية إلى التقدير
export function gradeFromScore(score, scale = 4) {
  const n = Number(score);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new RangeError('الدرجة يجب أن تكون بين 0 و100.');
  return scaleOf(scale).grades.find((g) => n >= g.min);
}

function checkHours(h) {
  const n = Number(h);
  if (!Number.isFinite(n) || n <= 0 || n > 12) throw new RangeError('ساعات المقرر يجب أن تكون بين 1 و12.');
  return n;
}

// معدل الفصل: courses = [{ hours, letter }]
export function semesterGpa(courses, scale = 4) {
  let points = 0, hours = 0;
  for (const c of courses) {
    const h = checkHours(c.hours);
    points += gradePoints(c.letter, scale) * h;
    hours += h;
  }
  return { gpa: hours ? round2(points / hours) : 0, raw: hours ? points / hours : 0, hours, points: round2(points) };
}

function checkPrev(gpa, hours, scale) {
  const g = Number(gpa), h = Number(hours);
  if (!Number.isFinite(g) || g < 0 || g > scaleOf(scale).max) throw new RangeError(`المعدل الحالي يجب أن يكون بين 0 و${scale}.`);
  if (!Number.isFinite(h) || h < 0 || h > 400) throw new RangeError('الساعات المنجزة غير صالحة.');
  return [g, h];
}

// المعدل التراكمي الجديد بعد إضافة فصل (أو مقررات)
export function cumulative(prevGpa, prevHours, courses, scale = 4) {
  const [g, h] = checkPrev(prevGpa, prevHours, scale);
  const sem = semesterGpa(courses, scale);
  const totalHours = h + sem.hours;
  const gpa = totalHours ? (g * h + sem.raw * sem.hours) / totalHours : 0;
  return { gpa: round2(gpa), hours: totalHours, delta: round2(gpa - g), semester: sem };
}

// ماذا لو: مقرر واحد بعدد ساعات معيّن، وكل تقدير ممكن
export function whatIf(prevGpa, prevHours, hours, scale = 4) {
  return scaleOf(scale).grades.map((g) => ({
    letter: g.letter, label: g.label, points: g.points,
    ...(({ gpa, delta }) => ({ gpa, delta }))(cumulative(prevGpa, prevHours, [{ hours, letter: g.letter }], scale)),
  }));
}

// المعدل المطلوب في الساعات القادمة للوصول لمعدل مستهدف
export function requiredAverage(currentGpa, currentHours, targetGpa, nextHours, scale = 4) {
  const [g, h] = checkPrev(currentGpa, currentHours, scale);
  const t = Number(targetGpa), n = Number(nextHours);
  if (!Number.isFinite(n) || n <= 0 || n > 60) throw new RangeError('الساعات القادمة يجب أن تكون بين 1 و60.');
  const s = scaleOf(scale);
  if (!Number.isFinite(t) || t < 0 || t > s.max) throw new RangeError(`المعدل المستهدف يجب أن يكون بين 0 و${scale}.`);
  const needed = (t * (h + n) - g * h) / n;
  const best = needed <= s.max;
  const grade = s.grades.slice().reverse().find((x) => x.points >= needed - 1e-9);
  return {
    needed: round2(Math.max(needed, 0)),
    feasible: best,
    maxPossible: round2((g * h + s.max * n) / (h + n)),
    minGrade: best ? (grade ?? s.grades[0]) : null,
  };
}
