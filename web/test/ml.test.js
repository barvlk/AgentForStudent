import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCalculate, UnsafeExpressionError } from '../server/ml/calc.js';
import { bktUpdate, estimateMastery, DEFAULT_PARAMS } from '../server/ml/bkt.js';
import { schedule, urgency } from '../server/ml/scheduler.js';
import { RandomForest, rocAuc } from '../server/ml/forest.js';
import { KnowledgeBase } from '../server/ml/knowledge.js';
import { Random } from '../server/ml/rng.js';
import { buildWeeklyPlan } from '../server/ml/planner.js';

test('calc: operations and precedence', () => {
  assert.equal(safeCalculate('2 + 3 * 4'), 14);
  assert.equal(safeCalculate('(85*3 + 90*4) / 7'), 87.857142857142861);
  assert.equal(safeCalculate('2 ** 3 ** 2'), 512);
  assert.equal(safeCalculate('-3 + +5'), 2);
  assert.equal(safeCalculate('7 // 2'), 3);
  assert.equal(safeCalculate('7 % 4'), 3);
  assert.equal(safeCalculate('10 × 2 ÷ 4'), 5);
});

test('calc: rejects anything that is not arithmetic', () => {
  for (const bad of ['process.exit()', 'constructor', '2 + a', '__import__("os")', '1 / 0', '2 ** 1000', '(1 + 2', '', '1 +']) {
    assert.throws(() => safeCalculate(bad), UnsafeExpressionError, bad);
  }
});

test('bkt: success raises mastery, failure lowers it', () => {
  const p = DEFAULT_PARAMS.Programming;
  assert.ok(bktUpdate(0.5, true, p) > 0.5);
  assert.ok(bktUpdate(0.5, false, p) < 0.5);
  const high = [1, 2, 3].map((t) => ({ domain: 'AI', term_no: t, score: 95 }));
  const low = [1, 2, 3].map((t) => ({ domain: 'AI', term_no: t, score: 60 }));
  assert.ok(estimateMastery(high, 'AI').probability > estimateMastery(low, 'AI').probability);
  assert.equal(estimateMastery([], 'AI').label, 'لا توجد بيانات');
});

test('scheduler: urgency, importance and SJF tie-break', () => {
  assert.equal(urgency(null), 0.15);
  assert.equal(urgency(-2), 1);
  assert.ok(urgency(1) > urgency(10));
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const mk = (id, priority, days, hours, done = false) => ({ id, course: 'c', title: `t${id}`, priority, due_date: days == null ? null : iso(days), est_hours: hours, done });
  const out = schedule([mk(1, 'عادية', 30, 1), mk(2, 'عالية', 1, 5), mk(3, 'عالية', 1, 2), mk(4, 'عالية', 0, 1, true)]);
  assert.deepEqual(out.map((s) => s.task.id), [3, 2, 1]); // 3 قبل 2 (نفس الدرجة، أقصر وقتاً)، والمنجزة مستبعدة
});

test('random forest learns a separable pattern; AUC computed correctly', () => {
  const rng = new Random(1);
  const X = [], y = [];
  for (let i = 0; i < 300; i++) { const a = rng.float(), b = rng.float(); X.push([a, b, rng.float()]); y.push(a + 0.2 * b > 0.6 ? 1 : 0); }
  const rf = new RandomForest({ nTrees: 40, seed: 3 }).fit(X.slice(0, 220), y.slice(0, 220));
  const scores = X.slice(220).map((x) => rf.predictProba(x));
  assert.ok(rocAuc(y.slice(220), scores) > 0.9);
  assert.ok(rf.importance[0] > rf.importance[2]);
  assert.equal(rocAuc([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]), 1);
  assert.equal(rocAuc([0, 1], [0.5, 0.5]), 0.5);
});

test('knowledge base: Arabic retrieval tolerates variants', () => {
  const kb = new KnowledgeBase();
  assert.match(kb.search('اشرح لي خوارزمية SJF')[0].text, /SJF/);
  assert.match(kb.search('الشجرة الثنائية')[0].text, /BST/);
  assert.match(kb.search('سكروم')[0].text, /Scrum/);
  assert.equal(kb.search('').length, 0);
});

test('planner: hours follow need and sum close to budget', () => {
  const mastery = { AI: { probability: 0.9, observations: 3 }, Math: { probability: 0.2, observations: 3 } };
  const plan = buildWeeklyPlan(mastery, { AI: 0.1, Math: 0.8 }, [], 10);
  assert.equal(plan.focus[0].domain, 'Math');
  assert.ok(plan.focus[0].hours > plan.focus[1].hours);
  assert.ok(Math.abs(plan.focus.reduce((a, f) => a + f.hours, 0) - 10) <= 1);
});
