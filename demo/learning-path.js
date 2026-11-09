/* Local prototype only. No AI requests and no course-authoring duplication. */
const LP_KEY = 'coursehub.demo.learningPaths.v1.';
const lpMemory = Object.create(null);
const lpVolatile = Object.create(null);
const lpDrafts = Object.create(null);
const lpExpanded = Object.create(null);
const lpQuizDrafts = Object.create(null);
const lpStorageWarnings = Object.create(null);

function lpStudent() { return state.user && state.user.role === 'student' && state.user.status === 'active'; }
function lpValidPlan(p, studentId) {
  return p && p.studentId === studentId && Number.isInteger(p.version) && p.version > 0 &&
    typeof p.topic === 'string' && typeof p.goal === 'string' && ['beginner', 'intermediate', 'advanced'].includes(p.level) &&
    Number.isFinite(p.hours) && p.hours >= 1 && p.hours <= 200 && Array.isArray(p.stages) && p.stages.length >= 3 && p.stages.length <= 5 &&
    p.stages.every(function (s) {
      return s && ['foundation', 'practice', 'apply', 'review', 'extend'].includes(s.kind) && Array.isArray(s.tasks) && s.tasks.length >= 2 &&
        s.tasks.every(function (task) { return task && typeof task.id === 'string' && ['study', 'exercise', 'review', 'practice', 'challenge'].includes(task.type) && typeof task.done === 'boolean' && Number.isInteger(task.minutes) && task.minutes > 0; }) &&
        (s.courseIds === undefined || (Array.isArray(s.courseIds) && s.courseIds.every(function (id) { return typeof id === 'string'; }))) &&
        (s.adjustments === undefined || (Array.isArray(s.adjustments) && s.adjustments.every(function (a) {
          return a && Number.isInteger(a.attemptIndex) && a.attemptIndex >= 0 && ['review', 'practice', 'challenge'].includes(a.type) && typeof a.taskId === 'string' && typeof a.at === 'string' && Number.isInteger(a.minutes) && a.minutes > 0;
        }))) &&
        Array.isArray(s.attempts) && s.attempts.every(function (a) {
          if (!a || !Number.isInteger(a.score) || a.score < 0 || a.score > 3 || typeof a.at !== 'string') return false;
          if (a.bankId === undefined) return true; // Keep original method-only records readable.
          const bank = LearningPathAssessment.getBank(a.bankId);
          return !!bank && a.maxScore === 3 && Array.isArray(a.answers) && a.answers.length === 3 &&
            a.answers.every(function (answer) { return Number.isInteger(answer) && answer >= 0 && answer < 3; }) &&
            LearningPathAssessment.grade(a.bankId, a.answers, a.at).score === a.score;
        });
    });
}
function lpLoad() {
  if (!lpStudent()) return { versions: [] };
  const id = state.user.id;
  if (lpVolatile[id] && lpMemory[id]) return lpMemory[id];
  try {
    const raw = localStorage.getItem(LP_KEY + id);
    if (raw) {
      const db = JSON.parse(raw);
      if (db.schema !== 1 || !Array.isArray(db.versions) || !db.versions.every(function (p) { return lpValidPlan(p, id); })) throw new Error('Invalid learning path data');
      lpMemory[id] = db;
      delete lpStorageWarnings[id];
      return db;
    }
    // A successful empty read means another tab may have reset the plan.
    delete lpMemory[id];
    delete lpStorageWarnings[id];
  } catch (e) { lpStorageWarnings[id] = true; }
  return lpMemory[id] || { schema: 1, versions: [] };
}
function lpSave(db) {
  if (!lpStudent()) return;
  lpMemory[state.user.id] = db;
  try {
    localStorage.setItem(LP_KEY + state.user.id, JSON.stringify(db));
    delete lpVolatile[state.user.id];
    delete lpStorageWarnings[state.user.id];
  }
  catch (e) { lpVolatile[state.user.id] = true; lpStorageWarnings[state.user.id] = true; toast(t('lp.storageWarning'), 'err'); }
}
function resetLearningPaths() {
  // Reset all student paths, including accounts created during this demo.
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(LP_KEY) === 0) keys.push(key);
    }
    keys.forEach(function (key) { localStorage.removeItem(key); });
    // Also supports the minimal storage used by smoke tests.
    state.db.users.forEach(function (u) { localStorage.removeItem(LP_KEY + u.id); });
  } catch (e) { if (state.user) lpStorageWarnings[state.user.id] = true; }
  Object.keys(lpMemory).forEach(function (id) { delete lpMemory[id]; });
  Object.keys(lpVolatile).forEach(function (id) { delete lpVolatile[id]; });
  Object.keys(lpDrafts).forEach(function (id) { delete lpDrafts[id]; });
  Object.keys(lpExpanded).forEach(function (id) { delete lpExpanded[id]; });
  Object.keys(lpQuizDrafts).forEach(function (id) { delete lpQuizDrafts[id]; });
}
function lpCurrent(db) { return db.versions[db.versions.length - 1]; }
function lpProgress(tasks) {
  const done = tasks.filter(function (task) { return task.done; }).length;
  return { done: done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}
function lpAllTasks(plan) { return plan.stages.reduce(function (all, stage) { return all.concat(stage.tasks); }, []); }
function lpMeter(tasks, label) {
  const p = lpProgress(tasks);
  return '<div class="small">' + esc(label) + ' <strong>' + p.percent + '%</strong> · ' + p.done + ' / ' + p.total + '</div>' +
    '<progress class="lp-progress" max="100" value="' + p.percent + '" aria-label="' + esc(label) + '">' + p.percent + '%</progress>';
}
function lpGenerate(input, version) {
  return LearningPathMockService.generate(input, { studentId: state.user.id, version: version, createdAt: nowIso(), courses: state.db.courses });
}
function lpStageKey(plan, index) { return state.user.id + ':' + plan.version + ':' + index; }
function lpStageOpen(plan, index) {
  const key = lpStageKey(plan, index);
  return Object.prototype.hasOwnProperty.call(lpExpanded, key) ? lpExpanded[key] : index === 0;
}
function lpStageCourses(plan, stage) {
  // Older saved versions have only a plan-level course link.
  const ids = stage.courseIds || (plan.courseId ? [plan.courseId] : []);
  return '<div class="lp-stage-courses"><h3>' + t('lp.stageCourses') + '</h3>' +
    (ids.length ? ids.map(lpCourseLink).join('') : '<p class="small muted">' + t('lp.noMatch') + '</p>') + '</div>';
}
function lpNotice() {
  return '<div class="lp-note">' + t('lp.demo') + '</div>' +
    (state.user && lpStorageWarnings[state.user.id] ? '<p role="alert" class="lp-note">' + t('lp.storageWarning') + '</p>' : '');
}
function viewLearningPathForm() {
  const db = lpLoad();
  const previous = currentHash() === '#/learning-path/edit' ? lpCurrent(db) : null;
  const draftKey = state.user.id + currentHash();
  const p = lpDrafts[draftKey] || previous || { topic: '', goal: '', level: 'beginner', hours: 10, courseId: '' };
  const baseVersion = p.baseVersion !== undefined ? p.baseVersion : lpCurrent(db) ? lpCurrent(db).version : 0;
  function field(name, label, control) { return '<div class="field"><label for="lp-' + name + '">' + t(label) + '</label>' + control + '</div>'; }
  return '<div class="page lp-page lp-form">' + pageHead(t(previous ? 'lp.edit' : 'lp.create'), t('lp.formIntro'),
    '<a class="btn btn-ghost btn-sm" href="#/learning-path">' + t('common.back') + '</a>') +
    '<div class="stack">' + lpNotice() + '<form class="card card-body" data-form="learningPath">' +
    '<input type="hidden" name="baseVersion" value="' + esc(baseVersion) + '">' +
    field('topic', 'lp.topic', '<input class="input" id="lp-topic" name="topic" maxlength="120" required value="' + esc(p.topic) + '">') +
    field('goal', 'lp.goal', '<textarea class="textarea" id="lp-goal" name="goal" maxlength="1000" required>' + esc(p.goal) + '</textarea>') +
    '<div class="grid grid-2">' + field('level', 'lp.level', '<select class="select" id="lp-level" name="level">' +
      ['beginner', 'intermediate', 'advanced'].map(function (level) { return '<option value="' + level + '"' + (p.level === level ? ' selected' : '') + '>' + t('lp.' + level) + '</option>'; }).join('') + '</select>') +
    field('hours', 'lp.hours', '<input class="input" id="lp-hours" name="hours" type="number" min="1" max="200" step="0.5" required value="' + esc(p.hours) + '">') + '</div>' +
    field('course', 'lp.course', '<select class="select" id="lp-course" name="courseId"><option value="">' + t('lp.noCourse') + '</option>' +
      visibleCourses().map(function (c) { return '<option value="' + esc(c.id) + '"' + (p.courseId === c.id ? ' selected' : '') + '>' + esc(c.code + ' · ' + c.name) + '</option>'; }).join('') + '</select>') +
    '<p class="small muted">' + t('lp.versionNote') + '</p><div class="row" style="margin-top:18px"><button class="btn" type="submit">' + icon('spark') + ' ' + t('lp.generate') + '</button></div></form></div></div>';
}
function lpText(pair) { return pair[state.locale === 'zh' ? 1 : 0]; }
function lpTaskTitle(stage, task) {
  return t(['study', 'exercise'].includes(task.type) ? 'lp.task.' + stage.kind + '.' + task.type : 'lp.adaptTask.' + task.type);
}
function lpAdvice(plan, stage, index, archived) {
  const attempt = stage.attempts[stage.attempts.length - 1];
  const progress = lpProgress(stage.tasks);
  let key = 'lp.adviceStart';
  if (progress.done > 0) key = 'lp.adviceContinue';
  if (attempt) key = attempt.score <= 1 ? 'lp.adviceReview' : attempt.score === 2 ? 'lp.advicePractice' : progress.percent === 100 ? 'lp.adviceAdvance' : 'lp.adviceFinish';
  const type = LearningPathAssessment.recommendation(stage);
  const attemptIndex = stage.attempts.length - 1;
  const applied = (stage.adjustments || []).some(function (a) { return a.attemptIndex === attemptIndex; });
  const pending = type && stage.tasks.some(function (task) { return task.type === type && !task.done; });
  const bank = attempt && LearningPathAssessment.getBank(attempt.bankId);
  return '<div class="lp-advice"><h3>' + t('lp.adaptive') + '</h3><p>' + t(key) + '</p>' +
    '<p class="small muted">' + (attempt ? esc(t('lp.assessmentEvidence', { title: bank ? lpText(bank.title) : t('lp.legacyCheck'), score: attempt.score, date: fmtDateTime(attempt.at) })) : t('lp.noEvidence')) + '</p>' +
    (type && !archived ? '<div class="row" style="margin:10px 0"><button type="button" class="btn btn-sm" data-act="lpApplyAdvice" data-version="' + plan.version + '" data-stage="' + index + '" data-attempt="' + attemptIndex + '"' + (applied || pending ? ' disabled' : '') + '>' + t(applied ? 'lp.applied' : pending ? 'lp.pendingAdvice' : 'lp.applyAdvice') + '</button><span class="small muted">' + t('lp.extraTime', { n: { review: 15, practice: 20, challenge: 30 }[type] }) + '</span></div>' : '') +
    (stage.adjustments && stage.adjustments.length ? '<p class="small">' + esc(t('lp.adjustmentCount', { n: stage.adjustments.length })) + '</p>' : '') +
    '<button class="btn btn-ghost btn-sm" type="button" data-act="lpFocus" data-stage="' + index + '">' + t('lp.tasks') + '</button></div>';
}
function lpQuizFeedback(attempt) {
  const bank = LearningPathAssessment.getBank(attempt.bankId);
  if (!bank || !attempt.answers) return '<p class="small muted">' + t('lp.legacyCheck') + ' · ' + attempt.score + '/3</p>';
  return '<div class="lp-quiz-result" role="status"><h3>' + esc(t('lp.result', { score: attempt.score })) + '</h3><p class="small muted">' + esc(lpText(bank.title)) + ' · ' + fmtDateTime(attempt.at) + '</p>' +
    bank.questions.map(function (q, i) {
      const correct = attempt.answers[i] === q.correct;
      return '<div class="lp-question-feedback"><strong>' + (i + 1) + '. ' + esc(lpText(q.prompt)) + '</strong> <span class="badge ' + (correct ? 'badge-ok' : 'badge-warn') + '">' + t(correct ? 'lp.correct' : 'lp.incorrect') + '</span>' +
        '<p>' + t('lp.yourAnswer') + ': ' + esc(lpText(q.options[attempt.answers[i]])) + '</p><p>' + t('lp.correctAnswer') + ': ' + esc(lpText(q.options[q.correct])) + '</p><p>' + esc(lpText(q.explanation)) + '</p>' +
        '<span class="small muted">' + esc(lpText(q.concept)) + '</span></div>';
    }).join('') + '</div>';
}
function lpQuiz(plan, stage, stageIndex, archived) {
  const last = stage.attempts[stage.attempts.length - 1];
  const bank = LearningPathAssessment.selectBank(plan, stage, state.db.courses);
  const draftKey = lpStageKey(plan, stageIndex) + ':' + bank.id + ':' + stage.attempts.length;
  const draft = lpQuizDrafts[draftKey] || {};
  let html = '<details class="lp-quiz"' + (last || Object.keys(draft).length ? ' open' : '') + '><summary>' + t(bank.kind === 'knowledge' ? 'lp.knowledgeCheck' : 'lp.check') + ' · ' + esc(lpText(bank.title)) + (last ? ' · ' + last.score + '/3' : '') + '</summary>';
  html += '<p class="small muted">' + t(bank.kind === 'knowledge' ? 'lp.knowledgeNote' : 'lp.noKnowledgeBank') + '</p>';
  if (last) html += lpQuizFeedback(last);
  if (!archived) html += '<form data-form="learningPathQuiz">' +
    '<input type="hidden" name="version" value="' + plan.version + '"><input type="hidden" name="stage" value="' + stageIndex + '"><input type="hidden" name="bankId" value="' + bank.id + '"><input type="hidden" name="attemptCount" value="' + stage.attempts.length + '">' +
    bank.questions.map(function (question, q) {
      // Rotate choices so correct answers do not always occupy the same position.
      const choices = [0, 1, 2].map(function (i) { return (i + q + stageIndex) % 3; });
      return '<fieldset><legend>' + (q + 1) + '. ' + esc(lpText(question.prompt)) + '</legend>' + choices.map(function (choice) {
        return '<label class="lp-option"><input required type="radio" name="q' + q + '" value="' + choice + '"' + (draft['q' + q] === String(choice) ? ' checked' : '') + '><span>' + esc(lpText(question.options[choice])) + '</span></label>';
      }).join('') + '</fieldset>';
    }).join('') + '<button class="btn btn-ghost btn-sm" type="submit">' + t('lp.submitCheck') + '</button></form></details>';
  else html += '</details>';
  html += stage.attempts.length ? '<details class="lp-attempt-history"><summary>' + t('lp.attemptHistory', { n: stage.attempts.length }) + '</summary>' + stage.attempts.slice().reverse().map(function (a) {
    const b = LearningPathAssessment.getBank(a.bankId);
    return '<p class="small">' + fmtDateTime(a.at) + ' · ' + esc(b ? lpText(b.title) : t('lp.legacyCheck')) + ' · ' + a.score + '/3</p>';
  }).join('') + '</details>' : '';
  return html;
}
function viewLearningPath(params) {
  const db = lpLoad();
  const current = lpCurrent(db);
  const plan = params && params.version ? db.versions.find(function (p) { return p.version === Number(params.version); }) : current;
  if (params && params.version && !plan) return viewError(404);
  const actions = '<a class="btn btn-sm" href="#/learning-path/' + (plan ? 'edit' : 'new') + '">' + t(plan ? 'lp.edit' : 'lp.create') + '</a>';
  let content = pageHead(t('lp.title'), t('lp.subtitle'), actions);
  if (!plan) return '<div class="page lp-page stack">' + content + lpNotice() + '<div class="card">' + emptyState(t('lp.empty'), t('lp.emptyBody'), 'layers') +
    '<div class="card-body row"><a class="btn" href="#/learning-path/new">' + t('lp.create') + '</a></div></div></div>';
  const archived = plan !== current;
  content += lpNotice();
  if (archived) content += '<div class="lp-note">' + t('lp.archived') + ' <a href="#/learning-path">' + t('lp.current') + '</a></div>';
  const tasks = lpAllTasks(plan);
  const totalMinutes = tasks.reduce(function (sum, task) { return sum + task.minutes; }, 0);
  content += '<section class="card card-body lp-summary"><div><div class="lp-stats"><span class="badge badge-brand">' + t('lp.version', { n: plan.version }) + '</span><span class="badge badge-grey">' + t('lp.' + plan.level) + '</span><span class="badge badge-grey">' + t('lp.budget', { n: plan.hours }) + '</span></div>' +
    '<h2 class="lp-topic">' + esc(plan.topic) + '</h2><p class="lp-goal">' + esc(plan.goal) + '</p>' + lpMeter(tasks, t('lp.overall')) + '</div><div>' +
    '<h3>' + t('lp.next') + '</h3><p class="small muted" style="margin:10px 0">' + t(lpProgress(tasks).percent === 100 ? 'lp.finished' : 'lp.nextBody') + '</p>' +
    (lpProgress(tasks).percent < 100 ? '<button class="btn btn-ghost btn-sm" data-act="lpNext" type="button">' + t('lp.continue') + '</button>' : '') +
    (plan.courseId ? lpCourseLink(plan.courseId) : '<p class="small muted">' + t('lp.independent') + '</p>') + '</div></section>';
  if (totalMinutes > plan.hours * 60) content += '<div class="lp-note">' + esc(t('lp.adjustedBudget', { original: plan.hours, extra: totalMinutes - plan.hours * 60, total: totalMinutes })) + '</div>';
  content += '<div class="row lp-stage-controls"><span class="small muted">' + t('lp.stageCount', { n: plan.stages.length }) + '</span><span class="spacer"></span><button type="button" class="btn btn-ghost btn-sm" data-act="lpExpandAll">' + t('lp.expandAll') + '</button><button type="button" class="btn btn-ghost btn-sm" data-act="lpCollapseAll">' + t('lp.collapseAll') + '</button></div>';
  content += plan.stages.map(function (stage, index) {
    const open = lpStageOpen(plan, index);
    return '<section class="card card-body lp-stage" id="lp-stage-' + index + '"><div class="lp-stage-head"><span class="lp-stage-number">' + (index + 1) + '</span><div class="lp-stage-heading"><h2 class="lp-stage-title">' + t('lp.stage.' + stage.kind) + '</h2><p class="small muted">' + esc(plan.topic) + ' · ' + t('lp.minutes', { n: stage.tasks.reduce(function (sum, task) { return sum + task.minutes; }, 0) }) + '</p></div><button id="lp-stage-toggle-' + index + '" type="button" class="btn btn-ghost btn-sm" data-act="lpStageToggle" data-stage="' + index + '" aria-expanded="' + open + '" aria-controls="lp-stage-body-' + index + '">' + t(open ? 'lp.collapse' : 'lp.expand') + '</button></div>' +
      lpMeter(stage.tasks, t('lp.stageProgress')) + '<div id="lp-stage-body-' + index + '"' + (open ? '' : ' hidden') + '>' + lpStageCourses(plan, stage) + '<h3 class="lp-task-heading">' + t('lp.tasks') + '</h3><div style="margin-top:16px">' + stage.tasks.map(function (task) {
        const added = !['study', 'exercise'].includes(task.type);
        return '<div class="lp-task' + (task.done ? ' lp-task-done' : '') + '"><button id="lp-task-' + esc(task.id) + '" class="btn btn-ghost lp-check" type="button" data-act="lpToggle" data-task="' + esc(task.id) + '" data-version="' + plan.version + '" aria-pressed="' + task.done + '" aria-label="' + esc(t(task.done ? 'lp.undo' : 'lp.complete') + ': ' + lpTaskTitle(stage, task)) + '"' + (archived ? ' disabled' : '') + '>' + icon(task.done ? 'check' : 'plus') + '</button><div class="lp-task-copy"><strong>' + lpTaskTitle(stage, task) + '</strong>' + (added ? ' <span class="badge badge-brand">' + t('lp.addedTask') + '</span>' : '') + '<p>' + esc(t(added ? 'lp.adaptDetail.' + task.type : task.type === 'study' ? 'lp.studyFocus' : 'lp.exerciseFocus', { topic: plan.topic, goal: plan.goal })) + '</p><span class="badge badge-grey">' + t('lp.minutes', { n: task.minutes }) + '</span> <span class="small muted">' + t(task.done ? 'lp.done' : 'lp.todo') + '</span></div></div>';
      }).join('') + '</div>' + lpAdvice(plan, stage, index, archived) + lpQuiz(plan, stage, index, archived) + lpAdjustmentHistory(stage) + '</div></section>';
  }).join('');
  content += '<section class="card card-body"><h2>' + t('lp.history') + '</h2><div class="lp-history stack">' + db.versions.slice().reverse().map(function (p) {
    return '<div class="row"><a href="#/learning-path/version/' + p.version + '">' + t('lp.version', { n: p.version }) + ' · ' + esc(p.topic) + '</a><span class="small muted">' + fmtDate(p.createdAt) + (p === current ? ' · ' + t('lp.current') : '') + '</span></div>';
  }).join('') + '</div></section>';
  return '<div class="page lp-page stack">' + content + '</div>';
}
function lpCourseLink(id) {
  const course = courseById(id);
  if (!course || course.status !== 'published') return '<p class="small muted">' + t('lp.unavailable') + '</p>';
  return '<div style="margin-top:18px"><a class="btn btn-ghost btn-sm" href="#/courses/' + esc(course.id) + '">' + esc(course.code + ' · ' + course.name) + ' →</a><p class="small muted">' + t(canSeeCourse(course) ? 'lp.courseReady' : 'lp.courseLocked') + '</p></div>';
}
function lpAdjustmentHistory(stage) {
  if (!stage.adjustments || !stage.adjustments.length) return '';
  return '<details class="lp-attempt-history"><summary>' + t('lp.adjustments') + '</summary>' + stage.adjustments.map(function (a) {
    return '<p class="small">' + fmtDateTime(a.at) + ' · ' + t('lp.adaptTask.' + a.type) + ' · ' + t('lp.minutes', { n: a.minutes }) + ' · ' + t('lp.basedOnAttempt', { n: a.attemptIndex + 1 }) + '</p>';
  }).join('') + '</details>';
}
function handleLearningPathAct(act, data) {
  if (act.indexOf('lp') !== 0) return false;
  if (!lpStudent()) return true;
  if (act === 'lpFromCourse') {
    const course = courseById(data.id);
    if (!course || course.status !== 'published') return true;
    lpDrafts[state.user.id + '#/learning-path/new'] = { topic: course.name, goal: '', level: 'beginner', hours: 10, courseId: course.id };
    go('#/learning-path/new'); render(); return true;
  }
  if (['lpFocus', 'lpNext', 'lpStageToggle', 'lpExpandAll', 'lpCollapseAll'].includes(act)) {
    const db = lpLoad();
    const versionMatch = currentHash().match(/^#\/learning-path\/version\/(\d+)$/);
    const p = versionMatch ? db.versions.find(function (v) { return v.version === Number(versionMatch[1]); }) : lpCurrent(db);
    if (!p) return true;
    if (act === 'lpExpandAll' || act === 'lpCollapseAll') {
      p.stages.forEach(function (_, i) { lpExpanded[lpStageKey(p, i)] = act === 'lpExpandAll'; });
      render(); return true;
    }
    let index = act === 'lpFocus' ? Number(data.stage) : p.stages.findIndex(function (s) { return s.tasks.some(function (task) { return !task.done; }); });
    if (act === 'lpStageToggle') index = Number(data.stage);
    if (index < 0) index = 0;
    if (!Number.isInteger(index) || !p.stages[index]) return true;
    lpExpanded[lpStageKey(p, index)] = act === 'lpStageToggle' ? !lpStageOpen(p, index) : true;
    render();
    if (act === 'lpStageToggle') {
      const toggle = document.getElementById('lp-stage-toggle-' + index);
      if (toggle && toggle.focus) toggle.focus();
      return true;
    }
    const el = document.getElementById('lp-stage-' + index);
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return true;
  }
  const db = lpLoad();
  const p = lpCurrent(db);
  if (!p || Number(data.version) !== p.version) return true;
  if (act === 'lpApplyAdvice') {
    const index = Number(data.stage);
    if (!Number.isInteger(index) || !p.stages[index] || !/^\d+$/.test(String(data.attempt))) return true;
    const task = LearningPathAssessment.apply(p.stages[index], p.version, index, Number(data.attempt), nowIso());
    if (!task) { toast(t('lp.adviceUnavailable'), 'err'); return true; }
    lpExpanded[lpStageKey(p, index)] = true;
    lpSave(db); render(); toast(t('lp.adviceApplied'), 'ok');
    return true;
  }
  if (act === 'lpToggle') {
    const task = lpAllTasks(p).find(function (item) { return item.id === data.task; });
    if (task) {
      task.done = !task.done; task.completedAt = task.done ? nowIso() : null; lpSave(db); render();
      const button = document.getElementById('lp-task-' + task.id);
      if (button && button.focus) button.focus();
    }
  }
  return true;
}
function submitLearningPath(form, type) {
  if (!lpStudent()) return;
  const fd = new FormData(form);
  function value(key) { return String(fd.get(key) || '').trim(); }
  const db = lpLoad();
  const previous = lpCurrent(db);
  if (type === 'learningPath') {
    const input = { topic: value('topic'), goal: value('goal'), level: value('level'), hours: Number(value('hours')), courseId: value('courseId') };
    if (!input.topic || input.topic.length > 120 || !input.goal || input.goal.length > 1000 ||
      !['beginner', 'intermediate', 'advanced'].includes(input.level) || !Number.isFinite(input.hours) || input.hours < 1 || input.hours > 200 || input.hours * 2 % 1 !== 0 ||
      (input.courseId && !visibleCourses().some(function (c) { return c.id === input.courseId; }))) { toast(t('lp.invalid'), 'err'); return; }
    if (Number(value('baseVersion')) !== (previous ? previous.version : 0)) { toast(t('lp.stale'), 'err'); return; }
    db.versions.push(lpGenerate(input, previous ? previous.version + 1 : 1));
    delete lpDrafts[state.user.id + currentHash()];
    lpSave(db); go('#/learning-path'); render(); toast(t('lp.generated'), 'ok');
  } else {
    const index = Number(value('stage'));
    if (!previous || Number(value('version')) !== previous.version || !Number.isInteger(index) || !previous.stages[index]) return;
    const answers = [value('q0'), value('q1'), value('q2')];
    if (!answers.every(function (a) { return ['0', '1', '2'].includes(a); })) { toast(t('lp.answerAll'), 'err'); return; }
    const stage = previous.stages[index];
    const bank = LearningPathAssessment.selectBank(previous, stage, state.db.courses);
    if ((value('bankId') && value('bankId') !== bank.id) || (value('attemptCount') && Number(value('attemptCount')) !== stage.attempts.length)) {
      toast(t('lp.quizStale'), 'err'); return;
    }
    stage.attempts.push(LearningPathAssessment.grade(bank.id, answers.map(Number), nowIso()));
    delete lpQuizDrafts[lpStageKey(previous, index) + ':' + bank.id + ':' + (stage.attempts.length - 1)];
    lpExpanded[lpStageKey(previous, index)] = true;
    lpSave(db); render(); toast(t('lp.checkSaved'), 'ok');
  }
}

function captureLearningPathDraft(target) {
  const quiz = target.closest && target.closest('form[data-form="learningPathQuiz"]');
  if (quiz && lpStudent()) {
    const data = new FormData(quiz);
    const key = state.user.id + ':' + data.get('version') + ':' + data.get('stage') + ':' + data.get('bankId') + ':' + data.get('attemptCount');
    const draft = {};
    ['q0', 'q1', 'q2'].forEach(function (name) { draft[name] = String(data.get(name) || ''); });
    lpQuizDrafts[key] = draft;
    return true;
  }
  const form = target.closest && target.closest('form[data-form="learningPath"]');
  if (!form || !lpStudent()) return false;
  const fd = new FormData(form);
  const draft = {};
  ['topic', 'goal', 'level', 'hours', 'courseId', 'baseVersion'].forEach(function (key) { draft[key] = String(fd.get(key) || ''); });
  lpDrafts[state.user.id + currentHash()] = draft;
  return true;
}
