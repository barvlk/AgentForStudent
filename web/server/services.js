// طبقة الخدمات: تجمع البيانات والتحليلات في مكان واحد (تستخدمها الـ API والوكيل معاً).
// كل البيانات تأتي من قاعدة SQL (جداول: students · courses · enrollments · tasks · users ...).
import { all, get, run, insert, tx, insertMany } from './db.js';
import { config } from './config.js';
import { createUser, ensureFixedPassword } from './auth.js';
import { generateStudents, demoStudentRows, DEMO_TASKS, PLAN, assignDomain } from './sample.js';
import { estimateAll } from './ml/bkt.js';
import { RiskModel } from './ml/risk.js';
import { schedule, PRIORITIES } from './ml/scheduler.js';
import { buildWeeklyPlan } from './ml/planner.js';
import { KnowledgeBase } from './ml/knowledge.js';
import { cumulative } from '../client/js/gpa.js';

export class ValidationError extends Error {}

export const knowledge = new KnowledgeBase();
export let riskModel = null;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// ---------------------------------------------------------------- تحميل البيانات (Seed)
// المقررات (من الخطة الدراسية) تُدخَل مرة واحدة، والطلاب والتسجيلات فوقها بمفاتيح أجنبية.
async function seedCourses(a) {
  const rows = PLAN.flat().map(([code, name, credits]) => [code, name, credits, assignDomain(code)]);
  await insertMany(a, 'courses', ['course_code', 'course_name', 'credits', 'domain'], rows);
}

async function insertRecords(rows) {
  const students = [...new Map(rows.map((r) => [r.student_id, [r.student_id, r.name, r.level]])).values()];
  const enrollments = rows.map((r) => [r.student_id, r.course_code, r.term_no, r.score, r.letter, r.points]);
  await tx(async (a) => {
    await seedCourses(a);
    await insertMany(a, 'students', ['student_id', 'name', 'level'], students);
    await insertMany(a, 'enrollments', ['student_id', 'course_code', 'term_no', 'score', 'letter', 'points'], enrollments);
  });
}

export async function addTask(studentId, { course, title, priority, due_date, est_hours }) {
  course = String(course ?? '').trim().slice(0, 100);
  title = String(title ?? '').trim().slice(0, 200);
  if (!course || !title) throw new ValidationError('اسم المادة والمهمة مطلوبان.');
  if (!PRIORITIES.includes(priority)) throw new ValidationError('أهمية غير صالحة.');
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) throw new ValidationError('صيغة التاريخ غير صحيحة.');
  const hours = est_hours === '' || est_hours == null ? null : Number(est_hours);
  if (hours != null && !(hours >= 0 && hours <= 200)) throw new ValidationError('الوقت المتوقع غير صالح.');
  return insert(
    'INSERT INTO tasks (student_id, course, title, priority, due_date, est_hours, created_at) VALUES (?,?,?,?,?,?,?)',
    [studentId, course, title, priority, due_date || null, hours || null, Date.now()],
  );
}

// التهيئة عند أول تشغيل: بيانات وهمية + حساب العرض، ثم تدريب نموذج التنبؤ
export async function bootstrap() {
  const seeded = (await get('SELECT COUNT(*) AS c FROM enrollments')).c > 0;
  if (!seeded) {
    await insertRecords(generateStudents(100, 7));
    const sample = await all('SELECT DISTINCT student_id FROM enrollments ORDER BY student_id LIMIT 20');
    const kinds = ['واجب', 'كويز قصير', 'اختبار منتصف الفصل', 'مشروع', 'تقرير معمل'];
    for (const [i, { student_id }] of sample.entries()) {
      const courses = await all('SELECT DISTINCT c.course_name FROM enrollments e JOIN courses c ON c.course_code = e.course_code WHERE e.student_id = ?', [student_id]);
      for (let k = 0; k < 2 + (i % 3); k++) {
        await addTask(student_id, {
          course: courses[(i + k) % courses.length].course_name, title: kinds[(i + k) % kinds.length],
          priority: PRIORITIES[(i + k) % 3], due_date: inDays(((i * 5 + k * 7) % 21) - 1), est_hours: [1, 2, 3, 5, 8][(i + k) % 5],
        });
      }
    }
  }
  if (!(await get('SELECT 1 AS x FROM students WHERE student_id = ?', [config.demoId]))) await insertRecords(demoStudentRows(config.demoId, config.demoName));
  if (!(await get('SELECT 1 AS x FROM users WHERE student_id = ?', [config.demoId]))) await createUser(config.demoId, config.demoPassword);
  await ensureFixedPassword(config.demoId, config.demoPassword);
  if (!(await get('SELECT 1 AS x FROM tasks WHERE student_id = ?', [config.demoId]))) {
    for (const [course, title, priority, days, hours] of DEMO_TASKS) await addTask(config.demoId, { course, title, priority, due_date: inDays(days), est_hours: hours });
  }
  // تدريب نموذج التنبؤ مرة واحدة عند الإقلاع
  riskModel = new RiskModel(config.atRiskThreshold).fit(await all('SELECT * FROM v_records'));
}

