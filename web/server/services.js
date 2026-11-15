// طبقة الخدمات: تجمع البيانات والتحليلات في مكان واحد (تستخدمها الـ API والوكيل معاً).
import { db, tx } from './db.js';
import { config } from './config.js';
import { createUser, ensureFixedPassword } from './auth.js';
import { generateStudents, demoStudentRows, DEMO_TASKS } from './sample.js';
import { estimateAll } from './ml/bkt.js';
import { RiskModel } from './ml/risk.js';
import { schedule, PRIORITIES } from './ml/scheduler.js';
import { buildWeeklyPlan } from './ml/planner.js';
import { KnowledgeBase } from './ml/knowledge.js';

export const knowledge = new KnowledgeBase();
export let riskModel = null;

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

function insertRecords(rows) {
  const st = db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  tx(() => rows.forEach((r) => st.run(r.student_id, r.name, r.level, r.term_no, r.course_code, r.course_name, r.credits, r.score, r.letter, r.points, r.domain)));
}

export function addTask(studentId, { course, title, priority, due_date, est_hours }) {
  course = String(course ?? '').trim().slice(0, 100);
  title = String(title ?? '').trim().slice(0, 200);
  if (!course || !title) throw new Error('اسم المادة والمهمة مطلوبان.');
  if (!PRIORITIES.includes(priority)) throw new Error('أهمية غير صالحة.');
  if (due_date && !/^\d{4}-\d{2}-\d{2}$/.test(due_date)) throw new Error('صيغة التاريخ غير صحيحة.');
  const hours = est_hours === '' || est_hours == null ? null : Number(est_hours);
  if (hours != null && !(hours >= 0 && hours <= 200)) throw new Error('الوقت المتوقع غير صالح.');
  return db.prepare('INSERT INTO tasks (student_id, course, title, priority, due_date, est_hours, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(studentId, course, title, priority, due_date || null, hours || null, Date.now()).lastInsertRowid;
}

// التهيئة عند أول تشغيل: بيانات وهمية + حساب العرض
export function bootstrap() {
  if (db.prepare('SELECT COUNT(*) c FROM records').get().c === 0) {
    insertRecords(generateStudents(100, 7));
    const sample = db.prepare('SELECT DISTINCT student_id FROM records LIMIT 20').all();
    const kinds = ['واجب', 'كويز قصير', 'اختبار منتصف الفصل', 'مشروع', 'تقرير معمل'];
    sample.forEach(({ student_id }, i) => {
      const courses = db.prepare('SELECT DISTINCT course_name FROM records WHERE student_id = ?').all(student_id);
      for (let k = 0; k < 2 + (i % 3); k++) {
        addTask(student_id, {
          course: courses[(i + k) % courses.length].course_name, title: kinds[(i + k) % kinds.length],
          priority: PRIORITIES[(i + k) % 3], due_date: inDays(((i * 5 + k * 7) % 21) - 1), est_hours: [1, 2, 3, 5, 8][(i + k) % 5],
        });
      }
    });
  }
  if (!db.prepare('SELECT 1 FROM records WHERE student_id = ?').get(config.demoId)) insertRecords(demoStudentRows(config.demoId, config.demoName));
  if (!db.prepare('SELECT 1 FROM users WHERE student_id = ?').get(config.demoId)) createUser(config.demoId, config.demoPassword);
  ensureFixedPassword(config.demoId, config.demoPassword);
  if (!db.prepare('SELECT 1 FROM tasks WHERE student_id = ?').get(config.demoId)) {
    for (const [course, title, priority, days, hours] of DEMO_TASKS) addTask(config.demoId, { course, title, priority, due_date: inDays(days), est_hours: hours });
  }
  // تدريب نموذج التنبؤ مرة واحدة عند الإقلاع
  riskModel = new RiskModel(config.atRiskThreshold).fit(db.prepare('SELECT * FROM records').all());
}

export function profile(studentId) {
  const rows = transcript(studentId);
  if (!rows.length) return null;
  const graded = rows.filter((r) => r.credits > 0 && r.score != null);
  const hours = graded.reduce((a, r) => a + r.credits, 0);
  const gpa = hours ? graded.reduce((a, r) => a + r.points * r.credits, 0) / hours : 0;
  return {
    student_id: studentId, name: rows[0].name, first_name: rows[0].name.split(' ')[0], level: rows[0].level,
    gpa: Math.round(gpa * 100) / 100, earned_hours: graded.filter((r) => r.points > 0).reduce((a, r) => a + r.credits, 0),
    courses_count: rows.length, failed_courses: rows.filter((r) => r.points === 0 && r.credits > 0).map((r) => r.course_name),
  };
}

export const transcript = (studentId) =>
  db.prepare('SELECT * FROM records WHERE student_id = ? ORDER BY term_no, course_code').all(studentId);

export function analytics(studentId) {
  const t = transcript(studentId);
  return {
    mastery: estimateAll(t, config.domains, config.masteryThreshold),
    risk: riskModel ? riskModel.predictDomainRisk(t, config.domains) : {},
  };
}

export const listTasks = (studentId, includeDone = false) =>
  db.prepare(`SELECT * FROM tasks WHERE student_id = ? ${includeDone ? '' : 'AND done = 0'} ORDER BY id`).all(studentId)
    .map((t) => ({ ...t, done: !!t.done }));
export const scheduledTasks = (studentId) => schedule(listTasks(studentId));

// كل استعلام مقيَّد بـ student_id → لا يستطيع طالب لمس مهام غيره (منع IDOR)
export const setTaskDone = (studentId, id, done = true) =>
  db.prepare('UPDATE tasks SET done = ? WHERE id = ? AND student_id = ?').run(done ? 1 : 0, id, studentId).changes > 0;
export const deleteTask = (studentId, id) =>
  db.prepare('DELETE FROM tasks WHERE id = ? AND student_id = ?').run(id, studentId).changes > 0;

export function weeklyPlan(studentId, hours = 10) {
  const a = analytics(studentId);
  return buildWeeklyPlan(a.mastery, a.risk, scheduledTasks(studentId), hours);
}
