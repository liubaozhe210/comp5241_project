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
