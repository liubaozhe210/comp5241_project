import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const assessment = createRequire(import.meta.url)('./learning-path-assessment.js');
const bankIds = ['se-v1', 'data-v1', 'vision-v1', 'distributed-v1', 'methods-v1'];
function stage(score) {
  return { tasks: [{ id: 'study', type: 'study', minutes: 20, done: true }, { id: 'exercise', type: 'exercise', minutes: 20, done: true }],
    attempts: score === undefined ? [] : [assessment.grade('se-v1', score === 0 ? [1, 1, 1] : score === 2 ? [0, 0, 1] : [0, 0, 0], '2026-10-22T00:00:00Z')] };
}
test('all question banks have complete bilingual prompts, options, concepts and explanations', () => {
  for (const id of bankIds) {
    const bank = assessment.getBank(id);
    assert.equal(bank.questions.length, 3);
    for (const q of bank.questions) {
      assert.equal(q.options.length, 3);
      assert.ok(q.correct >= 0 && q.correct < q.options.length);
      for (const pair of [bank.title, q.prompt, q.concept, q.explanation, ...q.options]) {
        assert.equal(pair.length, 2);
        assert.ok(pair.every(text => typeof text === 'string' && text.length > 0));
      }
    }
  }
});
test('subject selection and explicitly labelled fallback', () => {
  for (const [topic, id] of [['软件工程', 'se-v1'], ['Data mining', 'data-v1'], ['计算机视觉', 'vision-v1'], ['Distributed systems', 'distributed-v1'], ['History', 'methods-v1']]) {
    assert.equal(assessment.selectBank({ topic, goal: '' }, { courseIds: [] }, []).id, id);
  }
  assert.equal(assessment.selectBank({ topic: 'Study', goal: '' }, { courseIds: ['c1'] }, [{ id: 'c1', code: 'COMP5241' }]).id, 'se-v1');
});
test('grades valid answers and preserves submitted answers without sharing references', () => {
  const answers = [0, 0, 1];
  const result = assessment.grade('se-v1', answers, 'now');
  assert.equal(result.score, 2);
  assert.equal(result.maxScore, 3);
  answers[0] = 1;
  assert.deepEqual(result.answers, [0, 0, 1]);
  for (const id of bankIds) {
    assert.equal(assessment.grade(id, [1, 1, 1], 'now').score, 0);
    assert.equal(assessment.grade(id, [0, 0, 0], 'now').score, 3);
  }
});
test('invalid or incomplete answers are rejected', () => {
  for (const answers of [[], [0, 0], [0, 3, 0], [0, -1, 0], [0, '0', 0], [0, NaN, 0]]) {
    assert.throws(() => assessment.grade('se-v1', answers, 'now'));
  }
  assert.throws(() => assessment.grade('missing', [0, 0, 0], 'now'));
});
test('recommendations use scores and require completion before advanced work', () => {
  assert.equal(assessment.recommendation(stage()), null);
  assert.equal(assessment.recommendation(stage(0)), 'review');
  assert.equal(assessment.recommendation(stage(2)), 'practice');
  assert.equal(assessment.recommendation(stage(3)), 'challenge');
  const incomplete = stage(3);
  incomplete.tasks[0].done = false;
  assert.equal(assessment.recommendation(incomplete), null);
});
test('applying each suggestion adds a real unfinished task, preserves progress and records evidence', () => {
  for (const [score, type, minutes] of [[0, 'review', 15], [2, 'practice', 20], [3, 'challenge', 30]]) {
    const s = stage(score);
    const task = assessment.apply(s, 2, 1, 0, 'now');
    assert.equal(task.type, type);
    assert.equal(task.minutes, minutes);
    assert.equal(task.done, false);
    assert.equal(s.tasks.length, 3);
    assert.ok(s.tasks.slice(0, 2).every(task => task.done));
    assert.equal(s.adjustments[0].taskId, task.id);
    assert.equal(s.adjustments[0].attemptIndex, 0);
    assert.equal(s.tasks.reduce((sum, task) => sum + task.minutes, 0), 40 + minutes);
  }
});
test('repeat application, outdated evidence and stacking unfinished tasks are blocked', () => {
  const s = stage(0);
  assert.equal(assessment.apply(s, 1, 0, 1, 'now'), null);
  assert.ok(assessment.apply(s, 1, 0, 0, 'now'));
  assert.equal(assessment.apply(s, 1, 0, 0, 'now'), null);
  s.attempts.push(assessment.grade('se-v1', [1, 1, 1], 'later'));
  assert.equal(assessment.apply(s, 1, 0, 0, 'later'), null);
  assert.equal(assessment.apply(s, 1, 0, 1, 'later'), null);
  s.tasks[2].done = true;
  assert.ok(assessment.apply(s, 1, 0, 1, 'later'));
  assert.equal(new Set(s.tasks.map(task => task.id)).size, s.tasks.length);
});
