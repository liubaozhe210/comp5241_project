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
