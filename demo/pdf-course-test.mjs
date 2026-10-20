#!/usr/bin/env node
// Behaviour tests for the local PDF-course workflow. No browser or network needed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const element = () => ({ innerHTML: '', style: {}, classList: { contains() { return false; } },
  appendChild() {}, remove() {}, focus() {}, setAttribute() {}, querySelector() { return null; } });
const nodes = { app: element(), toasts: element(), 'modal-root': element() };
const store = new Map();
const localStorage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) };
const document = { documentElement: {}, body: { insertAdjacentHTML() {} }, getElementById: id => nodes[id],
  addEventListener() {}, querySelector() { return null; }, createElement: element };
const window = { location: { hash: '#/', search: '', replace(hash) { this.hash = hash; } },
  addEventListener() {}, matchMedia: () => ({ matches: true }) };
function FormDataStub(form) { this.values = form.values; }
FormDataStub.prototype.get = function (key) { return Object.hasOwn(this.values, key) ? this.values[key] : null; };
const context = vm.createContext({ document, window, localStorage, console, Uint8Array,
  setTimeout: fn => setTimeout(fn, 0), FormData: FormDataStub });
const files = ['icons.js', 'i18n.js', 'data.js', 'pdf-course-i18n.js', 'pdf-course-content.js', 'pdf-course.js', 'app.js'];
vm.runInContext(files.map(f => readFileSync(join(here, f), 'utf8')).join('\n;\n'), context);
const run = code => vm.runInContext(code, context);
const json = code => JSON.parse(run(`JSON.stringify(${code})`));
const as = id => run(`state.user = userById(${JSON.stringify(id)});`);
const route = hash => { run(`window.location.hash=${JSON.stringify(hash)}; render();`); return nodes.app.innerHTML; };
const submit = (type, values) => {
  context.testValues = values;
  run(`handleSubmit({values:testValues,getAttribute:()=>${JSON.stringify(type)},reset(){}},{preventDefault(){}});`);
};
const input = (path, value) => {
  context.testInput = { value, getAttribute: key => key === 'data-studio' ? path : null };
  run('PDFCOURSE.handleInput({target:testInput});');
};
const act = (name, data = {}) => {
  context.testData = data;
  run(`handleAct(${JSON.stringify(name)},testData,{},null);`);
};
const fakeFile = (header, size = 100) => ({ name: 'Material.pdf', size,
  slice: () => ({ arrayBuffer: async () => Uint8Array.from([...header].map(c => c.charCodeAt(0))).buffer }) });
const options = { courseId: 'c1', topic: 'requirements', language: 'en', level: 'beginner', title: 'Practical requirements', goal: 'Write a testable requirement.', quiz: true, scenario: true };
context.options = options;
let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}

