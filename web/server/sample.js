// توليد بيانات تجريبية اصطناعية (طلاب + مهام) — أسماء ودرجات وهمية بالكامل.
import { Random } from './ml/rng.js';

const FIRST = ['محمد', 'عبدالله', 'فيصل', 'سعود', 'خالد', 'نواف', 'تركي', 'ريان', 'يزن', 'عمر', 'سلمان', 'زياد'];
const LAST = ['الحربي', 'الغامدي', 'الزهراني', 'العتيبي', 'القرشي', 'الشهري', 'المالكي', 'السلمي', 'الثقفي', 'اللحياني'];

// [رمز، اسم، ساعات] لكل ترم
export const PLAN = [
  [['CS1011', 'برمجة الحاسب بلغة بايثون', 3], ['MTH1141', 'التفاضل والتكامل 1', 3], ['IND1101', 'التفكير التصميمي', 2], ['ELIE1201', 'اللغة الإنجليزية 1', 3], ['CUR1101', 'مهارات جامعية', 0]],
  [['CS1012', 'البرمجة الشيئية بلغة بايثون', 3], ['MTH1441', 'الجبر الخطي', 3], ['CS1302', 'هياكل متقطعة 1', 3], ['SEC1101', 'مقدمة في الأمن السيبراني', 3]],
  [['CS2015', 'هياكل البيانات والخوارزميات', 4], ['MTH1602', 'الإحصاء والاحتمالات', 3], ['AI2001', 'مقدمة في الذكاء الاصطناعي', 3], ['CEN2011', 'التصميم الرقمي المنطقي', 3]],
  [['CS2107', 'تصميم وتحليل الخوارزميات', 3], ['DS2201', 'مقدمة في قواعد البيانات', 3], ['SE1201', 'أسس هندسة البرمجيات', 3], ['CEN2012', 'تنظيم وعمارة الحاسب', 3]],
  [['AI3201', 'تعلم الآلة', 3], ['CS3608', 'نظم التشغيل', 3], ['CEN3011', 'شبكات الحاسب الآلي', 3], ['MTH2144', 'تفاضل وتكامل عديد المتغيرات', 3]],
  [['AI3202', 'مقدمة في التعلم العميق', 3], ['AI3301', 'تحليل وتصوير البيانات', 3], ['HCI2011', 'تصميم واجهة المستخدم', 3], ['AI3103', 'أخلاقيات الذكاء الاصطناعي', 2]],
];

// تصنيف المقرر إلى مجال مهاري حسب البادئة (الأطول أولاً حتى يُصنَّف CS1302 كرياضيات قبل CS)
const DOMAIN_PREFIXES = { AI: ['AI'], Math: ['MTH', 'PHYS', 'CS1302'], Programming: ['CS', 'SE', 'HCI'], Systems: ['CEN', 'SEC', 'DS'] };
const PREFIX_LIST = Object.entries(DOMAIN_PREFIXES)
  .flatMap(([domain, ps]) => ps.map((p) => [p, domain]))
  .sort((a, b) => b[0].length - a[0].length);
export const assignDomain = (code) => PREFIX_LIST.find(([p]) => String(code).toUpperCase().startsWith(p))?.[1] ?? 'General';

const GRADES = [[95, 'A+', 4.0], [90, 'A', 3.75], [85, 'B+', 3.5], [80, 'B', 3.0], [75, 'C+', 2.5], [70, 'C', 2.0], [65, 'D+', 1.5], [60, 'D', 1.0]];
export const letter = (score) => { for (const [cut, l, p] of GRADES) if (score >= cut) return [l, p]; return ['F', 0]; };
const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

function row(sid, name, level, t, [code, cname, cr], score) {
  const [l, p] = letter(score);
  return { student_id: sid, name, level, term_no: t + 1, course_code: code, course_name: cname, credits: cr, score, letter: l, points: p, domain: assignDomain(code) };
}

export function generateStudents(n, seed) {
  const rng = new Random(seed);
  const ids = new Set();
  while (ids.size < n) ids.add(rng.int(441000000, 446000000));
  const rows = [];
  for (const sid of [...ids].sort((a, b) => a - b)) {
    const name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
    const termsDone = rng.int(1, PLAN.length + 1);
    const ability = rng.normal(79, 7);
    const strengths = { Programming: rng.normal(0, 5), Math: rng.normal(0, 5), AI: rng.normal(0, 5), Systems: rng.normal(0, 5) };
    const momentum = rng.normal(0, 1.5); // بعض الطلاب يتحسنون مع الوقت وبعضهم يتراجع
    for (let t = 0; t < termsDone; t++) {
      for (const c of PLAN[t]) {
        const skill = strengths[assignDomain(c[0])] ?? 0;
        rows.push(row(sid, name, `المستوى ${termsDone}`, t, c, clip(Math.round(rng.normal(ability + skill + momentum * t, 6)), 40, 100)));
      }
    }
  }
  return rows;
}

// سجل كامل (6 ترمات) لحساب العرض: أداء جيد مع نقطة ضعف في الرياضيات
export function demoStudentRows(sid, name, seed = 2026) {
  const rng = new Random(seed);
  const strengths = { Programming: 7, AI: 5, Systems: 2, Math: -8 };
  const rows = [];
  PLAN.forEach((courses, t) => courses.forEach((c) => {
    const skill = strengths[assignDomain(c[0])] ?? 0;
    rows.push(row(sid, name, `المستوى ${PLAN.length}`, t, c, clip(Math.round(rng.normal(83 + skill + 0.8 * t, 4)), 50, 100)));
  }));
  return rows;
}

// [المادة، المهمة، الأهمية، بعد كم يوم، ساعات]
export const DEMO_TASKS = [
  ['مشروع تخرج 2', 'تسليم التقرير النهائي', 'عالية', 3, 8],
  ['مقدمة في التعلم العميق', 'كويز قصير', 'عالية', 1, 2],
  ['تحليل وتصوير البيانات', 'واجب', 'متوسطة', 6, 3],
  ['أخلاقيات الذكاء الاصطناعي', 'تقرير', 'عادية', 12, 2],
];
