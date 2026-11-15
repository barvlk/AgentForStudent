import test from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, gradePoints, gradeFromScore, semesterGpa, cumulative, whatIf, requiredAverage } from '../client/js/gpa.js';

test('scales: UQU-style 4.00 and common Saudi 5.00 tables', () => {
  assert.equal(gradePoints('A+', 4), 4);
  assert.equal(gradePoints('A', 4), 3.75);
  assert.equal(gradePoints('D', 4), 1);
  assert.equal(gradePoints('F', 4), 0);
  assert.equal(gradePoints('A+', 5), 5);
  assert.equal(gradePoints('A', 5), 4.75);
  assert.equal(gradePoints('D', 5), 2);
  assert.equal(gradePoints('F', 5), 1);
  assert.equal(gradePoints(' b+ ', 5), 4.5);
  assert.throws(() => gradePoints('Z', 4), RangeError);
  assert.throws(() => gradePoints('A', 6), RangeError);
  assert.equal(SCALES[4].grades.length, 9);
});

test('grade from percentage', () => {
  assert.equal(gradeFromScore(95, 4).letter, 'A+');
  assert.equal(gradeFromScore(94.9, 4).letter, 'A');
  assert.equal(gradeFromScore(60, 5).letter, 'D');
  assert.equal(gradeFromScore(59.9, 5).letter, 'F');
  assert.throws(() => gradeFromScore(101, 4), RangeError);
});

test('semester GPA is a weighted average by hours', () => {
  // (4.00×4 + 3.00×3) / 7 = 3.5714...
  assert.equal(semesterGpa([{ hours: 4, letter: 'A+' }, { hours: 3, letter: 'B' }], 4).gpa, 3.57);
  // نفس المقررات على سلم 5: (5×4 + 4×3) / 7 = 4.5714...
  assert.equal(semesterGpa([{ hours: 4, letter: 'A+' }, { hours: 3, letter: 'B' }], 5).gpa, 4.57);
  assert.equal(semesterGpa([], 4).gpa, 0);
  assert.throws(() => semesterGpa([{ hours: 0, letter: 'A' }]), RangeError);
});

test('cumulative GPA: 4-hour A+ on top of 3.00 over 60 hours', () => {
  // (3.00×60 + 4.00×4) / 64 = 3.0625
  const r = cumulative(3.0, 60, [{ hours: 4, letter: 'A+' }], 4);
  assert.equal(r.gpa, 3.06);
  assert.equal(r.hours, 64);
  assert.equal(r.delta, 0.06);
  // على سلم 5: (3.00×60 + 5.00×4) / 64 = 3.125 → 3.13
  assert.equal(cumulative(3.0, 60, [{ hours: 4, letter: 'A+' }], 5).gpa, 3.13);
  // فصل جديد بدون ساعات سابقة
  assert.equal(cumulative(0, 0, [{ hours: 3, letter: 'B+' }], 4).gpa, 3.5);
  assert.throws(() => cumulative(4.5, 10, [{ hours: 3, letter: 'A' }], 4), RangeError);
});

test('what-if returns one row per grade and is monotonic', () => {
  const rows = whatIf(3.2, 80, 4, 4);
  assert.equal(rows.length, 9);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].gpa <= rows[i - 1].gpa);
  assert.ok(rows[0].delta > 0 && rows[8].delta < 0);
});

test('required average for a target GPA', () => {
  // الحالي 3.00 على 60 ساعة، الهدف 3.20 بعد 15 ساعة: (3.2×75 - 3×60)/15 = 4.0 → ممكن فقط بتقدير A+ في كل المقررات
  const r = requiredAverage(3.0, 60, 3.2, 15, 4);
  assert.equal(r.needed, 4);
  assert.equal(r.feasible, true);
  assert.equal(r.minGrade.letter, 'A+');
  const impossible = requiredAverage(3.0, 60, 3.8, 15, 4);
  assert.equal(impossible.feasible, false);
  assert.ok(impossible.maxPossible < 3.8);
  const easy = requiredAverage(3.5, 60, 3.0, 15, 4); // (3.0×75 - 3.5×60)/15 = 1.0
  assert.equal(easy.needed, 1);
  assert.equal(easy.minGrade.letter, 'D');
  assert.equal(requiredAverage(3.5, 60, 2.0, 15, 4).needed, 0); // الهدف أقل بكثير: يكفي أي تقدير
});
