const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const messages = require('../messages/en.json');

function load(relative, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }}).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(
    (id) => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), module, module.exports);
  return module.exports;
}

const grouping = load('lib/learning-stages.ts');
const flow = load('components/LearningPathStages.tsx', {
  'next/link': ({ children, ...props }) => React.createElement('a', props, children),
  'next-intl': { useTranslations: () => (key) => key.split('.').reduce((value, part) => value?.[part], messages) ?? key },
  '@/lib/api': { apiFetch: () => { throw new Error('Unexpected request during server render'); }, errorText: () => '' },
  '@/lib/learning-stages': grouping,
  './StageQuiz': { StageQuiz: () => React.createElement('div', null, 'Quiz body') },
});

function task(id, stage, done = false) {
  return { id, stage, done, title: `Task ${id}`, instructions: `Study ${id}`, minutes: 20, completed_at: null };
}

test('consecutive tasks share stable stage anchors without mutating input', () => {
  const tasks = [task('a', 'Basics'), task('b', 'Basics'), task('c', 'Practice')];
  const original = JSON.stringify(tasks);
  const groups = grouping.groupLearningTasks(tasks);
  assert.deepEqual(groups.map((group) => group.anchorTaskId), ['a', 'c']);
  assert.deepEqual(groups.map((group) => group.tasks.length), [2, 1]);
  assert.equal(JSON.stringify(tasks), original);
});

test('repeated stage titles separated by another stage do not merge quiz identity', () => {
  const groups = grouping.groupLearningTasks([task('a', 'Basics'), task('b', 'Practice'), task('c', 'Basics')]);
  assert.deepEqual(groups.map((group) => group.anchorTaskId), ['a', 'b', 'c']);
  assert.deepEqual(grouping.groupLearningTasks([]), []);
});

test('finishing a stage leads to its quiz instead of skipping into the next stage', () => {
  const tasks = [task('a', 'Basics', true), task('b', 'Basics', true), task('c', 'Practice')];
  assert.deepEqual(grouping.studyContinuation(tasks, 'b'), { kind: 'quiz', id: 'a' });
  assert.equal(grouping.studyContinuation(tasks, 'c'), null);
  assert.equal(grouping.studyContinuation(tasks, 'missing'), null);
});

test('continuation finds unfinished work in the same stage including newly added review tasks', () => {
  const tasks = [task('a', 'Basics', true), task('review', 'Basics'), task('c', 'Practice')];
  assert.deepEqual(grouping.studyContinuation(tasks, 'a'), { kind: 'task', id: 'review' });
  tasks[1].done = true;
  assert.deepEqual(grouping.studyContinuation(tasks, 'review'), { kind: 'quiz', id: 'a' });
  tasks[0].done = false;
  assert.deepEqual(grouping.studyContinuation(tasks, 'review'), { kind: 'task', id: 'a' });
});

test('the final stage still offers its quiz and repeated stage titles keep separate anchors', () => {
  const tasks = [task('a', 'Basics', true), task('b', 'Practice', true), task('c', 'Basics', true)];
  assert.deepEqual(grouping.studyContinuation(tasks, 'c'), { kind: 'quiz', id: 'c' });
  assert.deepEqual(grouping.studyContinuation(tasks, 'a'), { kind: 'quiz', id: 'a' });
});

test('reader renders a stage quiz continuation inside the path and hides it for historical versions', () => {
  function readerMarkup(readOnly) {
    let index = 0;
    const state = { 4: false, 8: { ...task('a', 'Basics', true), version_id: 'version', read_only: readOnly, source_status: 'not_linked' },
      10: { kind: 'quiz', id: 'a' } };
    const { MaterialReader } = load('components/MaterialReader.tsx', {
      react: { ...React, useEffect() {}, useRef: () => ({ current: 0 }),
        useState: (initial) => { const slot = index++; return [slot in state ? state[slot] : initial, () => {}]; } },
      'next/link': ({ children, ...props }) => React.createElement('a', props, children),
      'next/navigation': { useRouter: () => ({ replace() {}, push() {} }) },
      'next-intl': { useTranslations: () => (key) => key },
      '@/components/Shell': { Shell: ({ children }) => React.createElement('main', null, children) },
      '@/lib/api': { apiFetch: () => { throw new Error('Unexpected request'); }, errorText: () => '' },
      '@/lib/useSession': { useSession: () => ({ me: { role: 'student' }, loading: false }) },
      '@/lib/learning-stages': grouping,
    });
    return renderToStaticMarkup(MaterialReader({ locale: 'en', id: '', pathId: 'plan', taskId: 'a' }));
  }
  const html = readerMarkup(false);
  assert.ok(html.includes('/en/learning-path/plan?version=version#stage-quiz-a'));
  assert.ok(html.includes('taskStudy.stageQuiz'));
  assert.equal(readerMarkup(true).includes('#stage-quiz-a'), false);
});

