#!/usr/bin/env node
/**
 * 冒烟测试：用最小 DOM 桩在 Node 里跑一遍所有页面，确认没有运行时异常、关键内容出现。
 * 覆盖：登录/注册、三种角色的全部页面、403 越权、双语切换、未选课时课件区被锁。
 *
 * 用法: node smoke-test.mjs
 */
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { deflateRawSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));

/* ---------------- 最小 DOM 桩 ---------------- */

function makeEl() {
  return {
    innerHTML: '', className: '', textContent: '', style: {},
    classList: { contains: () => false, add() {}, remove() {} },
    appendChild() {}, remove() {}, focus() {}, setAttribute() {},
    getAttribute() { return null; }, querySelector() { return null; }, closest() { return null; },
    setSelectionRange() {}, files: [],
  };
}

const nodes = { app: makeEl(), toasts: makeEl(), 'modal-root': makeEl(), matFile: makeEl() };

const document = {
  documentElement: { lang: 'en' },
  title: '',
  body: { insertAdjacentHTML() {} },
  getElementById: (id) => nodes[id] || null,
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  querySelector: () => null,
  addEventListener() {},
};

const window = {
  location: { hash: '', replace(h) { window.location.hash = h; } },
  addEventListener() {},
  matchMedia: () => ({ matches: false }),
  devicePixelRatio: 1,
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
};

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

/* ---------------- 载入原型代码 ---------------- */

const source = ['icons.js', 'i18n.js', 'data.js', 'learning-path-service.js', 'learning-path-assessment.js', 'learning-path.js', 'app.js']
  .map((f) => readFileSync(join(here, f), 'utf8'))
  .join('\n;\n');

function FormDataStub(form) { this._values = (form && form._values) || {}; }
FormDataStub.prototype.get = function (k) { return Object.prototype.hasOwnProperty.call(this._values, k) ? this._values[k] : ''; };
function regForm(values) { return { _values: values, getAttribute: function (n) { return n === 'data-form' ? 'register' : null; }, reset: function () {} }; }
function testForm(values, type) { return { _values: values, getAttribute: function (n) { return n === 'data-form' ? type : null; }, reset: function () {} }; }

function docxFixture(text, compress) {
  const name = Buffer.from('word/document.xml');
  const xml = Buffer.from('<w:document xmlns:w="word"><w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>');
  const body = compress ? deflateRawSync(xml) : xml;
  const method = compress ? 8 : 0;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);
  const localEntry = Buffer.concat([local, name, body]);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralEntry = Buffer.concat([central, name]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(centralEntry.length, 12);
  end.writeUInt32LE(localEntry.length, 16);
  return Buffer.concat([localEntry, centralEntry, end]);
}

const context = vm.createContext({
  document, window, localStorage,
  TextDecoder, DecompressionStream, Response, Blob,
  setTimeout: () => 0,
  console,
  alert: () => {},
  FormData: FormDataStub,
  __reg: regForm,
  __form: testForm,
});

try {
  vm.runInContext(source, context, { filename: 'demo-bundle.js' });
} catch (err) {
  console.error('✗ 原型代码加载失败：' + err.message);
  process.exit(1);
}

/* ---------------- 断言 ---------------- */

let failures = 0;
let checks = 0;

function renderHash(hash) {
  vm.runInContext(`window.location.hash = ${JSON.stringify(hash)}; render();`, context);
  return nodes.app.innerHTML;
}

function as(userId) {
  vm.runInContext(`state.user = state.db.users.filter(function (u) { return u.id === ${JSON.stringify(userId)}; })[0];`, context);
}

function setLocale(locale) {
  vm.runInContext(`state.locale = ${JSON.stringify(locale)};`, context);
}

function check(label, hash, needles) {
  checks += 1;
  let html;
  try {
    html = renderHash(hash);
  } catch (err) {
    failures += 1;
    console.error(`  ✗ ${label} (${hash}) 抛出异常: ${err.message}`);
    return;
  }
  if (!html || html.length < 80) {
    failures += 1;
    console.error(`  ✗ ${label} (${hash}) 渲染结果为空或过短`);
    return;
  }
  const missing = needles.filter((n) => !html.includes(n));
  if (missing.length) {
    failures += 1;
    console.error(`  ✗ ${label} (${hash}) 缺少内容: ${missing.join(' | ')}`);
    return;
  }
  console.log(`  ✓ ${label}`);
}

function runIn(code) {
  return vm.runInContext(code, context);
}

