import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const service = createRequire(import.meta.url)('./learning-path-service.js');
const courses = [
  { id: 'se', code: 'COMP5241', name: 'Software Engineering', status: 'published' },
  { id: 'dm', code: 'COMP5511', name: 'Data Mining and Data Warehousing', status: 'published' },
  { id: 'dl', code: 'COMP5329', name: 'Deep Learning', status: 'draft' },
  { id: 'cloud', code: 'COMP5401', name: 'Cloud Computing', status: 'archived' },
];
const input = { topic: '软件工程', goal: '完成软件工程项目', level: 'beginner', hours: 10 };
const context = { studentId: 's1', version: 1, createdAt: '2026-10-22T00:00:00Z', courses };

test('stage counts, exact positive time allocations and stable identifiers', () => {
  for (const [level, count] of [['beginner', 5], ['intermediate', 4], ['advanced', 3]]) {
    for (const hours of [1, 1.5, 10, 39.5, 200]) {
      const plan = service.generate({ ...input, level, hours }, context);
      assert.equal(plan.stages.length, count);
      const tasks = plan.stages.flatMap(s => s.tasks);
      assert.equal(tasks.reduce((sum, task) => sum + task.minutes, 0), hours * 60);
      assert.ok(tasks.every(task => Number.isInteger(task.minutes) && task.minutes > 0 && !task.done));
      assert.equal(new Set(tasks.map(task => task.id)).size, count * 2);
      assert.equal(plan.generatedBy, 'local-template');
    }
  }
});
test('matches topic or goal to real published courses, including Chinese topics', () => {
  assert.deepEqual(service.generate(input, context).stages[0].courseIds, ['se']);
  assert.deepEqual(service.generate({ ...input, topic: 'My project', goal: 'Learn data mining' }, context).stages[0].courseIds, ['dm']);
});
test('explicit course selection overrides automatic matching', () => {
  assert.deepEqual(service.generate({ ...input, courseId: 'dm' }, context).stages[0].courseIds, ['dm']);
});
test('unmatched, draft and archived courses are not invented or recommended', () => {
  for (const topic of ['天文学', 'Deep Learning', 'Cloud Computing']) {
    assert.deepEqual(service.generate({ ...input, topic, goal: 'Study this topic' }, context).stages[0].courseIds, []);
  }
  assert.throws(() => service.generate({ ...input, courseId: 'dl' }, context));
});
test('each result is independent and inputs remain unchanged', () => {
  const before = JSON.stringify({ input, context });
  const a = service.generate(input, context);
  const b = service.generate(input, context);
  assert.deepEqual(a, b);
  a.stages[0].tasks[0].done = true;
  a.stages[0].courseIds.push('wrong');
  assert.equal(b.stages[0].tasks[0].done, false);
  assert.deepEqual(b.stages[0].courseIds, ['se']);
  assert.equal(JSON.stringify({ input, context }), before);
});
test('invalid generation requests fail before producing a plan', () => {
  for (const invalid of [{ hours: 0 }, { hours: 201 }, { hours: 1.2 }, { hours: NaN }, { level: 'unknown' }, { topic: ' ' }, { goal: '' }]) {
    assert.throws(() => service.generate({ ...input, ...invalid }, context));
  }
  assert.throws(() => service.generate(input, { ...context, version: 0 }));
});