test('visible sequence is stage-one tasks, stage-one quiz, then stage-two tasks and quiz', () => {
  const html = renderToStaticMarkup(React.createElement(flow.LearningPathStages, {
    locale: 'en', pathId: 'plan', versionId: 'version', tasks: [task('a', 'Basics'), task('b', 'Basics'), task('c', 'Practice')],
    readOnly: false, busy: false, onToggle() {},
  }));
  const positions = ['id="stage-a"', 'Task a', 'Task b', 'id="stage-quiz-a"', 'id="stage-c"', 'Task c', 'id="stage-quiz-c"'].map((text) => html.indexOf(text));
  assert.ok(positions.every((position) => position >= 0));
  assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]));
  assert.equal((html.match(/stage-quiz-b/g) ?? []).length, 0);
});

test('historical tasks remain read-only and task learning links retain their path scope', () => {
  const html = renderToStaticMarkup(React.createElement(flow.LearningPathStages, {
    locale: 'en', pathId: 'plan', versionId: 'version', tasks: [task('a', 'Basics', true), task('b', 'Basics')],
    readOnly: true, busy: false, onToggle() {},
  }));
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.ok(html.includes('/en/learning-path/plan/tasks/a'));
  assert.ok(html.includes('/en/learning-path/plan/tasks/b'));
});

// Exercise the actual parent refresh callback with controlled asynchronous responses.
// Effects are omitted so these checks need neither authentication nor a real API.
function refreshHarness(request) {
  const states = [], setters = [];
  let cursor = 0;
  const hooks = { ...React, useEffect() {}, useRef: () => ({ current: 0 }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      setters[index] = (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; };
      return [states[index], setters[index]];
    },
  };
  const Stages = () => null;
  const { LearningPaths } = load('components/LearningPaths.tsx', {
    react: hooks,
    'next/link': () => null,
    'next/navigation': { useRouter: () => ({ replace() {}, push() {} }) },
    'next-intl': { useTranslations: () => (key) => key },
    './Shell': { Shell: () => null }, './PathResources': { PathResources: () => null },
    './LearningPathStages': { LearningPathStages: Stages },
    './LearningPathCompletion': { LearningPathCompletion: () => null },
    './LearningPathProgress.module.css': {},
    '@/lib/api': { apiFetch: request, errorText: (error) => error.message },
    '@/lib/useSession': { useSession: () => ({ me: { role: 'student' }, loading: false }) },
  });
  const render = () => { cursor = 0; return LearningPaths({ locale: 'en', id: 'plan' }); };
  function nodes(tree, type) {
    if (Array.isArray(tree)) return tree.flatMap((item) => nodes(item, type));
    if (!tree || typeof tree !== 'object') return [];
    return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
  }
  render();
  const original = { id: 'plan', version_id: 'version', current_version_id: 'version', status: 'ready',
    tasks: [task('a', 'Basics')], budget_minutes: 60, version: 1 };
  setters[1](original); setters[2]([original]); setters[6](false);
  return { render, stages: (tree) => nodes(tree, Stages), states, original };
}

test('applying an adjustment automatically replaces the stage tree with the fresh plan', async () => {
  let resolve;
  const calls = [];
  const harness = refreshHarness((url) => { calls.push(url); return new Promise((done) => { resolve = done; }); });
  const before = harness.stages(harness.render())[0];
  const pending = before.props.onPlanChanged();
  assert.equal(harness.stages(harness.render())[0].props.busy, true);
  const updated = { ...harness.original, tasks: [task('a', 'Basics'), task('review', 'Basics'), task('b', 'Practice')] };
  resolve(updated);
  await pending;
  const stages = harness.stages(harness.render());
  assert.equal(stages.length, 1);
  assert.notEqual(stages[0].key, before.key); // React unmounts the old stage/quiz tree.
  assert.strictEqual(stages[0].props.tasks, updated.tasks);
  assert.equal(stages[0].props.busy, false);
  assert.deepEqual(calls, ['/learning-paths/plan?version_id=version']);
  assert.strictEqual(harness.states[2][0], updated); // Version selector also has fresh data.
});

test('failed automatic refresh keeps the existing plan and permits retry without duplicate stages', async () => {
  const harness = refreshHarness(async () => { throw new Error('Offline'); });
  const before = harness.stages(harness.render())[0];
  await assert.rejects(before.props.onPlanChanged(), /Offline/);
  const stages = harness.stages(harness.render());
  assert.equal(stages.length, 1);
  assert.equal(stages[0].key, before.key);
  assert.strictEqual(stages[0].props.tasks, harness.original.tasks);
  assert.equal(stages[0].props.busy, false);
  assert.equal(harness.states[4], 'Offline');
});

test('quiz submission refreshes completion without remounting the visible quiz result', async () => {
  const updated = { version_id: 'version', current_version_id: 'version', status: 'ready',
    tasks: [task('a', 'Basics', true)], plan_completed: true };
  const harness = refreshHarness(async () => updated);
  const before = harness.stages(harness.render())[0];
  before.props.onProgressChanged();
  await new Promise((resolve) => setImmediate(resolve));
  const after = harness.stages(harness.render())[0];
  assert.equal(after.key, before.key);
  assert.equal(harness.states[1].plan_completed, true);
});