await test('Student cannot access the teacher studio', () => {
  as('u_s1'); assert.match(route('#/teacher/studio'), /403/);
});
await test('Teacher studio renders in both interface languages', () => {
  as('u_t1'); assert.match(route('#/teacher/studio'), /Generate course draft/);
  run("state.locale='zh';"); assert.match(route('#/teacher/studio'), /生成课程草稿/); run("state.locale='en';");
});
await test('Generation requires a source and does not create a record on failure', async () => {
  assert.equal(await run('PDFCOURSE.generate(options)'), false);
  assert.equal(run('PDFCOURSE.sessionUI().error'), 'studio.noSource');
  assert.equal(run('(state.db.interactiveCourses||[]).length'), 0);
});
await test('A renamed non-PDF file is rejected by its bytes', async () => {
  await assert.rejects(run('PDFCOURSE.validateFile')(fakeFile('HELLO')), /studio.badPdf/);
});
await test('Unreadable and oversized files are rejected', async () => {
  await assert.rejects(run('PDFCOURSE.validateFile')(fakeFile('%PDF-', 20 * 1024 * 1024 + 1)), /studio.bigPdf/);
  await assert.rejects(run('PDFCOURSE.validateFile')({ size: 1, name: 'bad.pdf', slice() { throw new Error('read'); } }), /studio.readError/);
});
await test('A valid header and the 20 MB boundary are accepted', async () => {
  const source = await run('PDFCOURSE.validateFile')(fakeFile('%PDF-', 20 * 1024 * 1024));
  assert.equal(source.kind, 'file'); assert.equal(source.size, 20 * 1024 * 1024);
});
await test('All three topics in both content languages produce complete lessons', () => {
  as('u_t1'); act('pc-sample');
  for (const language of ['en', 'zh']) for (const topic of ['requirements', 'agents', 'testing']) {
    const draft = run('PDFCOURSE.buildDraft')({ ...options, topic, language }, { name: 'Example.pdf', kind: 'sample' });
    assert.equal(draft.content.lessons.length, 3);
    assert.equal(draft.content.lessons.filter(x => x.quiz).length, 3);
    assert.equal(draft.content.lessons.filter(x => x.scenario).length, 1);
    assert.ok(draft.content.goals.includes(options.goal));
  }
});
await test('Activity selections and intermediate depth affect the draft', () => {
  const draft = run('PDFCOURSE.buildDraft')({ ...options, quiz: false, level: 'intermediate' }, { name: 'Example.pdf' });
  assert.ok(draft.content.lessons.every(x => x.quiz === null));
  assert.match(draft.content.lessons[0].body, /Go further/);
  assert.throws(() => run('PDFCOURSE.buildDraft')({ ...options, quiz: false, scenario: false }, {}), /studio.missing/);
});
await test('Teacher cannot generate into another teacher’s or an archived course', () => {
  assert.throws(() => run('PDFCOURSE.buildDraft')({ ...options, courseId: 'c2' }, {}), /errors.forbidden/);
  run("courseById('c1').status='archived';");
  assert.throws(() => run('PDFCOURSE.buildDraft')(options, {}), /errors.forbidden/);
  run("courseById('c1').status='published';");
});
await test('Generation opens an editable draft with no published record', async () => {
  assert.equal(await run('PDFCOURSE.generate(options)'), true);
  assert.match(route('#/teacher/studio'), /Make it your own/);
  assert.equal(run('PDFCOURSE.sessionUI().draft.status'), 'draft');
  assert.equal(run('(state.db.interactiveCourses||[]).length'), 0);
});
await test('Editing content uses the input handler without rendering on each keystroke', () => {
  input('lessons.0.title', 'Discover the real user need');
  input('lessons.0.quiz.correct', '1');
  assert.equal(run('PDFCOURSE.sessionUI().draft.content.lessons[0].title'), 'Discover the real user need');
  assert.equal(run('PDFCOURSE.sessionUI().draft.content.lessons[0].quiz.correct'), 1);
});
await test('Empty activity content cannot be saved', () => {
  input('lessons.0.quiz.question', '');
  assert.equal(run('PDFCOURSE.saveDraft(false)'), null);
  assert.equal(run('PDFCOURSE.sessionUI().error'), 'studio.incomplete');
  input('lessons.0.quiz.question', 'What should you ask first?');
});
await test('Teachers can edit scenario checkpoints and matching keywords', () => {
  input('lessons.2.scenario.criteria.0.0', 'Who is affected');
  input('lessons.2.scenario.criteria.0.1', 'student, owner，用户');
  assert.deepEqual(json('PDFCOURSE.sessionUI().draft.content.lessons[2].scenario.criteria[0]'), ['Who is affected', ['student', 'owner', '用户']]);
});
let id;
await test('Saving a draft persists its structure and audit record', () => {
  const saved = run('PDFCOURSE.saveDraft(false)'); id = saved.id; context.courseId = id;
  assert.equal(saved.status, 'draft'); assert.equal(saved.revision, 0);
  assert.equal(JSON.parse(store.get('coursehub.demo.db')).interactiveCourses[0].id, id);
  assert.equal(run('state.db.audit[0].action'), 'actUpdateCourse');
});
await test('Students and other teachers cannot open an unpublished draft', () => {
  as('u_s1'); assert.match(route('#/learn/' + id), /403/);
  as('u_t2'); assert.match(route('#/teacher/studio/' + id), /403/); assert.match(route('#/learn/' + id), /403/);
});
await test('Publishing creates a student-facing snapshot', () => {
  as('u_t1'); route('#/teacher/studio/' + id);
  const saved = run('PDFCOURSE.saveDraft(true)');
  assert.equal(saved.status, 'published'); assert.equal(saved.revision, 1);
  assert.equal(saved.publishedContent.lessons[0].title, 'Discover the real user need');
});
await test('A published course can reopen its editor without refreshing', () => {
  assert.match(route('#/teacher/studio/' + id), /Ready for your learners/);
  act('pc-open-edit', { id });
  assert.match(nodes.app.innerHTML, /Make it your own/);
});
await test('Pending enrollment cannot access published interactive lessons', () => {
  as('u_s2'); assert.match(route('#/learn/' + id), /403/);
  assert.doesNotMatch(route('#/courses/c1'), /Practical requirements/);
});
await test('Approved students see the published activity on their course page', () => {
  as('u_s1'); assert.match(route('#/courses/c1'), /Practical requirements/);
  assert.match(route('#/learn/' + id), /Discover the real user need/);
});
await test('Teacher preview completion does not create student progress', () => {
  as('u_t1'); route('#/learn/' + id);
  submit('pc-quiz', { choice: '1' }); act('pc-complete');
  assert.equal(run('(state.db.interactiveProgress||[]).length'), 0);
  as('u_s1'); route('#/learn/' + id);
  assert.equal(run('PDFCOURSE.progressFor(state.db.interactiveCourses[0]).completed.length'), 0);
});
await test('Knowledge check and completion require an actual valid answer', () => {
  act('pc-complete'); assert.equal(run('PDFCOURSE.sessionUI().error'), 'lesson.quizNeeded');
  submit('pc-quiz', {}); assert.equal(run('PDFCOURSE.sessionUI().error'), 'lesson.choose');
  submit('pc-quiz', { choice: '0' }); assert.match(nodes.app.innerHTML, /Give it another try/);
  act('pc-complete'); assert.equal(run('PDFCOURSE.sessionUI().error'), 'lesson.quizNeeded');
});
await test('Correct answers advance the learner and save progress', () => {
  submit('pc-quiz', { choice: '1' }); act('pc-complete');
  submit('pc-quiz', { choice: '2' }); act('pc-complete');
  assert.equal(run('PDFCOURSE.progressFor(state.db.interactiveCourses[0]).completed.length'), 2);
  assert.match(nodes.app.innerHTML, /Turn needs into acceptance criteria/);
});
await test('The final lesson requires a reviewed scenario response', () => {
  submit('pc-quiz', { choice: '0' }); act('pc-complete');
  assert.equal(run('PDFCOURSE.sessionUI().error'), 'lesson.scenarioNeeded');
  submit('pc-scenario', { response: 'Too short' });
  assert.equal(run('PDFCOURSE.sessionUI().error'), 'lesson.responseRequired');
});
await test('Scenario feedback is a transparent local checklist', () => {
  submit('pc-scenario', { response: 'Ask the student and cafe owner whether preparation has started before cancellation, then update the order status and explain the refund exception.' });
  assert.match(nodes.app.innerHTML, /does not judge factual correctness/);
  assert.ok(json('state.db.interactiveProgress[0].scenario["unit-3"]').every(item => item.found));
  act('pc-complete'); assert.match(nodes.app.innerHTML, /A little learning, put into practice/);
  assert.equal(run('state.db.interactiveProgress[0].completed.length'), 3);
});
await test('Completed progress survives loading the saved database', () => {
  run('state.db=MOCK.load(); PDFCOURSE.reset();');
  assert.match(route('#/learn/' + id), /3 of 3 lessons complete/);
});
await test('Another approved student starts with separate progress', () => {
  as('u_s3'); route('#/learn/' + id);
  assert.equal(run('PDFCOURSE.progressFor(state.db.interactiveCourses[0]).completed.length'), 0);
  assert.match(nodes.app.innerHTML, /0 of 3 lessons complete/);
});
await test('Saved edits leave the published student snapshot untouched', () => {
  as('u_t1'); route('#/teacher/studio/' + id); input('title', 'Revised requirements course');
  run('PDFCOURSE.saveDraft(false);');
  as('u_s1'); assert.match(route('#/learn/' + id), /Practical requirements/);
  assert.doesNotMatch(nodes.app.innerHTML, /Revised requirements course/);
  assert.equal(run('state.db.interactiveCourses[0].revision'), 1);
});
await test('Republishing changed content creates a new progress version', () => {
  as('u_t1'); route('#/teacher/studio/' + id); run('PDFCOURSE.saveDraft(true);');
  as('u_s1'); route('#/learn/' + id);
  assert.match(nodes.app.innerHTML, /Revised requirements course/);
  assert.equal(run('state.db.interactiveCourses[0].revision'), 2);
  assert.equal(run('PDFCOURSE.progressFor(state.db.interactiveCourses[0]).completed.length'), 0);
  assert.equal(run('state.db.interactiveProgress[0].completed.length'), 3);
});
await test('Publishing unchanged content does not reset progress versions', () => {
  as('u_t1'); route('#/teacher/studio/' + id); run('PDFCOURSE.saveDraft(true);');
  assert.equal(run('state.db.interactiveCourses[0].revision'), 2);
});
await test('User-provided text is escaped in student pages', () => {
  as('u_t1'); route('#/teacher/studio/' + id); input('title', '<img src=x onerror=alert(1)>');
  run('PDFCOURSE.saveDraft(true);'); as('u_s1');
  const html = route('#/learn/' + id); assert.match(html, /&lt;img/); assert.doesNotMatch(html, /<img src=x/);
});
await test('Browser quota failure does not falsely report a saved draft', () => {
  as('u_t1'); route('#/teacher/studio/' + id); input('title', 'Quota test');
  const before = run('JSON.stringify(state.db.interactiveCourses)');
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  try {
    assert.equal(run('PDFCOURSE.saveDraft(false)'), null);
    assert.equal(run('PDFCOURSE.sessionUI().error'), 'studio.storageError');
    assert.equal(run('JSON.stringify(state.db.interactiveCourses)'), before);
  } finally { localStorage.setItem = original; }
});
await test('Logout cancels an in-flight generation and clears teacher input', async () => {
  act('pc-new'); act('pc-sample');
  const pending = run('PDFCOURSE.generate(options)');
  act('logout'); as('u_t2'); route('#/teacher/studio');
  assert.equal(await pending, false);
  assert.equal(run('PDFCOURSE.sessionUI().draft'), null);
  assert.equal(run('PDFCOURSE.sessionUI().source'), null);
});
await test('An interactive draft cannot be published into a draft parent course', async () => {
  as('u_t2'); act('pc-sample');
  context.draftOptions = { ...options, courseId: 'c4' };
  assert.equal(await run('PDFCOURSE.generate(draftOptions)'), true);
  assert.ok(run('PDFCOURSE.saveDraft(false)'));
  assert.equal(run('PDFCOURSE.saveDraft(true)'), null);
  assert.equal(run('PDFCOURSE.sessionUI().error'), 'studio.hostNotPublished');
});
await test('Reset demo data clears interactive courses and saved progress', () => {
  act('resetDemo'); assert.equal(run('(state.db.interactiveCourses||[]).length'), 0);
  assert.equal(run('(state.db.interactiveProgress||[]).length'), 0);
  assert.equal(run('PDFCOURSE.sessionUI().draft'), null);
});
await test('The quick-entry identity is consumed once so later reloads respect the selected user', () => {
  context.URL = URL;
  window.location.search = '?user=u_t1&lang=zh&once=1';
  window.location.href = 'file:///demo/index.html?user=u_t1&lang=zh&once=1#/teacher/studio';
  let rewritten;
  window.history = { replaceState(_, __, value) { rewritten = value; window.location.search = new URL(value).search; } };
  run('boot();');
  assert.equal(run('state.user.id'), 'u_t1');
  assert.ok(!new URL(rewritten).searchParams.has('user'));
  assert.ok(!new URL(rewritten).searchParams.has('once'));
  localStorage.setItem('coursehub.demo.session', 'u_s1');
  run('state.user=null; boot();');
  assert.equal(run('state.user.id'), 'u_s1');
});

console.log(`\nPDF course tests: ${passed} passed, ${failed} failed.`);
if (failed) process.exitCode = 1;
