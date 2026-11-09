/* ==========================================================================
 * 面试验练模块（实验性，不属于本期交付范围，见 product-design.md 3.3）
 *
 * 独立文件：从 index.html 删掉这三处引用，即可把整个模块从主线移除
 *   <link rel="stylesheet" href="interview.css">
 *   <script src="i18n.interview.js"></script>
 *   <script src="interview.js"></script>
 * 主线只保留 4 处 typeof 守卫挂点，模块缺席时自动降级。
 *
 * 加载顺序：icons.js → i18n.js → i18n.interview.js → data.js
 *           → interview.js → app.js
 * 运行时依赖 app.js 提供的全局：state / t / esc / icon / pageHead /
 *   toast / emptyState / render / go / navLink
 * ========================================================================== */

const INTERVIEW_HISTORY_KEY = 'coursehub.demo.interviewHistory.';

/* 状态槽位：app.js 在 boot 时调用 initInterviewState() 注入 state.ui */
const INTERVIEW_UI_DEFAULTS = {
  interviewJob: 'frontend',
  interviewExperience: 'student',
  interviewBackground: '',
  interviewSkills: '',
  interviewResumeText: '',
  interviewResumeFileName: '',
  interviewResumeEvaluation: null,
  interviewResumeQuestions: null,
  interviewSalaryIndex: 0,
  interviewSalaryAnswer: '',
  interviewSalaryFeedback: '',
  interviewAnswer: '',
  interviewSession: null,
  interviewReviewIndex: null,
  interviewReviewSessionId: null,
  interviewReviewQuestionIndex: null,
  interviewReviewFeedback: '',
  interviewHistory: null,
  interviewHistoryUserId: null,
};

function initInterviewState() {
  Object.keys(INTERVIEW_UI_DEFAULTS).forEach(function (key) {
    state.ui[key] = INTERVIEW_UI_DEFAULTS[key];
  });
}

