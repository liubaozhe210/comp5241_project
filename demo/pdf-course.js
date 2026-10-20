/* Local PDF-to-course workflow. The selected PDF is validated, not parsed. */
/* global PDF_COURSE_CONTENT, state, t, esc, icon, pageHead, viewError, courseById,
   canSeeCourse, isTeacherOf, go, render, uid, nowIso, fmtSize, MOCK, toast */
const PDFCOURSE = (function () {
  let ui = null;
  let token = 0;
  const copy = function (value) { return JSON.parse(JSON.stringify(value)); };
  const records = function () { return state.db.interactiveCourses || []; };
  const byId = function (id) { return records().find(function (r) { return r.id === id; }); };
  const language = function () { return state.locale === 'zh' ? 'zh' : 'en'; };
  const ownCourses = function () {
    return state.db.courses.filter(function (c) { return isTeacherOf(c) && c.status !== 'archived'; });
  };

  function sessionUI() {
    const owner = state.user ? state.user.id : null;
    if (!ui || ui.owner !== owner) {
      if (ui && ui.fileUrl && typeof URL !== 'undefined') URL.revokeObjectURL(ui.fileUrl);
      token += 1;
      const courses = ownCourses();
      ui = {
        owner: owner, phase: 'source', source: null, fileUrl: '', error: '', busy: false,
        busyStep: 0, draft: null, loadedId: null, active: -1, dirty: false,
        readerId: '', readerIndex: 0, readerDone: false, preview: null,
        setup: { courseId: courses[0] ? courses[0].id : '', topic: 'requirements',
          level: 'beginner', language: language(), title: '', goal: '', quiz: true, scenario: true },
      };
    }
    return ui;
  }

  function reset() {
    if (ui && ui.fileUrl && typeof URL !== 'undefined') URL.revokeObjectURL(ui.fileUrl);
    ui = null;
    token += 1;
  }

  function canEdit(record) {
    const parent = record && courseById(record.courseId);
    return !!(state.user && state.user.status === 'active' && record &&
      record.teacherId === state.user.id && parent && isTeacherOf(parent) && parent.status !== 'archived');
  }

  function canRead(record) {
    if (!record || !state.user || state.user.status !== 'active') return false;
    const parent = courseById(record.courseId);
    if (!parent) return false;
    if (state.user.role === 'admin' || isTeacherOf(parent)) return true;
    return state.user.role === 'student' && parent.status !== 'draft' &&
      record.status === 'published' && !!record.publishedContent && canSeeCourse(parent);
  }

  function note() {
    return '<div class="pc-note">' + icon('info') + '<span>' + esc(t('studio.note')) + '</span></div>';
  }

  function message() {
    return ui.error ? '<div class="form-error pc-error" role="alert">' + esc(t(ui.error)) + '</div>' : '';
  }

  function steps() {
    const current = ui.phase === 'source' ? 0 : ui.phase === 'published' ? 2 : 1;
    return '<ol class="pc-steps">' + ['studio.step1', 'studio.step2', 'studio.step3'].map(function (key, i) {
      return '<li class="' + (i === current ? 'current' : i < current ? 'done' : '') + '"' +
        (i === current ? ' aria-current="step"' : '') + '><span>' + (i < current ? icon('check') : i + 1) + '</span>' + esc(t(key)) + '</li>';
    }).join('') + '</ol>';
  }

  function field(label, name, value, multiline, extra) {
    const attrs = ' data-studio="' + name + '" ' + (extra || '');
    return '<div class="field"><label for="pc-' + name + '">' + esc(t(label)) + '</label>' +
      (multiline ? '<textarea id="pc-' + name + '" class="textarea" maxlength="4000"' + attrs + '>' + esc(value) + '</textarea>'
        : '<input id="pc-' + name + '" class="input" maxlength="180" value="' + esc(value) + '"' + attrs + '>') + '</div>';
  }

  function setupSelect(label, name, values) {
    return '<div class="field"><label for="pc-setup-' + name + '">' + esc(t(label)) + '</label>' +
      '<select class="select" id="pc-setup-' + name + '" name="' + name + '" data-studio-setup="' + name + '">' +
      values.map(function (v) { return '<option value="' + esc(v[0]) + '"' + (ui.setup[name] === v[0] ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join('') + '</select></div>';
  }

  function sourceCard() {
    const ready = ui.source;
    return '<section class="card pc-source-card"><div class="pc-source-art">' +
      '<div class="pc-sheet pc-sheet-back"></div><div class="pc-sheet"><span class="pc-sheet-tag">PDF</span>' +
      '<span class="pc-sheet-line"></span><span class="pc-sheet-line"></span><span class="pc-sheet-line short"></span>' +
      '<div class="pc-sheet-symbol">' + icon(ready ? 'check' : 'file') + '</div></div>' +
      '<span class="pc-art-label">' + esc(t('studio.sourceLabel')) + '</span></div>' +
      '<div class="card-body"><div class="pc-kicker">' + esc(t('studio.source')) + '</div>' +
      '<h2>' + esc(ready ? ready.name : t('studio.dropTitle')) + '</h2>' +
      '<p class="muted small">' + esc(ready ? t('studio.sourceNotice') : t('studio.dropBody')) + '</p>' +
      (ready ? '<div class="pc-source-meta"><span class="badge badge-ok">' + icon('check') + esc(t(ready.kind === 'sample' ? 'studio.sampleBadge' : 'studio.fileBadge')) + '</span>' +
        (ready.size ? '<span class="small muted">' + fmtSize(ready.size) + '</span>' : '') + '</div>' : '') +
      '<div class="pc-source-actions"><label class="btn btn-ghost pc-file-label">' + icon('upload') + esc(t(ready ? 'studio.changeFile' : 'studio.choose')) +
      '<input type="file" accept=".pdf,application/pdf" id="pc-pdf-file" aria-label="' + esc(t('studio.choose')) + '"></label>' +
      '<button class="btn btn-ghost" data-act="pc-sample">' + esc(t('studio.sample')) + '</button></div>' +
      (ui.fileUrl ? '<a class="small" href="' + esc(ui.fileUrl) + '" target="_blank" rel="noopener">' + esc(t('studio.previewPdf')) + ' ↗</a>' : '') +
      '<p class="hint">' + esc(t('studio.fileHint')) + '</p></div></section>';
  }

  function viewSetup() {
    const s = ui.setup;
    const courses = ownCourses();
    if (!courses.length) return '<div class="card"><div class="card-body stack"><p>' + esc(t('studio.noCourses')) + '</p>' +
      '<a class="btn" href="#/teacher/new">' + esc(t('nav.createCourse')) + '</a></div></div>';
    const topics = ['requirements', 'agents', 'testing'].map(function (topic) { return [topic, t('studio.topic.' + topic)]; });
    const levels = ['beginner', 'intermediate'].map(function (level) { return [level, t('studio.level.' + level)]; });
    return message() + '<div class="pc-setup-grid">' + sourceCard() +
      '<section class="card"><div class="card-head"><h2>' + esc(t('studio.setup')) + '</h2></div><div class="card-body">' +
      '<form data-form="pc-generate" class="stack">' +
      setupSelect('studio.target', 'courseId', courses.map(function (c) { return [c.id, c.code + ' · ' + c.name]; })) +
      setupSelect('studio.topic', 'topic', topics) +
      '<div class="field"><label for="pc-setup-title">' + esc(t('studio.courseTitle')) + '</label><input id="pc-setup-title" class="input" name="title" data-studio-setup="title" maxlength="180" value="' + esc(s.title) + '" placeholder="' + esc(PDF_COURSE_CONTENT[s.language][s.topic].title) + '"></div>' +
      '<div class="grid grid-2">' + setupSelect('studio.level', 'level', levels) + setupSelect('studio.language', 'language', [['en', 'English'], ['zh', '简体中文']]) + '</div>' +
      '<div class="field"><label for="pc-setup-goal">' + esc(t('studio.goal')) + '</label><textarea id="pc-setup-goal" class="textarea pc-goal" name="goal" data-studio-setup="goal" maxlength="400" placeholder="' + esc(t('studio.goalPh')) + '">' + esc(s.goal) + '</textarea></div>' +
      '<fieldset class="pc-activity-options"><legend>' + esc(t('studio.activities')) + '</legend>' +
      '<label><input type="checkbox" name="quiz" data-studio-setup="quiz"' + (s.quiz ? ' checked' : '') + '>' + icon('check') + esc(t('studio.quizOption')) + '</label>' +
      '<label><input type="checkbox" name="scenario" data-studio-setup="scenario"' + (s.scenario ? ' checked' : '') + '>' + icon('users') + esc(t('studio.scenarioOption')) + '</label></fieldset>' +
      '<button class="btn pc-generate" type="submit">' + icon('spark') + esc(t('studio.generate')) + ' →</button>' +
      '</form></div></section></div>' +
      '<div class="pc-benefits"><div><strong>' + esc(t('studio.outcomeTitle')) + '</strong><p>' + esc(t('studio.outcomeBody')) + '</p></div>' +
      '<span>' + icon('layers') + esc(t('studio.lessonCount')) + '</span><span>' + icon('shield') + esc(t('studio.reviewFirst')) + '</span></div>' + library();
  }

  function library() {
    const mine = records().filter(function (r) { return r.teacherId === state.user.id && canEdit(r); });
    return '<section class="pc-library"><div class="pc-section-head"><h2>' + esc(t('studio.library')) + '</h2><span class="badge badge-grey">' + mine.length + '</span></div>' +
      (mine.length ? mine.map(function (r) {
        const c = courseById(r.courseId);
        return '<div class="pc-library-row card"><span class="pc-library-icon">' + icon('layers') + '</span><div><strong>' + esc(r.content.title) + '</strong><p class="small muted">' + esc(c.code) + ' · ' + esc(t('studio.lessonCount')) + '</p></div>' +
          '<span class="badge ' + (r.status === 'published' ? 'badge-ok' : 'badge-warn') + '">' + esc(t(r.status === 'published' ? 'studio.published' : 'studio.draft')) + '</span>' +
          '<a class="btn btn-ghost btn-sm" href="#/teacher/studio/' + esc(r.id) + '" data-act="pc-open-edit" data-id="' + esc(r.id) + '">' + esc(t('studio.edit')) + '</a></div>';
      }).join('') : '<p class="muted small">' + esc(t('studio.libraryEmpty')) + '</p>') + '</section>';
  }

  function viewBusy() {
    return '<section class="card pc-busy" aria-live="polite" aria-busy="true"><span class="pc-busy-mark">' + icon('spark') + '</span>' +
      '<h2>' + esc(t('studio.generating')) + '</h2><p>' + esc(ui.source.name) + '</p><div class="pc-progress"><span style="width:' + ((ui.busyStep + 1) / 3 * 100) + '%"></span></div>' +
      '<p class="muted">' + esc(t('studio.generating' + ui.busyStep)) + '</p><p class="hint">' + esc(t('studio.note')) + '</p></section>';
  }

  function outline(content, reading, progress) {
    const active = reading ? ui.readerIndex : ui.active;
    return '<aside class="pc-outline card"><div class="pc-kicker">' + esc(t(reading ? 'lesson.contents' : 'studio.outline')) + '</div>' +
      (!reading ? '<button class="pc-outline-item' + (active === -1 ? ' active' : '') + '" data-act="pc-edit-unit" data-index="-1">' + icon('grid') + '<span>' + esc(t('studio.summary')) + '</span></button>' : '') +
      content.lessons.map(function (lesson, i) {
        const done = progress && progress.completed.indexOf(lesson.id) !== -1;
        return '<button class="pc-outline-item' + (i === active ? ' active' : '') + '" data-act="' + (reading ? 'pc-read-unit' : 'pc-edit-unit') + '" data-index="' + i + '">' +
          '<span class="pc-unit-number' + (done ? ' complete' : '') + '">' + (done ? icon('check') : String(i + 1).padStart(2, '0')) + '</span><span>' + esc(lesson.title) + '</span></button>';
      }).join('') + '<div class="pc-outline-foot">' + icon('file') + '<span>' + esc(content.source.name) + '</span></div></aside>';
  }

  function viewEditor() {
    const d = ui.draft;
    const c = d.content;
    let body;
    if (ui.active === -1) {
      body = '<h2 class="pc-editor-title">' + esc(t('studio.summary')) + '</h2>' + field('studio.courseTitle', 'title', c.title) +
        '<div class="pc-kicker">' + esc(t('studio.goals')) + '</div>' + c.goals.map(function (goal, i) { return field('studio.goal', 'goals.' + i, goal); }).join('') +
        '<div class="pc-editor-facts"><span>' + icon('layers') + esc(t('studio.lessonCount')) + '</span><span>' + esc(c.language === 'zh' ? '简体中文' : 'English') + '</span>' +
        '<span>' + esc(t('studio.level.' + c.level)) + '</span></div>';
    } else {
      const i = ui.active;
      const lesson = c.lessons[i];
      const prefix = 'lessons.' + i + '.';
      body = '<div class="pc-kicker">' + esc(t('lesson.number', { number: i + 1 })) + '</div>' +
        field('studio.lessonTitle', prefix + 'title', lesson.title) + field('studio.intro', prefix + 'lead', lesson.lead, true) +
        field('studio.body', prefix + 'body', lesson.body, true) + field('studio.example', prefix + 'example', lesson.example, true);
      if (lesson.quiz) {
        body += '<div class="pc-editor-divider">' + icon('check') + esc(t('studio.quizOption')) + '</div>' +
          field('studio.question', prefix + 'quiz.question', lesson.quiz.question, true) +
          lesson.quiz.options.map(function (option, j) { return field('studio.option', prefix + 'quiz.options.' + j, option); }).join('') +
          '<div class="field"><label for="pc-correct">' + esc(t('studio.correct')) + '</label><select id="pc-correct" class="select" data-studio="' + prefix + 'quiz.correct">' +
          lesson.quiz.options.map(function (_, j) { return '<option value="' + j + '"' + (lesson.quiz.correct === j ? ' selected' : '') + '>' + esc(t('studio.option')) + ' ' + (j + 1) + '</option>'; }).join('') + '</select></div>' +
          field('studio.explanation', prefix + 'quiz.explanation', lesson.quiz.explanation, true);
      }
      if (lesson.scenario) body += '<div class="pc-editor-divider">' + icon('users') + esc(t('studio.scenarioOption')) + '</div>' +
        field('studio.challengeTitle', prefix + 'scenario.title', lesson.scenario.title) + field('studio.challengePrompt', prefix + 'scenario.prompt', lesson.scenario.prompt, true) +
        field('studio.sampleAnswer', prefix + 'scenario.sample', lesson.scenario.sample, true) +
        lesson.scenario.criteria.map(function (criterion, j) {
          return field('studio.criterion', prefix + 'scenario.criteria.' + j + '.0', criterion[0]) +
            field('studio.keywords', prefix + 'scenario.criteria.' + j + '.1', criterion[1].join(', '));
        }).join('');
    }
    const changed = d.publishedContent && JSON.stringify(d.content) !== JSON.stringify(d.publishedContent);
    return message() + '<div class="pc-editor-heading"><div><h2>' + esc(t('studio.reviewTitle')) + '</h2><p class="small muted">' + esc(t('studio.reviewBody')) + '</p></div>' +
      '<span class="badge badge-warn">' + esc(t(changed ? 'studio.pendingChanges' : d.status === 'published' ? 'studio.published' : 'studio.draft')) + '</span></div>' +
      '<div class="pc-editor-grid">' + outline(c, false) + '<section class="card pc-editor-panel"><div class="card-body stack">' + body + '</div></section></div>' +
      '<div class="pc-editor-actions"><button class="btn btn-ghost" data-act="pc-back">' + icon('back') + esc(t('studio.back')) + '</button><span class="spacer"></span>' +
      '<button class="btn btn-ghost" data-act="pc-save">' + esc(t('studio.save')) + '</button><button class="btn btn-ghost" data-act="pc-preview">' + icon('eye') + esc(t('studio.preview')) + '</button>' +
      '<button class="btn" data-act="pc-publish">' + icon('upload') + esc(t('studio.publish')) + '</button></div><p class="hint pc-publish-note">' + esc(t('studio.publishNote')) + '</p>';
  }

  function viewPublished() {
    const d = ui.draft;
    const parent = courseById(d.courseId);
    return '<section class="card pc-success"><span class="pc-success-mark">' + icon('check') + '</span><div class="pc-kicker">' + esc(t('studio.published')) + '</div>' +
      '<h2>' + esc(t('studio.successTitle')) + '</h2><p class="muted">' + esc(t('studio.successBody', { course: parent.code + ' · ' + parent.name })) + '</p>' +
      '<div class="pc-success-course"><span class="pc-library-icon">' + icon('layers') + '</span><div><strong>' + esc(d.content.title) + '</strong><p class="small muted">' + esc(t('studio.lessonCount')) + ' · ' + esc(t('lesson.version', { version: d.revision })) + '</p></div></div>' +
      '<div class="row"><a class="btn" href="#/learn/' + esc(d.id) + '">' + icon('eye') + esc(t('studio.preview')) + '</a><a class="btn btn-ghost" href="#/courses/' + esc(d.courseId) + '">' + esc(t('studio.openCourse')) + '</a>' +
      '<button class="btn btn-ghost" data-act="pc-open-edit" data-id="' + esc(d.id) + '">' + esc(t('studio.edit')) + '</button>' +
      '<button class="btn btn-ghost" data-act="pc-new">' + esc(t('studio.new')) + '</button></div></section>' + library();
  }

  function viewStudio(params) {
    sessionUI();
    if (!state.user || state.user.role !== 'teacher') return viewError(403);
    if (params && params.id && ui.loadedId !== params.id) {
      const record = byId(params.id);
      if (!record) return viewError(404);
      if (!canEdit(record)) return viewError(403);
      token += 1;
      ui.busy = false;
      ui.draft = copy(record);
      ui.source = copy(record.content.source);
      ui.setup = { courseId: record.courseId, topic: record.content.topic, language: record.content.language,
        level: record.content.level, title: record.content.title, goal: record.content.teachingGoal || '',
        quiz: record.content.lessons.some(function (lesson) { return !!lesson.quiz; }),
        scenario: record.content.lessons.some(function (lesson) { return !!lesson.scenario; }) };
      ui.loadedId = record.id;
      ui.phase = 'review';
      ui.active = -1;
      ui.dirty = false;
      ui.error = '';
    }
    if (ui.draft && !canEdit(ui.draft)) return viewError(403);
    return '<div class="page pc-studio"><div class="pc-kicker">' + esc(t('studio.eyebrow')) + '</div>' +
      pageHead(t('studio.title'), t('studio.subtitle')) + steps() + note() +
      (ui.busy ? viewBusy() : ui.phase === 'source' ? viewSetup() : ui.phase === 'published' ? viewPublished() : viewEditor()) + '</div>';
  }

  async function validateFile(file) {
    if (!file || !file.size) throw new Error('studio.badPdf');
    if (file.size > 20 * 1024 * 1024) throw new Error('studio.bigPdf');
    let bytes;
    try { bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer()); }
    catch (_) { throw new Error('studio.readError'); }
    if (String.fromCharCode.apply(null, bytes) !== '%PDF-') throw new Error('studio.badPdf');
    return { name: String(file.name).slice(0, 220), size: file.size, kind: 'file' };
  }

  function buildDraft(options, source) {
    const langs = ['en', 'zh'];
    const topics = ['requirements', 'agents', 'testing'];
    if (!source) throw new Error('studio.noSource');
    if (!options || langs.indexOf(options.language) === -1 || topics.indexOf(options.topic) === -1 ||
        ['beginner', 'intermediate'].indexOf(options.level) === -1 || (!options.quiz && !options.scenario)) throw new Error('studio.missing');
    const data = PDF_COURSE_CONTENT[options.language][options.topic];
    const parent = courseById(options.courseId);
    if (!parent || !isTeacherOf(parent) || parent.status === 'archived') throw new Error('errors.forbidden');
    const goals = data.goals.slice();
    if (options.goal && options.goal.trim()) goals.unshift(options.goal.trim().slice(0, 400));
    return {
      id: uid('ic'), teacherId: state.user.id, courseId: parent.id, status: 'draft', revision: 0,
      publishedContent: null, createdAt: nowIso(), updatedAt: nowIso(),
      content: { title: String(options.title || '').trim().slice(0, 180) || data.title, language: options.language,
        teachingGoal: String(options.goal || '').trim().slice(0, 400),
        level: options.level, topic: options.topic, source: copy(source), goals: goals,
        lessons: data.units.map(function (unit, i) {
          return { id: 'unit-' + (i + 1), title: unit[0], lead: unit[1],
            body: unit[2] + (options.level === 'intermediate' ? '\n\n' + PDF_COURSE_CONTENT[options.language].advanced : ''), example: unit[3],
            quiz: options.quiz ? { question: unit[4], options: unit[5].slice(), correct: unit[6], explanation: unit[7] } : null,
            scenario: options.scenario && i === data.units.length - 1 ? copy(data.challenge) : null };
        }),
      },
    };
  }

  async function generate(options) {
    sessionUI();
    if (ui.busy) return false;
    let draft;
    try { draft = buildDraft(options, ui.source); }
    catch (error) { ui.error = error.message; render(); return false; }
    const owner = ui.owner;
    const job = ++token;
    ui.setup = copy(options);
    ui.busy = true;
    ui.error = '';
    for (let step = 0; step < 3; step += 1) {
      if (job !== token || !state.user || state.user.id !== owner || state.user.role !== 'teacher') return false;
      ui.busyStep = step;
      render();
      await new Promise(function (resolve) { setTimeout(resolve, 280); });
    }
    if (job !== token || !state.user || state.user.id !== owner || !canEdit(draft)) return false;
    ui.draft = draft;
    ui.loadedId = draft.id;
    ui.phase = 'review';
    ui.active = -1;
    ui.dirty = true;
    ui.busy = false;
    go('#/teacher/studio');
    render();
    return true;
  }

  function validContent(c) {
    const filled = function (s) { return typeof s === 'string' && !!s.trim(); };
    return filled(c.title) && c.goals.every(filled) && c.lessons.length === 3 && c.lessons.every(function (lesson) {
      return [lesson.title, lesson.lead, lesson.body, lesson.example].every(filled) &&
        (!lesson.quiz || ([lesson.quiz.question, lesson.quiz.explanation].every(filled) && lesson.quiz.options.length === 3 &&
          lesson.quiz.options.every(filled) && Number.isInteger(lesson.quiz.correct) && lesson.quiz.correct >= 0 && lesson.quiz.correct < 3)) &&
        (!lesson.scenario || ([lesson.scenario.title, lesson.scenario.prompt, lesson.scenario.sample].every(filled) &&
          lesson.scenario.criteria.every(function (criterion) { return filled(criterion[0]) && criterion[1].length > 0 && criterion[1].every(filled); })));
    });
  }

  function writeDb(next) {
    try { localStorage.setItem(MOCK.KEY, JSON.stringify(next)); }
    catch (_) { ui.error = 'studio.storageError'; return false; }
    state.db = next;
    if (state.user) state.user = next.users.find(function (user) { return user.id === state.user.id; }) || null;
    MOCK.save(next);
    return true;
  }

  function saveDraft(publish) {
    sessionUI();
    if (!canEdit(ui.draft)) { ui.error = 'errors.forbidden'; return null; }
    if (!validContent(ui.draft.content)) { ui.error = 'studio.incomplete'; return null; }
    if (publish && courseById(ui.draft.courseId).status !== 'published') { ui.error = 'studio.hostNotPublished'; return null; }
    const old = byId(ui.draft.id);
    if (old && old.teacherId !== state.user.id) { ui.error = 'errors.forbidden'; return null; }
    const record = copy(ui.draft);
    record.updatedAt = nowIso();
    record.publishedContent = old ? copy(old.publishedContent) : null;
    record.revision = old ? old.revision : 0;
    record.status = old ? old.status : 'draft';
    if (publish) {
      if (JSON.stringify(record.publishedContent) !== JSON.stringify(record.content)) record.revision += 1;
      record.publishedContent = copy(record.content);
      record.status = 'published';
      record.publishedAt = nowIso();
    }
    const next = copy(state.db);
    next.interactiveCourses = next.interactiveCourses || [];
    const index = next.interactiveCourses.findIndex(function (r) { return r.id === record.id; });
    if (index === -1) next.interactiveCourses.push(record);
    else next.interactiveCourses[index] = record;
    next.seq += 1;
    next.audit.unshift({ id: 'a_' + next.seq, actorId: state.user.id, action: 'actUpdateCourse',
      target: record.content.title + (publish ? ' [published]' : ' [draft]'), at: nowIso() });
    if (!writeDb(next)) return null;
    ui.draft = copy(record);
    ui.loadedId = record.id;
    ui.error = '';
    ui.dirty = false;
    ui.phase = publish ? 'published' : 'review';
    go('#/teacher/studio/' + record.id);
    return record;
  }

  function progressFor(record) {
    sessionUI();
    const preview = state.user.role !== 'student';
    const key = state.user.id + ':' + record.id + ':' + record.revision;
    if (preview) {
      const contentKey = JSON.stringify(record.content);
      if (!ui.preview || ui.preview.key !== key || ui.preview.contentKey !== contentKey) ui.preview = {
        key: key, contentKey: contentKey, completed: [], quiz: {}, scenario: {}, responses: {}, choices: {},
      };
      return ui.preview;
    }
    return copy((state.db.interactiveProgress || []).find(function (p) { return p.key === key; }) ||
      { key: key, userId: state.user.id, courseId: record.id, revision: record.revision, completed: [], quiz: {}, scenario: {}, responses: {}, choices: {} });
  }

  function saveProgress(record, progress) {
    if (!canRead(record)) return false;
    if (state.user.role !== 'student') { ui.preview = progress; return true; }
    const next = copy(state.db);
    next.interactiveProgress = next.interactiveProgress || [];
    const index = next.interactiveProgress.findIndex(function (p) { return p.key === progress.key; });
    if (index === -1) next.interactiveProgress.push(progress);
    else next.interactiveProgress[index] = progress;
    return writeDb(next);
  }

  function readerRecord() {
    const match = currentHash().match(/^#\/learn\/([\w-]+)$/);
    return match ? byId(match[1]) : null;
  }

  function readerContent(record) { return state.user.role === 'student' ? record.publishedContent : record.content; }

  function viewReader(params) {
    sessionUI();
    const record = byId(params.id);
    if (!record) return viewError(404);
    if (!canRead(record)) return viewError(403);
    const content = readerContent(record);
    const progress = currentProgress(record);
    if (ui.readerId !== record.id) {
      ui.readerId = record.id;
      ui.readerIndex = content.lessons.findIndex(function (unit) { return progress.completed.indexOf(unit.id) === -1; });
      if (ui.readerIndex === -1) ui.readerIndex = 0;
      ui.readerDone = progress.completed.length === content.lessons.length;
    }
    const preview = state.user.role !== 'student';
    const lesson = content.lessons[ui.readerIndex];
    const q = progress.quiz[lesson.id];
    const response = progress.responses[lesson.id] || '';
    const checked = progress.scenario[lesson.id];
    let body;
    if (ui.readerDone && progress.completed.length === content.lessons.length) {
      body = '<section class="card pc-finish"><span class="pc-success-mark">' + icon('check') + '</span><div class="pc-kicker">' + esc(t(preview ? 'lesson.previewDone' : 'lesson.complete')) + '</div>' +
        '<h2>' + esc(t('lesson.doneTitle')) + '</h2><p class="muted">' + esc(t('lesson.doneBody')) + '</p><div class="pc-finish-stat">3 / 3</div></section>';
    } else {
      body = '<article class="card pc-reading" lang="' + content.language + '"><div class="card-body"><div class="pc-kicker">' + esc(t('lesson.number', { number: ui.readerIndex + 1 })) + '</div>' +
        '<h2>' + esc(lesson.title) + '</h2><p class="pc-lead">' + esc(lesson.lead) + '</p><div class="pc-prose">' + esc(lesson.body) + '</div>' +
        '<div class="pc-worked"><div class="pc-kicker">' + icon('spark') + esc(t('lesson.example')) + '</div><p>' + esc(lesson.example) + '</p></div>';
      if (lesson.quiz) body += '<section class="pc-quiz"><div class="pc-kicker">' + icon('check') + esc(t('lesson.quiz')) + '</div><h3>' + esc(lesson.quiz.question) + '</h3>' +
        '<form data-form="pc-quiz"><fieldset class="pc-choices"><legend class="pc-sr-only">' + esc(lesson.quiz.question) + '</legend>' + lesson.quiz.options.map(function (option, i) {
          return '<label class="pc-choice' + (q && q.choice === i ? q.correct ? ' correct' : ' incorrect' : '') + '"><input type="radio" name="choice" value="' + i + '" data-studio-choice="' + lesson.id + '"' +
            (progress.choices[lesson.id] === i ? ' checked' : '') + '><span>' + String.fromCharCode(65 + i) + '</span><span>' + esc(option) + '</span></label>';
        }).join('') + '</fieldset><button class="btn btn-ghost" type="submit">' + esc(t('lesson.check')) + '</button></form>' +
        (q ? '<div class="pc-feedback' + (q.correct ? ' correct' : '') + '" role="status"><strong>' + esc(t(q.correct ? 'lesson.correct' : 'lesson.incorrect')) + '</strong><p>' + esc(lesson.quiz.explanation) + '</p></div>' : '') + '</section>';
      if (lesson.scenario) body += '<section class="pc-scenario"><div class="pc-kicker">' + icon('users') + esc(t('lesson.scenario')) + '</div><h3>' + esc(lesson.scenario.title) + '</h3><p>' + esc(lesson.scenario.prompt) + '</p>' +
        '<form data-form="pc-scenario" class="stack"><div class="field"><label for="pc-response">' + esc(t('lesson.yourResponse')) + '</label><textarea id="pc-response" class="textarea" name="response" data-studio-response="' + lesson.id + '" maxlength="3000" placeholder="' + esc(t('lesson.responsePh')) + '">' + esc(response) + '</textarea></div>' +
        '<div><button class="btn btn-ghost" type="submit">' + esc(t('lesson.checkResponse')) + '</button></div></form>' +
        (checked ? '<div class="pc-feedback correct"><p class="small muted">' + esc(t('lesson.feedbackNote')) + '</p><ul>' + checked.map(function (item) {
          return '<li>' + icon(item.found ? 'check' : 'info') + '<strong>' + esc(item.label) + '</strong> · ' + esc(t(item.found ? 'lesson.mentioned' : 'lesson.consider')) + '</li>';
        }).join('') + '</ul><details><summary>' + esc(t('lesson.compare')) + '</summary><p>' + esc(lesson.scenario.sample) + '</p></details></div>' : '') + '</section>';
      body += '<div class="pc-reading-footer"><span class="hint">' + esc(t(preview ? 'lesson.preview' : 'lesson.saved')) + '</span><button class="btn" data-act="pc-complete">' +
        esc(t(ui.readerIndex === content.lessons.length - 1 ? 'lesson.finish' : 'lesson.next')) + ' →</button></div></div></article>';
    }
    return '<div class="page pc-reader">' + pageHead(content.title, t('lesson.sectionBody'), '<a class="btn btn-ghost btn-sm" href="' + (preview && state.user.role === 'teacher' ? '#/teacher/studio/' + record.id : '#/courses/' + record.courseId) + '"' +
      (preview && state.user.role === 'teacher' ? ' data-act="pc-open-edit" data-id="' + esc(record.id) + '"' : '') + '>' + icon('back') + esc(t(preview && state.user.role === 'teacher' ? 'lesson.backEditor' : 'lesson.backCourse')) + '</a>') +
      (preview ? '<div class="pc-note">' + icon('eye') + esc(t('lesson.preview')) + '</div>' : '') + message() +
      '<div class="pc-reader-progress"><span>' + esc(t('lesson.progress', { done: progress.completed.length, total: content.lessons.length })) + '</span><div class="pc-progress"><span style="width:' + (progress.completed.length / content.lessons.length * 100) + '%"></span></div><span class="hint">' + esc(t('lesson.version', { version: record.revision || 1 })) + '</span></div>' +
      '<div class="pc-reader-grid">' + outline(content, true, progress) + '<div class="stack">' +
      '<section class="pc-objectives"><span class="pc-kicker">' + esc(t('lesson.overview')) + '</span><ul>' + content.goals.map(function (goal) { return '<li>' + esc(goal) + '</li>'; }).join('') + '</ul></section>' + body + '</div></div></div>';
  }

  function courseSection(parent) {
    sessionUI();
    if (!canSeeCourse(parent)) return '';
    const mine = records().filter(function (r) { return r.courseId === parent.id && canRead(r); });
    if (!mine.length && !isTeacherOf(parent)) return '';
    return '<section class="card pc-course-section"><div class="card-head"><h2>' + esc(t('lesson.section')) + '</h2><span class="spacer"></span>' +
      (isTeacherOf(parent) && parent.status !== 'archived' ? '<a class="small" href="#/teacher/studio">' + esc(t('studio.nav')) + ' →</a>' : '') + '</div><div class="card-body">' +
      (mine.length ? mine.map(function (r) {
        const c = state.user.role === 'student' ? r.publishedContent : r.content;
        const p = progressFor(r);
        return '<div class="pc-course-row"><div><strong>' + esc(c.title) + '</strong><p class="small muted">' + esc(t('studio.lessonCount')) + ' · ' + esc(t('lesson.progress', { done: p.completed.length, total: 3 })) + '</p></div>' +
          '<a class="btn btn-sm" href="#/learn/' + esc(r.id) + '">' + esc(t(state.user.role !== 'student' ? 'studio.preview' : p.completed.length ? 'lesson.continue' : 'lesson.open')) + ' →</a></div>';
      }).join('') : '<p class="small muted">' + esc(t('lesson.empty')) + '</p>') + '</div></section>';
  }

  function handleInput(event) {
    const target = event.target;
    const setup = target.getAttribute('data-studio-setup');
    const path = target.getAttribute('data-studio');
    const response = target.getAttribute('data-studio-response');
    const choice = target.getAttribute('data-studio-choice');
    if (!setup && !path && !response && !choice) return false;
    sessionUI();
    if (setup && Object.prototype.hasOwnProperty.call(ui.setup, setup)) ui.setup[setup] = target.type === 'checkbox' ? target.checked : target.value;
    if (path && ui.draft && canEdit(ui.draft) && /^(title|goals\.\d+|lessons\.\d+\.(title|lead|body|example|quiz\.(question|explanation|correct|options\.\d+)|scenario\.(title|prompt|sample|criteria\.\d+\.[01])))$/.test(path)) {
      const parts = path.split('.');
      let obj = ui.draft.content;
      parts.slice(0, -1).forEach(function (key) { obj = obj[key]; });
      obj[parts[parts.length - 1]] = /\.criteria\.\d+\.1$/.test(path)
        ? target.value.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean)
        : path.endsWith('.correct') ? Number(target.value) : target.value;
      ui.dirty = true;
    }
    if (response || choice) {
      const record = readerRecord();
      if (record && canRead(record)) {
        const progress = currentProgress(record);
        if (response) {
          progress.responses[response] = target.value.slice(0, 3000);
          delete progress.scenario[response];
          progress.completed = progress.completed.filter(function (id) { return id !== response; });
        } else progress.choices[choice] = Number(target.value);
        // Response drafts stay in memory until a check or completion is saved.
        if (state.user.role !== 'student') ui.preview = progress;
        else {
          ui.responseDraft = ui.responseDraft || {};
          ui.responseDraft[progress.key] = progress;
        }
      }
    }
    return true;
  }

  function currentProgress(record) {
    const stored = progressFor(record);
    return state.user.role === 'student' && ui.responseDraft && ui.responseDraft[stored.key] ? ui.responseDraft[stored.key] : stored;
  }

  function handleChange(event) {
    const target = event.target;
    if (target.id === 'pc-pdf-file') {
      sessionUI();
      const file = target.files && target.files[0];
      if (!file) return true;
      const owner = ui.owner;
      const job = ++token;
      ui.source = null;
      if (ui.fileUrl) URL.revokeObjectURL(ui.fileUrl);
      ui.fileUrl = '';
      validateFile(file).then(function (source) {
        if (!state.user || state.user.id !== owner || job !== token) return;
        if (ui.fileUrl) URL.revokeObjectURL(ui.fileUrl);
        ui.source = source;
        ui.fileUrl = URL.createObjectURL(file);
        ui.error = '';
        render();
      }).catch(function (error) {
        if (state.user && state.user.id === owner && job === token) {
          ui.source = null;
          ui.error = error.message;
          render();
        }
      });
      return true;
    }
    return handleInput(event);
  }

  function handleAct(act, data) {
    if (act.indexOf('pc-') !== 0) return false;
    sessionUI();
    ui.error = '';
    if (act === 'pc-read-unit' || act === 'pc-complete') {
      const record = readerRecord();
      if (!record || !canRead(record)) return true;
      const content = readerContent(record);
      const progress = currentProgress(record);
      if (act === 'pc-read-unit') {
        const index = Number(data.index);
        if (Number.isInteger(index) && index >= 0 && index < content.lessons.length) { ui.readerIndex = index; ui.readerDone = false; }
      } else {
        const lesson = content.lessons[ui.readerIndex];
        if (lesson.quiz && !(progress.quiz[lesson.id] && progress.quiz[lesson.id].correct)) ui.error = 'lesson.quizNeeded';
        else if (lesson.scenario && !progress.scenario[lesson.id]) ui.error = 'lesson.scenarioNeeded';
        else {
          if (progress.completed.indexOf(lesson.id) === -1) progress.completed.push(lesson.id);
          if (saveProgress(record, progress)) {
            const nextIndex = content.lessons.findIndex(function (unit) { return progress.completed.indexOf(unit.id) === -1; });
            if (nextIndex === -1) ui.readerDone = true;
            else ui.readerIndex = nextIndex;
          }
        }
      }
      render();
      return true;
    }
    if (!state.user || state.user.role !== 'teacher' || state.user.status !== 'active') return true;
    if (act === 'pc-open-edit') {
      const record = byId(data.id);
      if (!record || !canEdit(record)) return true;
      ui.loadedId = null;
      ui.phase = 'review';
      go('#/teacher/studio/' + record.id);
    } else if (act === 'pc-sample') {
      token += 1;
      if (ui.fileUrl) URL.revokeObjectURL(ui.fileUrl);
      ui.fileUrl = '';
      ui.source = { name: t('studio.sampleName'), kind: 'sample', size: 246000 };
    } else if (act === 'pc-new') {
      if (ui.fileUrl) URL.revokeObjectURL(ui.fileUrl);
      ui = null;
      sessionUI();
      go('#/teacher/studio');
    } else if (act === 'pc-edit-unit') {
      const index = Number(data.index);
      if (ui.draft && canEdit(ui.draft) && Number.isInteger(index) && index >= -1 && index < 3) ui.active = index;
    } else if (act === 'pc-back') { ui.phase = 'source'; }
    else if (act === 'pc-save' || act === 'pc-preview' || act === 'pc-publish') {
      const record = saveDraft(act === 'pc-publish');
      if (record && act === 'pc-preview') { ui.readerId = ''; go('#/learn/' + record.id); }
      if (record && act === 'pc-save') toast(t('studio.saved'), 'ok');
    }
    render();
    return true;
  }

  function handleSubmit(form) {
    const type = form.getAttribute('data-form');
    if (type.indexOf('pc-') !== 0) return false;
    sessionUI();
    ui.error = '';
    const fd = new FormData(form);
    if (type === 'pc-generate') {
      if (!state.user || state.user.role !== 'teacher') return true;
      ['courseId', 'topic', 'title', 'level', 'language', 'goal'].forEach(function (key) { ui.setup[key] = String(fd.get(key) || '').trim(); });
      ui.setup.quiz = fd.get('quiz') !== null;
      ui.setup.scenario = fd.get('scenario') !== null;
      generate(copy(ui.setup)).catch(function () { ui.busy = false; ui.error = 'studio.readError'; render(); });
    } else {
      const record = readerRecord();
      if (!record || !canRead(record)) return true;
      const lesson = readerContent(record).lessons[ui.readerIndex];
      const progress = currentProgress(record);
      if (type === 'pc-quiz' && lesson.quiz) {
        const choice = fd.get('choice');
        if (choice === null || !/^[0-2]$/.test(String(choice))) ui.error = 'lesson.choose';
        else {
          progress.choices[lesson.id] = Number(choice);
          progress.quiz[lesson.id] = { choice: Number(choice), correct: Number(choice) === lesson.quiz.correct };
          if (!progress.quiz[lesson.id].correct) progress.completed = progress.completed.filter(function (id) { return id !== lesson.id; });
          if (saveProgress(record, progress) && ui.responseDraft) delete ui.responseDraft[progress.key];
        }
      } else if (type === 'pc-scenario' && lesson.scenario) {
        const answer = String(fd.get('response') || '').trim().slice(0, 3000);
        if (answer.replace(/\s/g, '').length < 30) ui.error = 'lesson.responseRequired';
        else {
          progress.responses[lesson.id] = answer;
          progress.scenario[lesson.id] = lesson.scenario.criteria.map(function (criterion) {
            return { label: criterion[0], found: criterion[1].some(function (word) { return answer.toLowerCase().indexOf(word.toLowerCase()) !== -1; }) };
          });
          if (saveProgress(record, progress) && ui.responseDraft) delete ui.responseDraft[progress.key];
        }
      }
      render();
    }
    return true;
  }

  return { viewStudio, viewReader, courseSection, handleAct, handleSubmit, handleInput, handleChange,
    buildDraft, validateFile, generate, saveDraft, canRead, progressFor, sessionUI, reset };
})();