// ---------------------------------------------------------------- الاستعلامات
// المعدل والساعات محسوبان داخل القاعدة عبر العرض v_student_summary (SQL بدل JavaScript)
export async function profile(studentId) {
  const s = await get('SELECT * FROM v_student_summary WHERE student_id = ?', [studentId]);
  if (!s || !s.courses_count) return null;
  const failed = await all(
    `SELECT c.course_name FROM enrollments e JOIN courses c ON c.course_code = e.course_code
     WHERE e.student_id = ? AND e.points = 0 AND c.credits > 0 ORDER BY e.term_no`, [studentId]);
  return {
    student_id: studentId, name: s.name, first_name: s.name.split(' ')[0], level: s.level,
    gpa: Math.round(s.gpa * 100) / 100, earned_hours: s.earned_hours,
    courses_count: s.courses_count, failed_courses: failed.map((r) => r.course_name),
  };
}

export const transcript = (studentId) => all('SELECT * FROM v_records WHERE student_id = ? ORDER BY term_no, course_code', [studentId]);

export async function analytics(studentId) {
  const t = await transcript(studentId);
  return {
    mastery: estimateAll(t, config.domains, config.masteryThreshold),
    risk: riskModel ? riskModel.predictDomainRisk(t, config.domains) : {},
  };
}

export const listTasks = async (studentId, includeDone = false) =>
  (await all(`SELECT * FROM tasks WHERE student_id = ? ${includeDone ? '' : 'AND done = 0'} ORDER BY id`, [studentId]))
    .map((t) => ({ ...t, done: !!t.done }));
export const scheduledTasks = async (studentId) => schedule(await listTasks(studentId));

// كل استعلام مقيَّد بـ student_id → لا يستطيع طالب لمس مهام غيره (منع IDOR)
export const setTaskDone = async (studentId, id, done = true) =>
  (await run('UPDATE tasks SET done = ? WHERE id = ? AND student_id = ?', [done ? 1 : 0, id, studentId])).changes > 0;
export const deleteTask = async (studentId, id) =>
  (await run('DELETE FROM tasks WHERE id = ? AND student_id = ?', [id, studentId])).changes > 0;

export async function weeklyPlan(studentId, hours = 10) {
  const a = await analytics(studentId);
  return buildWeeklyPlan(a.mastery, a.risk, await scheduledTasks(studentId), hours);
}

// ---------------------------------------------------------------- سيناريوهات المعدل المحفوظة
// النتيجة تُعاد حسابها في الخادم (لا نثق بقيمة العميل)، وكل استعلام مقيَّد بـ student_id.
const MAX_SCENARIOS = 20;

export async function listScenarios(studentId) {
  return (await all('SELECT * FROM gpa_scenarios WHERE student_id = ? ORDER BY id DESC', [studentId]))
    .map((r) => ({ ...r, courses: JSON.parse(r.courses) }));
}

export async function saveScenario(studentId, { name, scale, prev_gpa, prev_hours, courses }) {
  name = String(name ?? '').trim().slice(0, 60);
  if (!name) throw new ValidationError('اكتب اسماً للسيناريو.');
  scale = Number(scale);
  if (![4, 5].includes(scale)) throw new ValidationError('سلم غير مدعوم.');
  if (!Array.isArray(courses) || !courses.length || courses.length > 12) throw new ValidationError('أضف من 1 إلى 12 مقرراً.');
  const clean = courses.map((c) => ({ name: String(c?.name ?? '').trim().slice(0, 60), hours: Number(c?.hours), letter: String(c?.letter ?? '') }));
  let result;
  try { result = cumulative(Number(prev_gpa), Number(prev_hours), clean, scale); } catch (e) { throw new ValidationError(e.message); }
  if ((await get('SELECT COUNT(*) AS c FROM gpa_scenarios WHERE student_id = ?', [studentId])).c >= MAX_SCENARIOS) {
    throw new ValidationError(`الحد الأقصى ${MAX_SCENARIOS} سيناريو؛ احذف أحدها أولاً.`);
  }
  return insert(
    'INSERT INTO gpa_scenarios (student_id, name, scale, prev_gpa, prev_hours, courses, result_gpa, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [studentId, name, scale, Number(prev_gpa), Number(prev_hours), JSON.stringify(clean), result.gpa, Date.now()],
  );
}

export const deleteScenario = async (studentId, id) =>
  (await run('DELETE FROM gpa_scenarios WHERE id = ? AND student_id = ?', [id, studentId])).changes > 0;