/* 路由：app.js 的 ROUTES 数组会展开它 */
const INTERVIEW_ROUTES = [
  { name: 'interview', re: /^#\/interview$/, roles: ['student'], view: viewInterview },
  { name: 'interviewResumeEvaluation', re: /^#\/interview\/intro$/, roles: ['student'], view: viewInterviewResumeEvaluation },
  { name: 'interviewResumeQuestions', re: /^#\/interview\/project$/, roles: ['student'], view: viewInterviewResumeQuestions },
  { name: 'interviewSalary', re: /^#\/interview\/salary$/, roles: ['student'], view: viewInterviewSalary },
  { name: 'interviewPrep', re: /^#\/interview\/prep$/, roles: ['student'], view: viewInterviewPrep },
  { name: 'interviewSession', re: /^#\/interview\/session$/, roles: ['student'], view: viewInterviewSession },
  { name: 'interviewReviewSessionAnswer', re: /^#\/interview\/review\/([\w-]+)\/(\d+)$/, roles: ['student'], view: viewInterviewReview, keys: ['sessionId', 'index'] },
  { name: 'interviewReviewAnswer', re: /^#\/interview\/review\/(\d+)$/, roles: ['student'], view: viewInterviewReview, keys: ['index'] },
  { name: 'interviewReview', re: /^#\/interview\/review$/, roles: ['student'], view: viewInterviewReview },
];

/* 学生侧导航入口：app.js 的 sidebar() 按需调用 */
function interviewNavLink() {
return (navLink('interview', '#/interview', t('nav.interview'), icon('spark')));
}

function createInterviewQuestions(profile) {
  return [
    t('interview.q.profile', {
      background: profile.background || t('interview.defaultBackground'),
      experience: t('interview.experience.' + profile.experience),
    }),
    t('interview.q.skills.' + profile.job, {
      skills: profile.skills || t('interview.defaultSkills'),
    }),
    t('interview.q.scenario.' + profile.job),
    t('interview.q.collaboration'),
    t('interview.q.growth.' + profile.experience),
  ];
}

function createInterviewReferenceAnswer(session, index) {
  const profile = session.profile;
  if (index === 0) {
    return t('interview.answer.profile', {
      background: profile.background || t('interview.defaultBackground'),
      job: t('interview.job.' + profile.job),
    });
  }
  if (index === 1) {
    return t('interview.answer.skills.' + profile.job, {
      skills: profile.skills || t('interview.defaultSkills'),
      job: t('interview.job.' + profile.job),
    });
  }
  if (index === 2) return t('interview.answer.scenario.' + profile.job);
  if (index === 3) return t('interview.answer.collaboration');
  if (index === 4) return t('interview.answer.growth.' + profile.experience, {
    job: t('interview.job.' + profile.job),
  });
  return '';
}

function interviewNeedsReview(answer) {
  return typeof answer !== 'string' || answer.replace(/\s/g, '').length < 100;
}

function createInterviewSummary(session) {
  const answers = session.answers;
  const detailedCount = answers.filter(function (answer) {
    return !interviewNeedsReview(answer);
  }).length;
  const measurableCount = answers.filter(function (answer) {
    return typeof answer === 'string' && /\d|%|percent|increased|reduced|improved|result|metric|percentage|提升|增加|减少|降低|结果|指标/.test(answer.toLowerCase());
  }).length;
  return {
    intro: t('interview.summaryIntro', { total: answers.length, detailed: detailedCount }),
    reviewCount: answers.filter(interviewNeedsReview).length,
    strength: t(detailedCount >= Math.ceil(answers.length * 0.6)
      ? 'interview.summaryStrengthDetailed'
      : 'interview.summaryStrengthExamples'),
    evidence: t(measurableCount
      ? 'interview.summaryEvidencePresent'
      : 'interview.summaryEvidenceMissing'),
    nextStep: 'interview.summaryNextStep',
  };
}

function loadInterviewHistory() {
  if (!state.user) return [];
  if (state.ui.interviewHistoryUserId === state.user.id && Array.isArray(state.ui.interviewHistory)) {
    return state.ui.interviewHistory;
  }

  state.ui.interviewHistoryUserId = state.user.id;
  state.ui.interviewHistory = [];
  try {
    const saved = localStorage.getItem(INTERVIEW_HISTORY_KEY + state.user.id);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        state.ui.interviewHistory = parsed.filter(function (session) {
          return session && typeof session.id === 'string' &&
            session.profile && session.profile.job &&
            Array.isArray(session.questions) && Array.isArray(session.answers) &&
            session.index >= session.questions.length;
        });
      } else {
        console.error('Unable to load interview history: expected an array.');
      }
    }
  } catch (error) {
    console.error('Unable to load interview history.', error);
  }
  return state.ui.interviewHistory;
}

function saveCompletedInterviewSession(session) {
  if (!session || session.index < session.questions.length || !state.user) return;
  const history = loadInterviewHistory();
  const existingIndex = history.findIndex(function (item) { return item.id === session.id; });
  if (existingIndex === -1) history.push(session);
  else history[existingIndex] = session;

  try {
    localStorage.setItem(INTERVIEW_HISTORY_KEY + state.user.id, JSON.stringify(history));
  } catch (error) {
    console.error('Unable to save interview history.', error);
  }
}

function getInterviewReviewItems() {
  const history = loadInterviewHistory().slice();
  const activeSession = state.ui.interviewSession;
  if (activeSession && activeSession.index >= activeSession.questions.length &&
      !history.some(function (session) { return session.id === activeSession.id; })) {
    history.push(activeSession);
  }

  const items = [];
  history.forEach(function (session) {
    session.answers.forEach(function (answer, index) {
      if (interviewNeedsReview(answer)) {
        items.push({ session: session, sessionId: session.id, index: index });
      }
    });
  });
  return items;
}

function findInterviewSession(sessionId) {
  const history = loadInterviewHistory();
  const saved = history.filter(function (session) { return session.id === sessionId; })[0];
  if (saved) return saved;
  const activeSession = state.ui.interviewSession;
  return activeSession && activeSession.id === sessionId ? activeSession : null;
}

function decodeXmlText(value) {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

async function extractDocxResumeText(file) {
  if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined') {
    throw new Error(t('interview.resumeDocxUnsupported'));
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endRecord = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endRecord = offset;
      break;
    }
  }
  if (endRecord < 0) throw new Error(t('interview.resumeInvalidDocument'));

  const entries = view.getUint16(endRecord + 10, true);
  let cursor = view.getUint32(endRecord + 16, true);
  const decoder = new TextDecoder();
  let documentXml = null;
  for (let entry = 0; entry < entries; entry += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error(t('interview.resumeInvalidDocument'));
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === 'word/document.xml') {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.slice(dataOffset, dataOffset + compressedSize);
      if (method === 0) documentXml = decoder.decode(compressed);
      else if (method === 8) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        documentXml = decoder.decode(await new Response(stream).arrayBuffer());
      } else throw new Error(t('interview.resumeDocxUnsupported'));
      break;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  if (!documentXml) throw new Error(t('interview.resumeInvalidDocument'));
  const paragraphs = [];
  documentXml.replace(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g, function (_, text) {
    paragraphs.push(decodeXmlText(text));
    return _;
  });
  const text = paragraphs.join(' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error(t('interview.resumeEmptyDocument'));
  return text;
}

async function readInterviewResumeFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (file.size > 2 * 1024 * 1024) throw new Error(t('interview.resumeFileTooLarge'));
  if (extension === 'txt' || extension === 'md') return (await file.text()).trim();
  if (extension === 'docx') return extractDocxResumeText(file);
  throw new Error(t('interview.resumeFormatUnsupported'));
}

function evaluateInterviewResume(text) {
  const normalized = text.toLowerCase();
  const checks = [
    { key: 'interview.resumeCheckContact', test: /@|(\+?\d[\d\s().-]{7,}\d)/.test(text) },
    { key: 'interview.resumeCheckExperience', test: /experience|employment|work history|工作经历|任职|实习经历/.test(normalized) },
    { key: 'interview.resumeCheckProjects', test: /project|项目|作品/.test(normalized) },
    { key: 'interview.resumeCheckSkills', test: /skills|技术栈|技能|tools|工具/.test(normalized) },
    { key: 'interview.resumeCheckImpact', test: /\d+%|\d+\s*(users|customers|用户|客户|件|次)|result|impact|成果|提升|降低/.test(normalized) },
  ];
  const passed = checks.filter(function (check) { return check.test; }).length;
  const recommendations = checks.filter(function (check) { return !check.test; })
    .map(function (check) { return check.key; });
  return {
    score: Math.round((passed / checks.length) * 100),
    summary: passed >= 4 ? 'interview.resumeAssessmentStrong' : 'interview.resumeAssessmentDevelop',
    strengths: [
      text.length >= 500 ? 'interview.resumeStrengthDetail' : 'interview.resumeStrengthConcise',
      checks[3].test ? 'interview.resumeStrengthSkills' : 'interview.resumeStrengthPotential',
    ],
    recommendations: recommendations.length ? recommendations : ['interview.resumeRecommendationTailor'],
  };
}

function createInterviewResumeQuestions(text) {
  const skills = ['JavaScript', 'TypeScript', 'React', 'Python', 'Java', 'SQL', 'Node.js', 'AWS', 'Excel', 'Tableau'];
  const foundSkills = skills.filter(function (skill) {
    return text.toLowerCase().indexOf(skill.toLowerCase()) !== -1;
  }).slice(0, 3);
  const skillText = foundSkills.length ? foundSkills.join(', ') : t('interview.resumeQuestionGenericSkill');
  const hasProjects = /project|项目|作品/i.test(text);
  const hasMetrics = /\d+%|\d+\s*(users|customers|用户|客户|件|次)/i.test(text);
  return [
    { question: t(hasProjects ? 'interview.resumeQuestionProject' : 'interview.resumeQuestionExperience'), advice: 'interview.resumeAnswerAdviceStar' },
    { question: t('interview.resumeQuestionSkills', { skills: skillText }), advice: 'interview.resumeAnswerAdviceEvidence' },
    { question: t(hasMetrics ? 'interview.resumeQuestionMetrics' : 'interview.resumeQuestionChallenge'), advice: 'interview.resumeAnswerAdviceImpact' },
  ];
}

function viewInterview() {
  const reviewCount = getInterviewReviewItems().length;
  const tiles = [
    { href: '#/interview/intro', title: 'interview.sectionIntro', description: 'interview.sectionIntroBody' },
    { href: '#/interview/project', title: 'interview.sectionProject', description: 'interview.sectionProjectBody' },
    { href: '#/interview/salary', title: 'interview.sectionSalary', description: 'interview.sectionSalaryBody' },
    { href: '#/interview/prep', title: 'interview.sectionPrep', description: 'interview.sectionPrepBody' },
  ].map(function (tile) {
    return '<a class="interview-practice-card" href="' + tile.href + '"><h2>' + t(tile.title) +
      '</h2><p>' + t(tile.description) + '</p><span class="btn btn-ghost btn-sm">' +
      t('interview.enterPractice') + ' →</span></a>';
  }).join('');
  const reviewTile = '<div class="interview-practice-card"><h2>' + t('interview.sectionReview') +
    '</h2><p>' + t('interview.reviewHint') + '</p><strong>' +
    t('interview.reviewCountTitle', { count: reviewCount }) + '</strong>' +
    '<a class="btn btn-ghost btn-sm" href="#/interview/review">' +
    t('interview.reviewWrongAnswers') + ' →</a></div>';
  return '<div class="page">' + pageHead(t('interview.title'), t('interview.subtitle')) +
    '<div class="interview-note">' + icon('info') + '<span>' + t('interview.localNote') + '</span></div>' +
    '<section class="stack"><h2>' + t('interview.specialPracticeTitle') + '</h2>' +
      '<div class="interview-practice-grid">' + tiles + reviewTile + '</div>' +
    '</section></div>';
}

function viewInterviewPrep() {
  const jobOptions = ['frontend', 'backend', 'data', 'product', 'marketing'];
  const experienceOptions = ['student', 'earlyCareer', 'careerChange'];
  const profileForm = '<div class="card"><div class="card-head"><h2>' + t('interview.profileTitle') + '</h2></div>' +
    '<div class="card-body"><form data-form="interviewProfile" class="stack">' +
      '<div class="grid grid-2">' +
        '<div class="field"><label for="interviewJob">' + t('interview.job') + '</label>' +
          '<select class="select" id="interviewJob" name="job">' +
            jobOptions.map(function (job) {
              return '<option value="' + job + '"' + (state.ui.interviewJob === job ? ' selected' : '') + '>' + t('interview.job.' + job) + '</option>';
            }).join('') +
          '</select></div>' +
        '<div class="field"><label for="interviewExperience">' + t('interview.experienceLabel') + '</label>' +
          '<select class="select" id="interviewExperience" name="experience">' +
            experienceOptions.map(function (experience) {
              return '<option value="' + experience + '"' + (state.ui.interviewExperience === experience ? ' selected' : '') + '>' + t('interview.experience.' + experience) + '</option>';
            }).join('') +
          '</select></div>' +
      '</div>' +
      '<div class="grid grid-2">' +
        '<div class="field"><label for="interviewBackground">' + t('interview.background') + ' <span class="muted">(' + t('common.optional') + ')</span></label>' +
          '<textarea class="textarea interview-profile-input" id="interviewBackground" name="background" maxlength="160" placeholder="' + t('interview.backgroundPh') + '">' + esc(state.ui.interviewBackground) + '</textarea></div>' +
        '<div class="field"><label for="interviewSkills">' + t('interview.skills') + ' <span class="muted">(' + t('common.optional') + ')</span></label>' +
          '<textarea class="textarea interview-profile-input" id="interviewSkills" name="skills" maxlength="160" placeholder="' + t('interview.skillsPh') + '">' + esc(state.ui.interviewSkills) + '</textarea></div>' +
      '</div>' +
      '<div class="row"><span class="hint">' + t('interview.setupNote') + '</span><span class="spacer"></span>' +
        '<button class="btn" type="submit">' + icon('spark') + ' ' + t('interview.generate') + '</button></div>' +
    '</form></div></div>';

  return '<div class="page">' + pageHead(t('interview.sectionPrep'), t('interview.sectionPrepBody'),
    '<a class="btn btn-ghost btn-sm" href="#/interview">' + icon('back') + ' ' + t('interview.backToPractice') + '</a>') +
    '<div class="interview-note">' + icon('info') + '<span>' + t('interview.localNote') + '</span></div>' +
    profileForm +
  '</div>';
}

function viewInterviewResumeEvaluation() {
  const result = state.ui.interviewResumeEvaluation;
  const report = result
    ? '<div class="interview-template"><h2>' + t('interview.resumeAssessmentTitle') + '</h2>' +
      '<div class="interview-resume-score">' + t('interview.resumeScore', { score: result.score }) + '</div>' +
      '<p>' + t(result.summary) + '</p><h3>' + t('interview.resumeStrengths') + '</h3><ul>' +
      result.strengths.map(function (key) { return '<li>' + t(key) + '</li>'; }).join('') +
      '</ul><h3>' + t('interview.resumeRecommendations') + '</h3><ul>' +
      result.recommendations.map(function (key) { return '<li>' + t(key) + '</li>'; }).join('') +
      '</ul><p class="small muted">' + t('interview.resumeDemoDisclaimer') + '</p></div>'
    : '';
  return '<div class="page">' + pageHead(t('interview.sectionIntro'), t('interview.sectionIntroBody'),
    '<a class="btn btn-ghost btn-sm" href="#/interview">' + icon('back') + ' ' + t('interview.backToPractice') + '</a>') +
    '<div class="interview-note">' + icon('info') + '<span>' + t('interview.resumePrivacyNote') + '</span></div>' +
    '<div class="card"><div class="card-head"><h2>' + t('interview.resumeInputTitle') + '</h2></div><div class="card-body">' +
      '<form data-form="resumeEvaluation" class="stack">' +
        '<div class="field"><label for="interviewResumeText">' + t('interview.resumeTextLabel') + '</label>' +
          '<textarea class="textarea interview-resume-text" id="interviewResumeText" name="resumeText" data-bind="interviewResumeText" maxlength="12000" placeholder="' +
            t('interview.resumeTextPlaceholder') + '">' + esc(state.ui.interviewResumeText) + '</textarea></div>' +
        '<div class="field"><label for="interviewResumeFile">' + t('interview.resumeFileLabel') + '</label>' +
          '<input class="input" type="file" id="interviewResumeFile" data-resume-file="1" accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document">' +
          '<span class="hint">' + t('interview.resumeFileFormats') + '</span>' +
          (state.ui.interviewResumeFileName ? '<span class="small muted">' + esc(state.ui.interviewResumeFileName) + '</span>' : '') +
        '</div><div class="row"><span class="spacer"></span><button class="btn" type="submit">' +
          t('interview.evaluateResume') + '</button></div></form></div></div>' + report +
  '</div>';
}

function viewInterviewResumeQuestions() {
  const questions = state.ui.interviewResumeQuestions && state.ui.interviewResumeText
    ? createInterviewResumeQuestions(state.ui.interviewResumeText)
    : [];
  const content = questions.length
    ? '<div class="interview-review-list">' + questions.map(function (item, index) {
      return '<div class="interview-review-row"><div class="interview-review-number">' +
        t('interview.questionLabel') + ' ' + (index + 1) + '</div><div class="interview-review-question">' +
        esc(item.question) + '</div><div class="interview-resume-advice"><strong>' +
        t('interview.resumeAnswerAdviceTitle') + '</strong><p>' + t(item.advice) + '</p></div></div>';
    }).join('') + '</div>'
    : '<div class="empty-state"><h3 class="empty-title">' + t('interview.resumeQuestionsEmptyTitle') + '</h3><p>' +
      t('interview.resumeQuestionsEmptyBody') + '</p><a class="btn" href="#/interview/intro">' +
      t('interview.sectionIntro') + '</a></div>';
  return '<div class="page">' + pageHead(t('interview.sectionProject'), t('interview.sectionProjectBody'),
    '<a class="btn btn-ghost btn-sm" href="#/interview">' + icon('back') + ' ' + t('interview.backToPractice') + '</a>') +
    '<div class="interview-note">' + icon('info') + '<span>' + t('interview.resumeDemoDisclaimer') + '</span></div>' +
    '<div class="card"><div class="card-head"><h2>' + t('interview.resumeQuestionsTitle') + '</h2></div><div class="card-body">' +
      content + '</div></div></div>';
}

async function handleInterviewResumeFile(input) {
  const file = input && input.files && input.files[0];
  if (!file) return;
  try {
    const text = await readInterviewResumeFile(file);
    if (!text) throw new Error(t('interview.resumeEmptyDocument'));
    state.ui.interviewResumeText = text.slice(0, 12000);
    state.ui.interviewResumeFileName = file.name;
    state.ui.interviewResumeEvaluation = null;
    state.ui.interviewResumeQuestions = null;
    render();
  } catch (error) {
    console.error('Unable to read interview resume file.', error);
    toast(error.message || t('interview.resumeFileReadFailed'), 'err');
  }
}

const INTERVIEW_SALARY_QUESTION_KEYS = [
  'interview.salaryQuestion.1',
  'interview.salaryQuestion.2',
  'interview.salaryQuestion.3',
];

function viewInterviewSalary() {
  const index = state.ui.interviewSalaryIndex;
  const finished = index >= INTERVIEW_SALARY_QUESTION_KEYS.length;
  const feedback = state.ui.interviewSalaryFeedback;
  const content = finished
    ? '<div class="interview-complete"><h2>' + t('interview.salaryCompleteTitle') + '</h2><p>' +
      t('interview.salaryCompleteBody') + '</p><button class="btn" data-act="restartSalaryPractice">' +
      t('interview.restartSalaryPractice') + '</button></div>'
    : '<div class="interview-kicker">' + t('interview.questionCount', {
        current: index + 1, total: INTERVIEW_SALARY_QUESTION_KEYS.length,
      }) + '</div><h2 class="interview-salary-question">' + t(INTERVIEW_SALARY_QUESTION_KEYS[index]) + '</h2>' +
      (feedback
        ? '<div class="interview-feedback"><strong>' + t('interview.salarySuggestionTitle') + '</strong><p>' +
          t(feedback) + '</p><button class="btn" data-act="nextSalaryQuestion">' + t('interview.next') + '</button></div>'
        : '<form data-form="interviewSalary" class="stack"><div class="field"><label>' +
          t('interview.answer') + '</label><textarea class="textarea" name="answer" data-bind="interviewSalaryAnswer" maxlength="2000" placeholder="' +
          t('interview.salaryAnswerPh') + '">' + esc(state.ui.interviewSalaryAnswer) + '</textarea></div>' +
          '<div class="row"><span class="spacer"></span><button class="btn" type="submit">' +
          t('interview.submitSalaryAnswer') + '</button></div></form>');
  return '<div class="page">' + pageHead(t('interview.sectionSalary'), t('interview.sectionSalaryBody'),
    '<a class="btn btn-ghost btn-sm" href="#/interview">' + icon('back') + ' ' + t('interview.backToPractice') + '</a>') +
    '<div class="card interview-session"><div class="card-body">' + content + '</div></div></div>';
}

function viewInterviewSession() {
  const session = state.ui.interviewSession;
  if (!session) {
    return '<div class="page">' + pageHead(t('interview.title'), t('interview.noSession')) +
      '<div class="card"><div class="card-body">' +
        emptyState(t('interview.noSession'), t('interview.noSessionBody'), 'info') +
        '<div class="row" style="justify-content:center"><a class="btn" href="#/interview/prep">' + t('interview.setupLink') + '</a></div>' +
      '</div></div></div>';
  }

  const complete = session.index >= session.questions.length;
  const summary = complete ? createInterviewSummary(session) : null;
  const question = complete ? '' : session.questions[session.index];
  const referenceAnswers = complete
    ? session.questions.map(function (_, index) {
      return '<div class="interview-summary-item"><strong>' + t('interview.questionLabel') + ' ' +
        (index + 1) + ' · ' + t('interview.referenceAnswerTitle') + '</strong><p>' +
        esc(createInterviewReferenceAnswer(session, index)) + '</p></div>';
    }).join('')
    : '';
  const completion = complete
    ? '<div class="interview-complete"><div class="interview-complete-mark">' + icon('check') + '</div>' +
      '<h3>' + t('interview.completeTitle') + '</h3><p class="muted">' + t('interview.completeBody') + '</p></div>' +
      '<div class="interview-summary"><h3>' + t('interview.answerRecapTitle') + '</h3>' +
        referenceAnswers + '</div>' +
      '<div class="interview-summary">' +
        '<h3>' + t('interview.summaryTitle') + '</h3>' +
        '<p class="interview-summary-intro">' + esc(summary.intro) + '</p>' +
        '<div class="interview-summary-item"><strong>' + t('interview.summaryStrengthTitle') + '</strong><p>' + esc(summary.strength) + '</p></div>' +
        '<div class="interview-summary-item"><strong>' + t('interview.summaryEvidenceTitle') + '</strong><p>' + esc(summary.evidence) + '</p></div>' +
        '<div class="interview-summary-item"><strong>' + t('interview.summaryNextStepTitle') + '</strong><p>' + t(summary.nextStep) + '</p></div>' +
      '</div>' +
        (summary.reviewCount
          ? '<div class="interview-review-cta"><div><strong>' + t('interview.reviewAvailable', { count: summary.reviewCount }) + '</strong>' +
            '<p class="small muted">' + t('interview.reviewHint') + '</p></div>' +
            '<a class="btn btn-ghost" href="#/interview/review">' + t('interview.reviewWrongAnswers') + '</a></div>'
          : '<div class="interview-review-clear">' + icon('check') + '<span>' + t('interview.noReviewNeeded') + '</span></div>') +
        '<div class="row" style="justify-content:center;margin-top:18px"><a class="btn btn-ghost" href="#/interview" data-act="restartInterview">' + t('interview.restart') + '</a></div>'
    : '<div class="interview-question"><span class="interview-kicker">' + t('interview.questionLabel') + ' ' + (session.index + 1) + '</span>' +
      '<h3>' + esc(question) + '</h3></div>' +
      '<div class="field interview-answer"><label for="interviewAnswer">' + t('interview.answer') + '</label>' +
        '<textarea class="textarea" id="interviewAnswer" data-bind="interviewAnswer" maxlength="2000" placeholder="' + t('interview.answerPh') + '">' +
          esc(state.ui.interviewAnswer) + '</textarea>' +
        '<div class="row"><span class="hint">' + t('interview.answerHint') + '</span><span class="spacer"></span>' +
          '<button type="button" class="btn" data-act="submitInterviewAnswer">' + t('interview.submitAnswer') + '</button></div></div>';

  return '<div class="page">' +
    pageHead(t('interview.sessionTitle'), t('interview.sessionMeta', {
      job: t('interview.job.' + session.profile.job),
      experience: t('interview.experience.' + session.profile.experience),
    }), '<a class="btn btn-ghost btn-sm" href="#/interview/prep">' + icon('back') + ' ' + t('interview.backToSetup') + '</a>') +
    '<div class="interview-note">' + icon('info') + '<span>' + t('interview.localNote') + '</span></div>' +
    '<div class="card interview-session">' +
      '<div class="card-head"><div><h2>' + (complete ? t('interview.completeTitle') : t('interview.sessionTitle')) + '</h2>' +
        '<div class="small muted">' + esc(t('interview.sessionMeta', {
          job: t('interview.job.' + session.profile.job),
          experience: t('interview.experience.' + session.profile.experience),
        })) + '</div></div><span class="spacer"></span>' +
        (!complete ? '<span class="badge badge-brand">' + t('interview.questionCount', {
          current: session.index + 1, total: session.questions.length,
        }) + '</span>' : '') +
      '</div><div class="card-body">' + completion + '</div></div></div>';
}

function viewInterviewReview(params) {
  const items = getInterviewReviewItems();
  const rawIndex = params && params.index !== undefined ? parseInt(params.index, 10) : NaN;
  let selectedSession = null;
  let selectedIndex = NaN;
  if (params && params.sessionId !== undefined) {
    selectedSession = findInterviewSession(params.sessionId);
    selectedIndex = rawIndex;
  } else if (Number.isInteger(rawIndex) && state.ui.interviewReviewSessionId &&
      state.ui.interviewReviewIndex === rawIndex) {
    selectedSession = findInterviewSession(state.ui.interviewReviewSessionId);
    selectedIndex = state.ui.interviewReviewQuestionIndex;
  } else if (Number.isInteger(rawIndex) && items[rawIndex]) {
    selectedSession = items[rawIndex].session;
    selectedIndex = items[rawIndex].index;
  } else if (state.ui.interviewReviewSessionId && state.ui.interviewReviewFeedback) {
    selectedSession = findInterviewSession(state.ui.interviewReviewSessionId);
    selectedIndex = state.ui.interviewReviewQuestionIndex;
  }

  const showingReviewFeedback = !!(state.ui.interviewReviewFeedback && selectedSession &&
    selectedSession.id === state.ui.interviewReviewSessionId &&
    selectedIndex === state.ui.interviewReviewQuestionIndex);
  if (selectedSession && Number.isInteger(selectedIndex) &&
      selectedIndex >= 0 && selectedIndex < selectedSession.questions.length &&
      (interviewNeedsReview(selectedSession.answers[selectedIndex]) || showingReviewFeedback)) {
    state.ui.interviewReviewIndex = selectedIndex;
    state.ui.interviewReviewSessionId = selectedSession.id;
    state.ui.interviewReviewQuestionIndex = selectedIndex;
    const answer = selectedSession.answers[selectedIndex] || '';
    const feedback = state.ui.interviewReviewFeedback;
    return '<div class="page">' +
      pageHead(t('interview.reviewWrongAnswers'), t('interview.reviewQuestionCount', {
        current: selectedIndex + 1, total: selectedSession.questions.length,
      }), '<a class="btn btn-ghost btn-sm" href="#/interview/review" data-act="returnInterviewReview">' + icon('back') + ' ' + t('interview.backToReviewList') + '</a>') +
      '<div class="card interview-session"><div class="card-head"><div><h2>' + t('interview.questionLabel') + ' ' + (selectedIndex + 1) + '</h2>' +
        '<div class="small muted">' + t('interview.reviewReason') + '</div></div></div>' +
        '<div class="card-body"><div class="interview-question"><h3>' + esc(selectedSession.questions[selectedIndex]) + '</h3></div>' +
          (feedback
            ? '<div class="interview-feedback"><div class="interview-feedback-title">' + t('interview.feedbackTitle') + '</div>' +
              '<p>' + t(feedback) + '</p><a class="btn btn-ghost" href="#/interview/review" data-act="returnInterviewReview">' + t('interview.backToReviewList') + '</a></div>'
            : '<div class="field interview-answer"><label for="interviewReviewAnswer">' + t('interview.reviseAnswer') + '</label>' +
              '<textarea class="textarea" id="interviewReviewAnswer" data-bind="interviewAnswer" maxlength="2000" placeholder="' + t('interview.answerPh') + '">' +
                esc(answer) + '</textarea><div class="row"><span class="hint">' + t('interview.reviewHint') + '</span><span class="spacer"></span>' +
                '<button type="button" class="btn" data-act="submitInterviewReview">' + t('interview.submitReview') + '</button></div></div>') +
        '</div></div></div>';
  }

  const rows = items.map(function (item) {
    return '<div class="interview-review-row"><div class="interview-review-number">' +
      t('interview.questionLabel') + ' ' + (item.index + 1) + ' · ' +
      esc(t('interview.job.' + item.session.profile.job)) + '</div>' +
      '<div class="interview-review-question">' + esc(item.session.questions[item.index]) + '</div>' +
      '<div class="interview-review-answer"><strong>' + t('interview.previousAnswer') + '</strong><p>' + esc(item.session.answers[item.index]) + '</p></div>' +
      '<div class="small muted">' + t('interview.reviewReason') + '</div>' +
      '<a class="btn btn-ghost btn-sm" href="#/interview/review/' + esc(item.sessionId) + '/' + item.index +
        '" data-act="reviewInterviewQuestion" data-index="' + item.index + '" data-session-id="' +
        esc(item.sessionId) + '">' + t('interview.reviewNow') + '</a></div>';
  }).join('');

  return '<div class="page">' +
    pageHead(t('interview.reviewWrongAnswers'), t('interview.reviewListSubtitle'), '<a class="btn btn-ghost btn-sm" href="#/interview">' + icon('back') + ' ' + t('interview.backToSetup') + '</a>') +
    '<div class="interview-note">' + icon('info') + '<span>' + t('interview.reviewDisclaimer') + '</span></div>' +
    '<div class="card"><div class="card-head"><h2>' + t('interview.reviewCountTitle', { count: items.length }) + '</h2></div>' +
      '<div class="card-body">' + (items.length
        ? '<div class="interview-review-list">' + rows + '</div>'
        : '<div class="interview-review-clear">' + icon('check') + '<span>' + t('interview.noReviewNeeded') + '</span></div>') +
      '</div></div></div>';
}

/* ---------------- 教师端 ---------------- */

/* --------------------------------------------------------------------------
 * 动作派发（app.js handleAct 调用）：已处理返回非 false
 * -------------------------------------------------------------------------- */
function handleInterviewAction(act, data, event, target) {
  const courseId = data.id;
  if (act === 'nextSalaryQuestion') {
    if (!state.ui.interviewSalaryFeedback) return;
    state.ui.interviewSalaryIndex += 1;
    state.ui.interviewSalaryAnswer = '';
    state.ui.interviewSalaryFeedback = '';
    render();
    return;
  }

  if (act === 'restartSalaryPractice') {
    state.ui.interviewSalaryIndex = 0;
    state.ui.interviewSalaryAnswer = '';
    state.ui.interviewSalaryFeedback = '';
    render();
    return;
  }

  if (act === 'submitInterviewAnswer') {
    const session = state.ui.interviewSession;
    const answer = state.ui.interviewAnswer.trim();
    if (!session || session.index >= session.questions.length) return;
    if (!answer) { toast(t('interview.answerRequired'), 'err'); return; }
    session.answers[session.index] = answer;
    session.index += 1;
    state.ui.interviewAnswer = '';
    if (session.index >= session.questions.length) saveCompletedInterviewSession(session);
    render();
    return;
  }

  if (act === 'reviewInterviewQuestion') {
    const session = data.sessionId
      ? findInterviewSession(data.sessionId)
      : state.ui.interviewSession;
    const index = parseInt(data.index, 10);
    if (!session || session.index < session.questions.length ||
        !Number.isInteger(index) || index < 0 || index >= session.questions.length ||
        !interviewNeedsReview(session.answers[index])) return;
    state.ui.interviewReviewIndex = index;
    state.ui.interviewReviewSessionId = session.id;
    state.ui.interviewReviewQuestionIndex = index;
    state.ui.interviewReviewFeedback = '';
    state.ui.interviewAnswer = session.answers[index] || '';
    return;
  }

  if (act === 'submitInterviewReview') {
    const session = findInterviewSession(state.ui.interviewReviewSessionId);
    const index = state.ui.interviewReviewQuestionIndex;
    const answer = state.ui.interviewAnswer.trim();
    if (!session || index === null || !interviewNeedsReview(session.answers[index])) return;
    if (!answer) { toast(t('interview.answerRequired'), 'err'); return; }
    session.answers[index] = answer;
    saveCompletedInterviewSession(session);
    state.ui.interviewReviewFeedback = answer.replace(/\s/g, '').length >= 100
      ? 'interview.feedbackDetailed'
      : 'interview.feedbackDevelop';
    render();
    return;
  }

  if (act === 'returnInterviewReview') {
    state.ui.interviewReviewIndex = null;
    state.ui.interviewReviewSessionId = null;
    state.ui.interviewReviewQuestionIndex = null;
    state.ui.interviewReviewFeedback = '';
    state.ui.interviewAnswer = '';
    return;
  }

  if (act === 'restartInterview') {
    state.ui.interviewSession = null;
    state.ui.interviewReviewIndex = null;
    state.ui.interviewReviewSessionId = null;
    state.ui.interviewReviewQuestionIndex = null;
    state.ui.interviewReviewFeedback = '';
    state.ui.interviewAnswer = '';
    go('#/interview');
    render();
    return;
  }
  return false;
}

/* --------------------------------------------------------------------------
 * 表单派发（app.js handleSubmit 调用）：已处理返回非 false
 * -------------------------------------------------------------------------- */
function handleInterviewSubmit(type, fd) {
  const val = function (key) { return (fd.get(key) || '').toString().trim(); };
  if (type === 'interviewProfile') {
    const job = val('job');
    const experience = val('experience');
    const validJobs = ['frontend', 'backend', 'data', 'product', 'marketing'];
    const validExperience = ['student', 'earlyCareer', 'careerChange'];
    if (validJobs.indexOf(job) === -1 || validExperience.indexOf(experience) === -1) {
      toast(t('interview.profileRequired'), 'err');
      return;
    }
    const profile = {
      job: job,
      experience: experience,
      background: val('background').slice(0, 160),
      skills: val('skills').slice(0, 160),
    };
    state.ui.interviewJob = profile.job;
    state.ui.interviewExperience = profile.experience;
    state.ui.interviewBackground = profile.background;
    state.ui.interviewSkills = profile.skills;
    state.ui.interviewAnswer = '';
    state.ui.interviewReviewIndex = null;
    state.ui.interviewReviewSessionId = null;
    state.ui.interviewReviewQuestionIndex = null;
    state.ui.interviewReviewFeedback = '';
    state.ui.interviewSession = {
      id: 'interview_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      createdAt: nowIso(),
      profile: profile,
      questions: createInterviewQuestions(profile),
      index: 0,
      answers: [],
    };
    go('#/interview/session');
    render();
    return;
  }

  if (type === 'resumeEvaluation') {
    const resumeText = val('resumeText').slice(0, 12000);
    if (resumeText.replace(/\s/g, '').length < 40) {
      toast(t('interview.resumeTextRequired'), 'err');
      return;
    }
    state.ui.interviewResumeText = resumeText;
    state.ui.interviewResumeEvaluation = evaluateInterviewResume(resumeText);
    state.ui.interviewResumeQuestions = createInterviewResumeQuestions(resumeText);
    render();
    return;
  }

  if (type === 'interviewSalary') {
    const answer = val('answer').slice(0, 2000);
    const index = state.ui.interviewSalaryIndex;
    if (!answer) { toast(t('interview.answerRequired'), 'err'); return; }
    if (index < 0 || index >= INTERVIEW_SALARY_QUESTION_KEYS.length) return;
    state.ui.interviewSalaryAnswer = answer;
    state.ui.interviewSalaryFeedback = answer.replace(/\s/g, '').length >= 100
      ? 'interview.salaryFeedbackDetailed'
      : 'interview.salaryFeedbackDevelop';
    render();
    return;
  }
  return false;
}

/* --------------------------------------------------------------------------
 * 输入派发（app.js handleInput 调用）：简历文本变化时失效旧的评估结果
 * -------------------------------------------------------------------------- */
function handleInterviewInput(key) {
  if (key === 'interviewResumeText') {
    state.ui.interviewResumeEvaluation = null;
    state.ui.interviewResumeQuestions = null;
  }
}