function assertEqual(label, actual, expected) {
  checks += 1;
  if (actual !== expected) {
    failures += 1;
    console.error(`  ✗ ${label}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
    return;
  }
  console.log(`  ✓ ${label}`);
}

/* ---------------- 用例 ---------------- */

console.log('未登录：');
setLocale('en');
vm.runInContext('state.user = null;', context);
check('欢迎页', '#/', ['auth-wrap', 'Register', 'Sign in']);
check('登录页', '#/login', ['auth-wrap', 'Sign in', 'Demo accounts']);
check('注册页（学生）', '#/register', ['auth-wrap', 'Create account', 'I am a']);
vm.runInContext("state.ui.regRole = 'teacher';", context);
check('注册页（教师）显示邀请码', '#/register', ['auth-wrap', 'Invite code']);
vm.runInContext("state.ui.regRole = 'student';", context);
check('受限页重定向到登录', '#/admin/users', ['auth-wrap']);

console.log('\n注册流程（学生/教师 + 邀请码）：');
vm.runInContext('state.user = null;', context);

vm.runInContext("state.ui.regRole = 'teacher';", context);
runIn("handleSubmit(__reg({loginId:'t2001', name:'Test Teacher', email:'teacher.new@polyu.edu.hk', password:'demo1234', confirm:'demo1234', inviteCode:'TEACHER2026'}), { preventDefault: function(){} });");
assertEqual('教师+正确邀请码：注册成功且角色为 teacher',
  runIn("state.db.users.filter(function(u){return u.loginId==='t2001';})[0].role"), 'teacher');
assertEqual('教师注册后不自动登录', runIn('state.user === null'), true);
assertEqual('教师注册后跳转登录页', runIn('window.location.hash'), '#/login');

vm.runInContext("state.ui.regRole = 'teacher'; state.ui.registerError = '';", context);
runIn("handleSubmit(__reg({loginId:'t2002', name:'Bad Teacher', email:'bad.teacher@polyu.edu.hk', password:'demo1234', confirm:'demo1234', inviteCode:'WRONG'}), { preventDefault: function(){} });");
assertEqual('教师+错误邀请码：被拒', runIn("state.db.users.some(function(u){return u.loginId==='t2002';})"), false);

runIn("handleSubmit(__reg({loginId:'t2003', name:'No Code', email:'nocode@polyu.edu.hk', password:'demo1234', confirm:'demo1234'}), { preventDefault: function(){} });");
assertEqual('教师+缺失邀请码：被拒', runIn("state.db.users.some(function(u){return u.loginId==='t2003';})"), false);

vm.runInContext("state.ui.regRole = 'student'; state.ui.registerError = '';", context);
runIn("handleSubmit(__reg({loginId:'26079999g', name:'New Student', email:'new.student@connect.polyu.hk', password:'demo1234', confirm:'demo1234'}), { preventDefault: function(){} });");
assertEqual('学生注册成功且角色为 student',
  runIn("state.db.users.filter(function(u){return u.loginId==='26079999g';})[0].role"), 'student');
assertEqual('学生注册后跳转登录页', runIn('window.location.hash'), '#/login');

runIn("signIn(state.db.users.filter(function(u){return u.loginId==='t2001';})[0]);");
assertEqual('新教师登录落到教师端', runIn('window.location.hash'), '#/teacher');
runIn("signIn(state.db.users.filter(function(u){return u.loginId==='26079999g';})[0]);");
assertEqual('新学生登录落到课程目录', runIn('window.location.hash'), '#/courses');

console.log('\n学生 Lin Mohan（已选 COMP5241，申请 COMP5421 待审）：');
as('u_s1');
check('课程目录', '#/courses', ['COMP5241', 'Software Engineering', 'Course catalog']);
check('已选课程可见课件', '#/courses/c1', ['Lecture 01', 'i-file', 'Course materials']);
check('未选课程课件被锁', '#/courses/c3', ['Materials are hidden', 'lock-panel']);
check('我的课程', '#/my', ['My courses']);
check('AI 模拟面试入口显示五类专项练习', '#/interview', ['Focused practice', 'Resume assessment', 'Resume-based interview questions', 'Salary negotiation', 'Comprehensive interview', 'Wrong-answer review', 'href="#/interview/review"']);
check('入口错题区提供复习按钮', '#/interview', ['0 answers to review', 'href="#/interview/review"', 'Review answers to improve']);
check('进入综合面试可设置岗位信息', '#/interview/prep', ['Target role', 'Generate interview questions']);
check('设置页', '#/settings', ['Language', 'Change password']);
check('越权访问管理端返回 403', '#/admin/users', ['403', 'Access denied']);
check('越权访问教师端返回 403', '#/teacher', ['403']);

console.log('\n双语切换：');
setLocale('zh');
check('中文课程目录', '#/courses', ['课程目录', '名额']);
check('中文课程详情', '#/courses/c1', ['课程课件', '授课教师']);
check('中文专项练习入口显示五个板块', '#/interview', ['专项练习', '简历评估', '简历押题', '薪资谈判', '综合面试', '错题复习']);
check('中文入口提供错题复习按钮', '#/interview', ['有 0 个回答待复习', 'href="#/interview/review"', '复习待改进回答']);
check('中文综合面试页可以定制岗位', '#/interview/prep', ['目标岗位', '生成面试题']);
check('中文 403 页面', '#/admin/users', ['403', '无权访问']);
setLocale('en');

console.log('\n学生端 AI 模拟面试：');
as('u_s1');
check('简历评估支持粘贴文字和文档上传', '#/interview/intro', ['Paste resume text', 'Upload a resume document', 'accept=".txt,.md,.docx']);
const uploadedResume = 'Alex Lee | alex@example.com | 1234567890\nExperience: Software Engineer at Example Co.\nProjects: Campus Planner built with React and TypeScript. Improved task completion by 30%. Skills: React, TypeScript, Python.';
await runIn(`handleInterviewResumeFile({files:[{name:'resume.txt',size:${uploadedResume.length},text:function(){return Promise.resolve(${JSON.stringify(uploadedResume)});}}]})`);
assertEqual('上传文本简历后载入简历内容和文件名',
  runIn("state.ui.interviewResumeText.indexOf('alex@example.com') !== -1 && state.ui.interviewResumeFileName === 'resume.txt'"), true);
const docxResume = docxFixture('DOCX resume text with a project and measurable 25% improvement.', true);
await runIn(`handleInterviewResumeFile({files:[{name:'resume.docx',size:${docxResume.length},arrayBuffer:function(){return Promise.resolve(Uint8Array.from([${Array.from(docxResume).join(',')}]).buffer);}}]})`);
assertEqual('上传 DOCX 简历后提取正文',
  runIn("state.ui.interviewResumeText.indexOf('measurable 25% improvement') !== -1 && state.ui.interviewResumeFileName === 'resume.docx'"), true);
runIn("handleSubmit(__form({resumeText:" + JSON.stringify(uploadedResume) + "}, 'resumeEvaluation'), { preventDefault:function(){} });");
assertEqual('简历评估根据联系方式、经历、项目、技能和成果给出演示评分',
  runIn('state.ui.interviewResumeEvaluation.score'), 100);
check('简历评估显示亮点和建议', '#/interview/intro', ['Resume assessment', 'Demo completeness score: 100/100', 'What is already working', 'Suggestions to improve', 'Frontend demonstration only']);
check('简历押题生成基于简历技能的面试问题和建议', '#/interview/project', ['Can you describe a specific time you used one of these skills', 'Answer suggestion', 'STAR structure']);
setLocale('zh');
check('中文简历评估报告正确显示', '#/interview/intro', ['简历评估', '演示版完整度评分：100/100', '仅为前端演示']);
check('中文简历押题和回答建议正确显示', '#/interview/project', ['面试官可能会问的问题', '能否分享一次你运用其中一项技能', '回答建议']);
setLocale('en');
runIn("handleInput({target:{getAttribute:function(){return 'interviewResumeText';},value:'An updated resume with new details.',selectionStart:35,focus:function(){},setSelectionRange:function(){}}});");
assertEqual('修改简历后清除过期评估结果',
  runIn('state.ui.interviewResumeEvaluation === null && state.ui.interviewResumeQuestions === null'), true);
check('修改简历后需重新评估才生成简历押题', '#/interview/project', ['Upload or paste your resume first']);
runIn("state.ui.interviewResumeText = ''; state.ui.interviewResumeEvaluation = null; state.ui.interviewResumeQuestions = null;");
check('简历押题为空时提示先上传简历', '#/interview/project', ['Upload or paste your resume first']);
runIn("handleSubmit(__form({resumeText:'too short'}, 'resumeEvaluation'), { preventDefault:function(){} });");
assertEqual('简历文字过短时不生成评估',
  runIn('state.ui.interviewResumeEvaluation'), null);
check('薪资谈判展示常见问题', '#/interview/salary', ['What are your salary expectations']);
runIn("handleSubmit(__form({answer:'I expect a fair offer.'}, 'interviewSalary'), { preventDefault:function(){} });");
assertEqual('薪资回答后生成针对性的优化建议',
  runIn('state.ui.interviewSalaryFeedback'), 'interview.salaryFeedbackDevelop');
check('薪资回答优化建议支持本地显示', '#/interview/salary', ['Suggestions to improve your answer', 'market range']);
runIn("handleAct('nextSalaryQuestion', {}, { target:{} }, null); handleSubmit(__form({answer:'Based on my research, this role typically pays between 60,000 and 70,000 annually. My relevant experience includes delivering measurable improvements, and I would also like to understand the full benefits package.'}, 'interviewSalary'), { preventDefault:function(){} });");
assertEqual('较完整的薪资回答获得进一步建议',
  runIn('state.ui.interviewSalaryFeedback'), 'interview.salaryFeedbackDetailed');
runIn("handleAct('nextSalaryQuestion', {}, { target:{} }, null); handleSubmit(__form({answer:'I value flexibility, learning support, and a clear path for growth in addition to base pay.'}, 'interviewSalary'), { preventDefault:function(){} }); handleAct('nextSalaryQuestion', {}, { target:{} }, null);");
check('完成常见薪资问题后显示完成状态并可重练', '#/interview/salary', ['Salary practice complete', 'Practise again']);
runIn("handleAct('restartSalaryPractice', {}, { target:{} }, null);");
assertEqual('重新开始薪资练习回到第一题',
  runIn('state.ui.interviewSalaryIndex'), 0);
check('可继续逐题练习薪资谈判问题', '#/interview/salary', ['What are your salary expectations']);
runIn("handleSubmit(__form({job:'frontend', experience:'student', background:'Computer science student', skills:'React and TypeScript'}, 'interviewProfile'), { preventDefault:function(){} });");
assertEqual('根据学生背景和目标岗位生成 5 道练习题',
  runIn('state.ui.interviewSession.questions.length'), 5);
assertEqual('生成题目后跳转到独立的练习页面',
  runIn('window.location.hash'), '#/interview/session');
assertEqual('题目包含学生填写的背景',
  runIn("state.ui.interviewSession.questions[0].indexOf('Computer science student') !== -1"), true);
assertEqual('岗位题使用所填技能个性化',
  runIn("state.ui.interviewSession.questions[1].indexOf('React and TypeScript') !== -1"), true);
check('专项练习入口不直接显示综合面试题', '#/interview', ['Comprehensive interview', 'Open practice']);
check('独立练习页显示第一题且不含资料表单', '#/interview/session', ['Computer science student', 'Question 1 of 5']);
assertEqual('练习页不重复显示背景填写表单',
  renderHash('#/interview/session').indexOf('Study or career background') === -1, true);
runIn("state.ui.interviewAnswer = 'I built a student project using React, gathered feedback from classmates, improved keyboard navigation, and measured the result through usability testing. '.repeat(2);");
runIn("handleAct('submitInterviewAnswer', {}, { target:{} }, null);");
assertEqual('提交回答后立即进入下一题',
  runIn('state.ui.interviewSession.index'), 1);
check('答题过程中不显示参考回答', '#/interview/session', ['Question 2 of 5', 'Choose one of these skills', 'Submit answer']);
assertEqual('答题过程中暂不显示整场答案汇总',
  renderHash('#/interview/session').indexOf('Sample answers for this interview') === -1, true);
assertEqual('提交的回答保存在本场面试记录中',
  runIn("state.ui.interviewSession.answers[0].indexOf('keyboard navigation') !== -1"), true);
assertEqual('进入下一题并清空回答',
  runIn('state.ui.interviewSession.index === 1 && state.ui.interviewAnswer === ""'), true);
runIn("handleSubmit(__form({job:'data', experience:'careerChange', background:'Business graduate', skills:'SQL and Tableau'}, 'interviewProfile'), { preventDefault:function(){} });");
assertEqual('不同岗位会生成对应的情境题',
  runIn("state.ui.interviewSession.questions[2].indexOf('dashboards') !== -1"), true);
assertEqual('新建练习后仍跳转到独立练习页',
  runIn('window.location.hash'), '#/interview/session');
runIn('state.ui.interviewSession.index = 1;');
check('数据分析岗位题使用个人技能', '#/interview/session', ['SQL and Tableau']);
runIn('state.ui.interviewSession.index = 2;');
check('个性化数据分析情境题', '#/interview/session', ['Two dashboards', 'Question 3 of 5']);
runIn('state.ui.interviewSession.index = 0; state.ui.interviewSession.answers = [];');
runIn("for (var i = 0; i < 5; i++) { state.ui.interviewAnswer = (i === 1 || i === 3) ? 'Brief answer.' : 'I investigated the issue, worked with the team, and improved the result by 20%. '.repeat(2); handleAct('submitInterviewAnswer', {}, { target:{} }, null); }");
assertEqual('完成所有问题后进入完成状态',
  runIn('state.ui.interviewSession.index === 5'), true);
assertEqual('总体建议基于全部五个回答',
  runIn('state.ui.interviewSession.answers.length'), 5);
assertEqual('较短回答被识别为待复习题目',
  runIn('createInterviewSummary(state.ui.interviewSession).reviewCount'), 2);
check('完成页面展示全部参考答案、总体建议和错题复习入口', '#/interview/session', ['Practice complete', 'Sample answers for this interview', 'Sample answer', 'Overall answer feedback', 'You completed 5 answers', 'Evidence and impact', 'A useful next step', '2 answers could use more detail', 'Review answers to improve']);
setLocale('zh');
check('完成页面总体建议支持中文', '#/interview/session', ['练习完成', '总体答题建议', '你共完成 5 道题']);
check('完成页面展示全部中文参考回答', '#/interview/session', ['本场面试参考回答汇总', '参考回答']);
check('完成页面错题复习入口支持中文', '#/interview/session', ['复习待改进回答', '有 2 个回答可以补充细节']);
setLocale('en');
check('错题复习页显示所有待改进问题', '#/interview/review', ['2 answers to review', 'Brief answer.', 'Review answer']);
runIn("handleAct('reviewInterviewQuestion', {index:'1'}, { target:{} }, null);");
assertEqual('选择错题后记录复习题号',
  runIn('state.ui.interviewReviewIndex'), 1);
check('错题详情可查看原题和原回答', '#/interview/review/1', ['Question 2', 'Pick a skill from', 'Brief answer.', 'Improve your answer']);
runIn("state.ui.interviewAnswer = 'I clarified the user problem, compared two approaches with the team, implemented the selected change, and measured a 20% improvement in task completion. '.repeat(2);");
runIn("handleAct('submitInterviewReview', {}, { target:{} }, null);");
assertEqual('提交改进后的回答后更新该题答案',
  runIn("state.ui.interviewSession.answers[1].indexOf('20% improvement') !== -1"), true);
assertEqual('改进后的答案得到详细回答建议',
  runIn('state.ui.interviewReviewFeedback'), 'interview.feedbackDetailed');
check('错题复习后显示练习反馈', '#/interview/review/1', ['Practice tip', 'clear outcome']);
runIn("handleAct('returnInterviewReview', {}, { target:{} }, null);");
check('复习列表移除已补充细节的题目', '#/interview/review', ['1 answers to review', 'Brief answer.']);
assertEqual('已改进题目不再计入待复习数量',
  runIn('createInterviewSummary(state.ui.interviewSession).reviewCount'), 1);
check('完成状态可重新创建练习', '#/interview/session', ['Create another session']);
runIn("handleAct('restartInterview', {}, { target:{} }, null);");
assertEqual('重新创建练习后返回资料页',
  runIn('window.location.hash'), '#/interview');
check('没有进行中练习时访问练习页提供返回入口', '#/interview/session', ['No interview in progress', 'Set up an interview']);
check('重新进入资料页显示历史待复习数量和复习入口', '#/interview', ['1 answers to review', 'href="#/interview/review"']);
runIn("handleSubmit(__form({job:'backend', experience:'earlyCareer', background:'Backend developer', skills:'Node.js'}, 'interviewProfile'), { preventDefault:function(){} });");
runIn("for (var j = 0; j < 5; j++) { state.ui.interviewAnswer = j === 0 ? 'Another brief answer.' : 'I clarified the requirement, worked with the team, delivered a tested change, and improved the result by 20%. '.repeat(2); handleAct('submitInterviewAnswer', {}, { target:{} }, null); }");
assertEqual('第二场面试完成后历史错题继续保留',
  runIn('getInterviewReviewItems().length'), 2);
check('专项练习入口汇总多场面试的待复习数量', '#/interview', ['2 answers to review', 'href="#/interview/review"']);
runIn('state.ui.interviewHistory = null; state.ui.interviewHistoryUserId = null; state.ui.interviewSession = null;');
check('重新载入后仍能读取所有历史待复习数量', '#/interview', ['2 answers to review', 'href="#/interview/review"']);
check('历史错题复习列表包含不同场次', '#/interview/review', ['2 answers to review', 'Brief answer.', 'Another brief answer.']);
const historicalReviewId = runIn('getInterviewReviewItems()[0].sessionId');
const historicalQuestionIndex = runIn('getInterviewReviewItems()[0].index');
check('可从历史错题列表进入对应场次的复习',
  `#/interview/review/${historicalReviewId}/${historicalQuestionIndex}`, ['Question 4', 'Brief answer.']);
runIn("state.ui.interviewAnswer = 'I explained the context, actions, collaboration, and measurable outcome, improving completion by 20%. '.repeat(2);");
runIn("handleAct('submitInterviewReview', {}, { target:{} }, null);");
assertEqual('历史错题修改后从累计列表中移除',
  runIn('getInterviewReviewItems().length'), 1);
runIn('state.ui.interviewHistory = null; state.ui.interviewHistoryUserId = null;');
check('历史复习修改在重新载入后仍然保存', '#/interview', ['1 answers to review', 'href="#/interview/review"']);
as('u_s2');
check('不同学生不会看到他人的历史错题', '#/interview', ['0 answers to review']);
as('u_s1');
check('没有进行中练习时可返回面试押题设置', '#/interview/session', ['No interview in progress', 'href="#/interview/prep"', 'Set up an interview']);

console.log('\n教师 Dr. Michael Wong：');
as('u_t1');
check('我的课程列表', '#/teacher', ['COMP5241', 'Published', 'Enrollment requests']);
check('课程管理 - 信息页', '#/teacher/c1', ['Course info', 'Materials', 'Members', 'Requests']);
vm.runInContext("state.ui.tab = 'materials';", context);
check('课程管理 - 课件页', '#/teacher/c1', ['Upload PDF', 'Lecture 01']);
vm.runInContext("state.ui.tab = 'members';", context);
check('课程管理 - 成员页', '#/teacher/c1', ['Lin Mohan', 'Priya Nair', 'Add student']);
vm.runInContext("state.ui.tab = 'applications';", context);
check('课程管理 - 待审申请页', '#/teacher/c1', ['Chen Wei', 'Approve', 'Reject']);
vm.runInContext("state.ui.tab = 'info';", context);
check('教师越权访问学生面试页返回 403', '#/interview', ['403', 'Access denied']);
check('教师越权访问学生面试练习页返回 403', '#/interview/session', ['403', 'Access denied']);
check('教师越权访问学生错题复习页返回 403', '#/interview/review', ['403', 'Access denied']);
check('创建课程页', '#/teacher/new', ['Create course', 'Course code', 'Enrollment policy']);

console.log('\n管理员 Alice Chan：');
as('u_admin');
check('用户管理', '#/admin/users', ['Users', 'Alice Chan', 'Michael Wong', 'Reset password']);
check('全部课程', '#/admin/courses', ['COMP5329', 'Draft', 'Archived']);
check('审计日志', '#/admin/audit', ['Audit log', 'Approved enrollment', 'Disabled account']);
check('管理员可查看任意课程详情', '#/courses/c3', ['Image Formation', 'Computer Vision']);

console.log('\n异常路径：');
as('u_s1');
check('不存在的课程 -> 404', '#/courses/nope', ['404']);
check('未知路由 -> 404', '#/whatever', ['404']);

console.log('\n交互流程（模拟点击）：');
as('u_s1');
renderHash('#/courses/c2');
runIn("handleAct('apply', { id: 'c2' }, { target: {} }, null);");
assertEqual('open 策略的课程申请后直接通过',
  runIn("state.db.enrollments.filter(function (e) { return e.courseId === 'c2' && e.studentId === 'u_s1'; })[0].status"), 'approved');

runIn("state.db.courses.filter(function (c) { return c.id === 'c2'; })[0].policy = 'approval';");
runIn("handleAct('withdraw', { id: 'c2' }, { target: {} }, null);");
runIn("handleAct('apply', { id: 'c2' }, { target: {} }, null);");
assertEqual('approval 策略的课程申请后为 pending',
  runIn("state.db.enrollments.filter(function (e) { return e.courseId === 'c2' && e.studentId === 'u_s1'; })[0].status"), 'pending');
check('我的课程显示待审批', '#/my', ['Pending approval']);

as('u_t1');
renderHash('#/teacher/c1');
runIn("handleAct('approve', { id: 'e2' }, { target: {} }, null);");
assertEqual('教师审批后记录为 approved',
  runIn("state.db.enrollments.filter(function (e) { return e.id === 'e2'; })[0].status"), 'approved');

runIn("document.getElementById('matFile').files = [{ name: 'Lecture 03 - Testing.pdf', size: 2097152, type: 'application/pdf' }];");
runIn("handleAct('uploadMaterial', { id: 'c1' }, { target: {} }, null);");
assertEqual('上传 PDF 后课件数 +1',
  runIn("state.db.materials.filter(function (m) { return m.courseId === 'c1'; }).length"), 4);

runIn("document.getElementById('matFile').files = [{ name: 'malware.exe', size: 1024, type: 'application/octet-stream' }];");
runIn("handleAct('uploadMaterial', { id: 'c1' }, { target: {} }, null);");
assertEqual('伪装扩展名的非 PDF 被拒',
  runIn("state.db.materials.filter(function (m) { return m.courseId === 'c1'; }).length"), 4);

runIn("document.getElementById('matFile').files = [{ name: 'Huge.pdf', size: 30 * 1024 * 1024, type: 'application/pdf' }];");
runIn("handleAct('uploadMaterial', { id: 'c1' }, { target: {} }, null);");
assertEqual('超过 20MB 被拒',
  runIn("state.db.materials.filter(function (m) { return m.courseId === 'c1'; }).length"), 4);

vm.runInContext("state.ui.tab = 'materials';", context);
check('新课件出现在课件页', '#/teacher/c1', ['Lecture 03 - Testing']);

as('u_admin');
renderHash('#/admin/users');
runIn("handleAct('toggleUser', { id: 'u_s3' }, { target: {} }, null);");
assertEqual('管理员禁用账号后状态为 disabled',
  runIn("state.db.users.filter(function (u) { return u.id === 'u_s3'; })[0].status"), 'disabled');
assertEqual('禁用操作写入审计日志',
  runIn("state.db.audit[0].action"), 'actDisable');
check('审计页显示禁用记录', '#/admin/audit', ['Disabled account', '26072064g']);

runIn("state.user = null; handleAct('demoLogin', { email: '26072064g@connect.polyu.hk' }, { target: {} }, null);");
assertEqual('被禁用的账号无法登录', runIn('state.user === null'), true);

console.log('\n个性化学习路径：');
as('u_s1');
check('学生导航与空状态', '#/learning-path', ['My learning path', 'Set a learning goal']);
check('目标表单', '#/learning-path/new', ['Total learning budget', 'Related course']);
runIn("handleAct('lpFromCourse',{id:'c1'}, {}, null);");
check('课程入口预填主题和课程', '#/learning-path/new', ['value="Software Engineering"', 'value="c1" selected']);
runIn("handleSubmit(__form({topic:'Software engineering', goal:'Build a tested project', level:'beginner', hours:'10', courseId:'c1', baseVersion:'0'}, 'learningPath'), {preventDefault:function(){}});");
assertEqual('初学者生成五阶段', runIn('lpCurrent(lpLoad()).stages.length'), 5);
assertEqual('任务时间总和等于预算', runIn('lpAllTasks(lpCurrent(lpLoad())).reduce(function(n,t){return n+t.minutes;},0)'), 600);
check('计划显示关联课程和总体进度', '#/learning-path', ['Software engineering', 'COMP5241', 'Overall progress', '0%']);
check('首阶段展开，后续阶段收起', '#/learning-path', ['id="lp-stage-body-0">', 'id="lp-stage-body-1" hidden', 'aria-expanded="false"', 'Courses for this stage']);
runIn("handleAct('lpStageToggle',{stage:'1'}, {}, null);");
check('可以展开单个阶段', '#/learning-path', ['id="lp-stage-body-1">']);
runIn("handleAct('lpStageToggle',{stage:'1'}, {}, null);");
check('可以收起单个阶段', '#/learning-path', ['id="lp-stage-body-1" hidden']);
runIn("handleAct('lpExpandAll',{}, {}, null);");
assertEqual('全部展开', runIn('lpCurrent(lpLoad()).stages.every(function(s,i){return lpStageOpen(lpCurrent(lpLoad()),i);})'), true);
runIn("handleAct('lpCollapseAll',{}, {}, null);");
assertEqual('全部收起', runIn('lpCurrent(lpLoad()).stages.every(function(s,i){return !lpStageOpen(lpCurrent(lpLoad()),i);})'), true);
runIn("handleAct('lpNext',{}, {}, null);");
assertEqual('继续学习自动展开首个未完成阶段', runIn('lpStageOpen(lpCurrent(lpLoad()),0)'), true);
runIn("handleAct('lpToggle', {version:'1',task:'v1-s0-study'}, {}, null);");
assertEqual('完成任务更新总体进度', runIn('lpProgress(lpAllTasks(lpCurrent(lpLoad()))).percent'), 10);
assertEqual('完成时间已保存', runIn('!!lpCurrent(lpLoad()).stages[0].tasks[0].completedAt'), true);
runIn("handleAct('lpToggle', {version:'1',task:'v1-s0-study'}, {}, null);");
assertEqual('允许撤销完成', runIn('lpProgress(lpAllTasks(lpCurrent(lpLoad()))).percent'), 0);
runIn("handleSubmit(__form({version:'1',stage:'0',q0:'1',q1:'2',q2:'1'}, 'learningPathQuiz'), {preventDefault:function(){}});");
check('低分建议复习', '#/learning-path', ['Review: revisit', '0/3']);
runIn("handleSubmit(__form({version:'1',stage:'0',q0:'0',q1:'0',q2:'1'}, 'learningPathQuiz'), {preventDefault:function(){}});");
check('中等成绩建议补充练习', '#/learning-path', ['Extra practice:', '2/3']);
runIn("handleAct('lpToggle',{version:'1',task:'v1-s0-study'}, {}, null); handleAct('lpToggle',{version:'1',task:'v1-s0-exercise'}, {}, null);");
runIn("handleSubmit(__form({version:'1',stage:'0',q0:'0',q1:'0',q2:'0'}, 'learningPathQuiz'), {preventDefault:function(){}});");
check('高分且任务完成建议进阶', '#/learning-path', ['Advance:', '3/3']);
assertEqual('重测记录完整保留', runIn('lpCurrent(lpLoad()).stages[0].attempts.length'), 3);
as('u_s2');
assertEqual('不同学生数据隔离', runIn('lpLoad().versions.length'), 0);
as('u_s1');
assertEqual('重新登录恢复记录', runIn('lpCurrent(lpLoad()).stages[0].attempts.length'), 3);
runIn("handleSubmit(__form({topic:'<img src=x onerror=alert(1)>', goal:'Safe <script> output', level:'advanced', hours:'1.5', baseVersion:'1'}, 'learningPath'), {preventDefault:function(){}});");
assertEqual('进阶生成三阶段', runIn('lpCurrent(lpLoad()).stages.length'), 3);
assertEqual('旧版本保持原进度', runIn('lpProgress(lpAllTasks(lpLoad().versions[0])).percent'), 20);
assertEqual('新版本进度从零开始', runIn('lpProgress(lpAllTasks(lpCurrent(lpLoad()))).percent'), 0);
assertEqual('新预算精确分配', runIn('lpAllTasks(lpCurrent(lpLoad())).reduce(function(n,t){return n+t.minutes;},0)'), 90);
check('用户输入转义', '#/learning-path', ['&lt;img src=x onerror=alert(1)&gt;', '&lt;script&gt;']);
check('无匹配课程明确显示自主学习', '#/learning-path', ['No matching published course']);
assertEqual('不能修改历史版本任务', runIn("handleAct('lpToggle',{version:'1',task:'v1-s0-study'}, {}, null); lpLoad().versions[0].stages[0].tasks[0].done"), true);
check('历史版本只读', '#/learning-path/version/1', ['earlier version', ' disabled']);
check('不存在的版本返回404', '#/learning-path/version/99', ['404']);
runIn("handleSubmit(__form({topic:'Invalid',goal:'Goal',level:'beginner',hours:'0',baseVersion:'2'},'learningPath'),{preventDefault:function(){}});");
assertEqual('非法预算不会生成新版本', runIn('lpLoad().versions.length'), 2);
runIn("handleSubmit(__form({topic:'Stale',goal:'Goal',level:'beginner',hours:'2',baseVersion:'1'},'learningPath'),{preventDefault:function(){}});");
assertEqual('过期表单不会覆盖计划', runIn('lpLoad().versions.length'), 2);
runIn("state.db.courses.find(function(c){return c.id==='c1';}).status='archived';");
check('课程下架提示资源失效', '#/learning-path/version/1', ['no longer published']);
runIn("var legacyLpDb=lpLoad(); delete legacyLpDb.versions[0].stages[0].courseIds; lpSave(legacyLpDb);");
check('旧版本缺少阶段课程字段仍可展示', '#/learning-path/version/1', ['Build foundations']);
setLocale('zh');
check('学习路径中文显示', '#/learning-path', ['我的学习路径', '整体进度', '学习方法示例自测']);
setLocale('en');
as('u_t1');
check('教师不能访问路径', '#/learning-path', ['403']);
check('教师不能访问目标表单', '#/learning-path/new', ['403']);
assertEqual('教师直接调用无法读取学生计划', runIn('lpLoad().versions.length'), 0);
as('u_s1');
runIn('resetLearningPaths();');
assertEqual('重置清除路径记录', runIn('lpLoad().versions.length'), 0);
runIn("handleSubmit(__form({topic:'Data',goal:'Analyse data',level:'intermediate',hours:'1',baseVersion:'0'},'learningPath'),{preventDefault:function(){}});");
assertEqual('有基础生成四阶段', runIn('lpCurrent(lpLoad()).stages.length'), 4);
assertEqual('一小时预算仍精确分配', runIn('lpAllTasks(lpCurrent(lpLoad())).reduce(function(n,t){return n+t.minutes;},0)'), 60);
runIn("var lpOriginalSetItem=localStorage.setItem; localStorage.setItem=function(){throw new Error('Storage full');}; handleAct('lpToggle',{version:'1',task:'v1-s0-study'}, {}, null);");
assertEqual('存储失败时进度仍保存在当前页面内存', runIn('lpCurrent(lpLoad()).stages[0].tasks[0].done'), true);
check('存储失败显示提示', '#/learning-path', ['Browser storage is unavailable']);
runIn('localStorage.setItem=lpOriginalSetItem; resetLearningPaths();');
runIn("localStorage.setItem(LP_KEY+state.user.id, '{broken');");
check('损坏数据不会导致页面崩溃', '#/learning-path', ['Set a learning goal', 'Browser storage is unavailable']);
runIn('resetLearningPaths();');

console.log('\n知识测验与应用学习建议：');
as('u_s1');
runIn("handleSubmit(__form({topic:'Software engineering',goal:'Build a tested project',level:'beginner',hours:'10',baseVersion:'0'},'learningPath'),{preventDefault:function(){}});");
check('按主题展示知识测验及来源说明', '#/learning-path', ['Knowledge quiz (local sample)', 'Which is a testable requirement?', 'hand-authored']);
runIn("var quizDraftForm=__form({version:'1',stage:'0',bankId:'se-v1',attemptCount:'0',q0:'1'},'learningPathQuiz'); captureLearningPathDraft({closest:function(selector){return selector==='form[data-form=\"learningPathQuiz\"]'?quizDraftForm:null;}});");
setLocale('zh');
check('切换语言保留未提交选项', '#/learning-path', ['name="q0" value="1" checked']);
setLocale('en');
runIn("handleSubmit(__form({version:'1',stage:'0',bankId:'se-v1',attemptCount:'0',q0:'1',q1:'1',q2:'1'},'learningPathQuiz'),{preventDefault:function(){}});");
check('测验反馈包含所选答案、正确答案和解析', '#/learning-path', ['Latest result: 0/3', 'Your answer', 'Correct answer', 'Measurable conditions', 'Apply suggestion']);
assertEqual('提交测验不会自动完成任务', runIn('lpProgress(lpAllTasks(lpCurrent(lpLoad()))).percent'), 0);
runIn("handleAct('lpApplyAdvice',{version:'1',stage:'0',attempt:'0'}, {}, null);");
assertEqual('低分建议新增复习任务', runIn('lpCurrent(lpLoad()).stages[0].tasks[2].type'), 'review');
assertEqual('新增任务计入总体任务数', runIn('lpProgress(lpAllTasks(lpCurrent(lpLoad()))).total'), 11);
check('计划变化与额外时间可见', '#/learning-path', ['Added by suggestion', 'suggestions added 15 minutes', 'Plan adjustment history', 'Based on attempt 1']);
runIn("handleAct('lpApplyAdvice',{version:'1',stage:'0',attempt:'0'}, {}, null);");
assertEqual('重复点击不重复增加任务', runIn('lpCurrent(lpLoad()).stages[0].tasks.length'), 3);
runIn("handleAct('lpToggle',{version:'1',task:'v1-s0-study'}, {}, null); handleAct('lpToggle',{version:'1',task:'v1-s0-exercise'}, {}, null);");
assertEqual('阶段进度包含新增任务', runIn('lpProgress(lpCurrent(lpLoad()).stages[0].tasks).percent'), 67);
assertEqual('总体进度按所有任务计算', runIn('lpProgress(lpAllTasks(lpCurrent(lpLoad()))).percent'), 18);
runIn("handleAct('lpToggle',{version:'1',task:'v1-s0-review-a0'}, {}, null);");
assertEqual('新增任务可以标记完成', runIn('lpProgress(lpCurrent(lpLoad()).stages[0].tasks).percent'), 100);
runIn("handleSubmit(__form({version:'1',stage:'0',bankId:'se-v1',attemptCount:'1',q0:'0',q1:'0',q2:'1'},'learningPathQuiz'),{preventDefault:function(){}}); handleAct('lpApplyAdvice',{version:'1',stage:'0',attempt:'1'}, {}, null);");
assertEqual('中等成绩建议新增练习任务', runIn('lpCurrent(lpLoad()).stages[0].tasks[3].type'), 'practice');
runIn("handleSubmit(__form({version:'1',stage:'0',bankId:'se-v1',attemptCount:'2',q0:'0',q1:'0',q2:'0'},'learningPathQuiz'),{preventDefault:function(){}}); handleAct('lpApplyAdvice',{version:'1',stage:'0',attempt:'2'}, {}, null);");
assertEqual('任务未完成时不添加进阶挑战', runIn('lpCurrent(lpLoad()).stages[0].tasks.length'), 4);
runIn("handleAct('lpToggle',{version:'1',task:'v1-s0-practice-a1'}, {}, null); handleAct('lpApplyAdvice',{version:'1',stage:'0',attempt:'2'}, {}, null);");
assertEqual('高分且任务完成可添加进阶挑战', runIn('lpCurrent(lpLoad()).stages[0].tasks[4].type'), 'challenge');
assertEqual('新增挑战使阶段进度按五项任务重算', runIn('lpProgress(lpCurrent(lpLoad()).stages[0].tasks).percent'), 80);
runIn("handleAct('lpToggle',{version:'1',task:'v1-s0-challenge-a2'}, {}, null);");
assertEqual('完成进阶任务后阶段进度为100%', runIn('lpProgress(lpCurrent(lpLoad()).stages[0].tasks).percent'), 100);
runIn("handleAct('lpToggle',{version:'1',task:'v1-s0-challenge-a2'}, {}, null);");
assertEqual('撤销新增任务完成状态正确回算', runIn('lpProgress(lpCurrent(lpLoad()).stages[0].tasks).percent'), 80);
assertEqual('三类建议合计新增65分钟', runIn('lpAllTasks(lpCurrent(lpLoad())).reduce(function(n,t){return n+t.minutes;},0)'), 665);
assertEqual('原始预算保持记录', runIn('lpCurrent(lpLoad()).hours'), 10);
runIn("delete lpMemory[state.user.id];");
assertEqual('重新载入后保留调整及答案', runIn('lpCurrent(lpLoad()).stages[0].adjustments.length === 3 && lpCurrent(lpLoad()).stages[0].attempts[2].answers[0] === 0'), true);
runIn("handleSubmit(__form({version:'1',stage:'0',bankId:'se-v1',attemptCount:'0',q0:'0',q1:'0',q2:'0'},'learningPathQuiz'),{preventDefault:function(){}});");
assertEqual('过期测验表单不会重复记分', runIn('lpCurrent(lpLoad()).stages[0].attempts.length'), 3);
runIn("handleSubmit(__form({version:'1',stage:'0',bankId:'missing',q0:'0',q1:'0',q2:'0'},'learningPathQuiz'),{preventDefault:function(){}});");
assertEqual('错误题库标识不会写入结果', runIn('lpCurrent(lpLoad()).stages[0].attempts.length'), 3);
as('u_s2');
assertEqual('其他学生不能读取测验或调整记录', runIn('lpLoad().versions.length'), 0);
as('u_t1');
runIn("handleAct('lpApplyAdvice',{version:'1',stage:'0',attempt:'2'}, {}, null);");
as('u_s1');
assertEqual('教师直接调用不能改变学生计划', runIn('lpCurrent(lpLoad()).stages[0].tasks.length'), 5);
setLocale('zh');
check('知识测验与调整记录支持中文', '#/learning-path', ['知识测验（本地示例）', '哪项需求可以直接检验', '正确答案', '学习计划调整记录', '额外增加 65 分钟']);
setLocale('en');
runIn("handleSubmit(__form({topic:'History',goal:'Compare sources',level:'beginner',hours:'2',baseVersion:'1'},'learningPath'),{preventDefault:function(){}});");
check('未知主题明确回退到学习方法自测', '#/learning-path', ['No subject quiz is available', 'Learning-method example check']);
check('历史版本保留知识测验反馈和调整', '#/learning-path/version/1', ['Latest result: 3/3', 'Plan adjustment history', 'read-only']);
assertEqual('历史版本不提供应用建议按钮', runIn("viewLearningPath({version:'1'}).includes('data-act=\"lpApplyAdvice\"')"), false);
runIn("var oldScoreDb=lpLoad(); oldScoreDb.versions[0].stages[0].attempts[0]={score:0,at:'2026-10-22T00:00:00Z'}; lpSave(oldScoreDb);");
assertEqual('旧版仅分数记录无需迁移即可读取', runIn('lpLoad().versions[0].stages[0].attempts[0].score'), 0);
check('旧记录明确标注为学习方法自测', '#/learning-path/version/1', ['Earlier learning-method check (score only)']);
runIn('resetLearningPaths();');

console.log('\n集成边界与状态恢复：');
as('u_s1');
runIn("handleSubmit(__form({topic:'Software engineering',goal:'Initial goal',level:'beginner',hours:'3',baseVersion:'0'},'learningPath'),{preventDefault:function(){}});");
runIn("localStorage.removeItem(LP_KEY+state.user.id);");
assertEqual('其他标签页清除存储后不恢复旧内存数据', runIn('lpLoad().versions.length'), 0);
runIn("handleSubmit(__form({topic:'Software engineering',goal:'Initial goal',level:'beginner',hours:'3',baseVersion:'0'},'learningPath'),{preventDefault:function(){}});");
runIn("var focusedTask=false; var originalGetElement=document.getElementById; document.getElementById=function(id){return id==='lp-task-v1-s0-study'?{focus:function(){focusedTask=true;}}:originalGetElement(id);}; handleAct('lpToggle',{version:'1',task:'v1-s0-study'}, {}, null); document.getElementById=originalGetElement;");
assertEqual('更新任务后保留键盘焦点', runIn('focusedTask'), true);
runIn("var recoverySetItem=localStorage.setItem; localStorage.setItem=function(){throw new Error('quota');}; handleAct('lpToggle',{version:'1',task:'v1-s0-exercise'}, {}, null);");
check('存储异常仅在受影响学生下提示', '#/learning-path', ['Browser storage is unavailable']);
as('u_s2');
assertEqual('其他学生不继承存储错误提示', renderHash('#/learning-path').includes('Browser storage is unavailable'), false);
as('u_s1');
runIn("localStorage.setItem=recoverySetItem; handleAct('lpToggle',{version:'1',task:'v1-s0-exercise'}, {}, null);");
assertEqual('存储恢复后退出内存降级模式', runIn('!!lpVolatile[state.user.id]'), false);
assertEqual('恢复后清除错误提示', renderHash('#/learning-path').includes('Browser storage is unavailable'), false);
runIn("var remotePlan=JSON.parse(localStorage.getItem(LP_KEY+state.user.id)); remotePlan.versions[0].goal='Updated remotely'; localStorage.setItem(LP_KEY+state.user.id,JSON.stringify(remotePlan));");
assertEqual('恢复存储后可重新读取其他标签页更新', runIn('lpCurrent(lpLoad()).goal'), 'Updated remotely');
renderHash('#/learning-path/edit');
runIn("var editingDraft=__form({topic:'Software engineering',goal:'Draft goal',level:'beginner',hours:'3',baseVersion:'1'},'learningPath'); captureLearningPathDraft({closest:function(selector){return selector==='form[data-form=\"learningPath\"]'?editingDraft:null;}}); var nextRemote=lpLoad(); nextRemote.versions.push(lpGenerate({topic:'Software engineering',goal:'New remote goal',level:'beginner',hours:3},2)); localStorage.setItem(LP_KEY+state.user.id,JSON.stringify(nextRemote));");
setLocale('zh');
check('切换语言后仍保留草稿的原始版本', '#/learning-path/edit', ['name="baseVersion" value="1"', 'Draft goal']);
runIn("handleSubmit(editingDraft,{preventDefault:function(){}});");
assertEqual('过期草稿不能覆盖其他标签页新计划', runIn('lpLoad().versions.length === 2 && lpCurrent(lpLoad()).goal === "New remote goal"'), true);
setLocale('en');
const learningRoutes = ['#/learning-path', '#/learning-path/new', '#/learning-path/edit', '#/learning-path/version/1'];
for (const route of learningRoutes) {
  runIn('state.user=null;');
  renderHash(route);
  assertEqual('访客访问 ' + route + ' 跳转登录', runIn('window.location.hash'), '#/login');
  for (const userId of ['u_t1', 'u_admin']) {
    as(userId);
    check(userId + ' 访问 ' + route + ' 返回403', route, ['403']);
  }
  as('u_s1');
  check('学生可访问 ' + route, route, [route.includes('/new') || route.includes('/edit') ? 'name="topic"' : 'Overall progress']);
}
runIn('resetLearningPaths();');

console.log('\n图标规范：');
{
  // 全站不允许用 emoji 充当图标：扫描源码里的 emoji 码位
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const files = ['index.html', 'styles.css', 'learning-path.css', 'icons.js', 'i18n.js', 'data.js', 'learning-path-service.js', 'learning-path-assessment.js', 'learning-path.js', 'app.js', 'README.md'];
  const offenders = [];
  files.forEach((f) => {
    const text = readFileSync(join(here, f), 'utf8');
    text.split('\n').forEach((line, i) => {
      if (EMOJI.test(line)) offenders.push(`${f}:${i + 1} ${line.trim().slice(0, 60)}`);
    });
  });
  checks += 1;
  if (offenders.length) {
    failures += 1;
    console.error('  ✗ 发现 emoji：');
    offenders.forEach((o) => console.error('    ' + o));
  } else {
    console.log('  ✓ 源码中不含 emoji，图标全部为内联 SVG');
  }
}

console.log(`\n共 ${checks} 项检查，失败 ${failures} 项。`);
if (failures > 0) process.exit(1);
console.log('✓ 冒烟测试通过。');