test('completion panel distinguishes finished tasks from a completed plan and links to the pending quiz', () => {
  const { LearningPathCompletion } = load('components/LearningPathCompletion.tsx', {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next-intl': { useTranslations: () => (key) => key.split('.').reduce((value, part) => value?.[part], messages) ?? key },
  });
  const plan = { id: 'plan', version_id: 'version', status: 'ready', progress: 100,
    plan_completed: false, completion_status: 'awaiting_assessment', passed_stages: 1,
    total_stages: 2, next_assessment_anchor: 'second' };
  const html = renderToStaticMarkup(React.createElement(LearningPathCompletion, { plan, locale: 'en' }));
  assert.ok(html.includes(messages.learningPath.completion_awaiting_assessment));
  assert.ok(html.includes('1/2'));
  assert.ok(html.includes('/en/learning-path/plan?version=version#stage-quiz-second'));
  const complete = renderToStaticMarkup(React.createElement(LearningPathCompletion, {
    plan: { ...plan, plan_completed: true, completion_status: 'completed', passed_stages: 2, next_assessment_anchor: null }, locale: 'en' }));
  assert.ok(complete.includes(messages.learningPath.completion_completed));
  assert.equal(complete.includes('#stage-quiz-'), false);
});

function quizRoundHarness(request, historical = false) {
  const states = [], setters = [];
  let cursor = 0;
  const hooks = { ...React, useEffect() {}, useRef: () => ({ current: 0 }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      setters[index] = (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next; };
      return [states[index], setters[index]];
    } };
  let submitted = 0;
  const { StageQuiz } = load('components/StageQuiz.tsx', {
    react: hooks, 'next/link': () => null,
    'next/navigation': { useRouter: () => ({ replace() {}, push() {} }) },
    'next-intl': { useTranslations: () => (key) => key },
    '@/components/Shell': { Shell: () => null },
    '@/lib/api': { apiFetch: request, errorText: (error) => error.message },
    '@/lib/useSession': { useSession: () => ({ me: { role: 'student' }, loading: false }) },
    './LearningAdjustment': { LearningAdjustment: () => null },
  });
  const render = () => { cursor = 0; return StageQuiz({ locale: 'en', id: 'plan', anchor: 'anchor', embedded: true, onSubmitted: () => { submitted++; } }); };
  render();
  setters[0]({ id: 'first', round: 1, rounds: [{ id: 'first', number: 1 }, ...(historical ? [{ id: 'second', number: 2 }] : [])],
    latest_assessment_id: historical ? 'second' : 'first', read_only: historical, rounds_available: true, questions: [] });
  setters[1]([{ id: 'attempt', score: 3 }]);
  setters[2]({ id: 'attempt', score: 3, passed: false, feedback: [] });
  setters[5](false);
  function find(tree, predicate) {
    if (Array.isArray(tree)) return tree.flatMap((item) => find(item, predicate));
    if (!tree || typeof tree !== 'object') return [];
    return [...(predicate(tree) ? [tree] : []), ...find(tree.props?.children, predicate)];
  }
  return { render, states, submitted: () => submitted,
    button: (label) => find(render(), (node) => node.type === 'button' && node.props.children === label)[0],
    select: () => find(render(), (node) => node.type === 'select')[0] };
}

test('new quiz round requires explicit confirmation and refreshes stage status after success', async () => {
  const calls = [];
  const harness = quizRoundHarness(async (url, options) => { calls.push({ url, options }); return { id: 'second' }; });
  assert.equal(calls.length, 0);
  assert.equal(harness.button('quiz.confirmNewRound'), undefined);
  harness.button('quiz.newRound').props.onClick();
  assert.equal(calls.length, 0);
  harness.button('quiz.confirmNewRound').props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/learning-paths/plan/stages/anchor/assessment/rounds');
  assert.deepEqual(JSON.parse(calls[0].options.body), { locale: 'en', previous_assessment_id: 'first' });
  assert.equal(harness.states[8], 'second');
  assert.equal(harness.submitted(), 1);
});

test('historical round offers history selection but cannot regenerate or retake', () => {
  const harness = quizRoundHarness(() => { throw new Error('Unexpected request'); }, true);
  assert.equal(harness.button('quiz.newRound'), undefined);
  assert.equal(harness.button('quiz.retake'), undefined);
  harness.select().props.onChange({ target: { value: 'second' } });
  assert.equal(harness.states[8], 'second');
});

test('failed new-round generation leaves the current round and result available for retry', async () => {
  const harness = quizRoundHarness(async () => { throw new Error('Rate limited'); });
  harness.button('quiz.newRound').props.onClick();
  harness.button('quiz.confirmNewRound').props.onClick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.states[0].id, 'first');
  assert.equal(harness.states[2].id, 'attempt');
  assert.equal(harness.states[4], 'Rate limited');
  assert.equal(harness.states[6], false);
  assert.equal(harness.submitted(), 0);
});
