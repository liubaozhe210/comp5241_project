#!/usr/bin/env node
/**
 * 冒烟测试：用最小 DOM 桩在 Node 里跑一遍所有页面，确认没有运行时异常、关键内容出现。
 * 覆盖：登录/注册、三种角色的全部页面、403 越权、双语切换、未选课时课件区被锁。
 *
 * 用法: node smoke-test.mjs
 */
import { readFileSync } from 'node:fs';
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

const source = ['icons.js', 'i18n.js', 'data.js', 'app.js']
  .map((f) => readFileSync(join(here, f), 'utf8'))
  .join('\n;\n');

function FormDataStub(form) { this._values = (form && form._values) || {}; }
FormDataStub.prototype.get = function (k) { return Object.prototype.hasOwnProperty.call(this._values, k) ? this._values[k] : ''; };
function regForm(values) { return { _values: values, getAttribute: function (n) { return n === 'data-form' ? 'register' : null; }, reset: function () {} }; }
function testForm(values, type) { return { _values: values, getAttribute: function (n) { return n === 'data-form' ? type : null; }, reset: function () {} }; }

const context = vm.createContext({
  document, window, localStorage,
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
check('学生端 AI 模拟面试资料页', '#/interview', ['AI mock interview', 'Target role', 'Generate interview questions']);
check('进入模拟面试时显示待复习数量和复习按钮', '#/interview', ['0 answers to review', 'href="#/interview/review"', 'Review answers to improve']);
check('设置页', '#/settings', ['Language', 'Change password']);
check('越权访问管理端返回 403', '#/admin/users', ['403', 'Access denied']);
check('越权访问教师端返回 403', '#/teacher', ['403']);

console.log('\n双语切换：');
setLocale('zh');
check('中文课程目录', '#/courses', ['课程目录', '名额']);
check('中文课程详情', '#/courses/c1', ['课程课件', '授课教师']);
check('中文模拟面试资料页', '#/interview', ['AI 模拟面试', '目标岗位', '生成面试题']);
check('进入中文模拟面试时显示待复习数量和复习按钮', '#/interview', ['有 0 个回答待复习', 'href="#/interview/review"', '复习待改进回答']);
check('中文 403 页面', '#/admin/users', ['403', '无权访问']);
setLocale('en');

console.log('\n学生端 AI 模拟面试：');
as('u_s1');
runIn("handleSubmit(__form({job:'frontend', experience:'student', background:'Computer science student', skills:'React and TypeScript'}, 'interviewProfile'), { preventDefault:function(){} });");
assertEqual('根据学生背景和目标岗位生成 5 道练习题',
  runIn('state.ui.interviewSession.questions.length'), 5);
assertEqual('生成题目后跳转到独立的练习页面',
  runIn('window.location.hash'), '#/interview/session');
assertEqual('题目包含学生填写的背景',
  runIn("state.ui.interviewSession.questions[0].indexOf('Computer science student') !== -1"), true);
assertEqual('岗位题使用所填技能个性化',
  runIn("state.ui.interviewSession.questions[1].indexOf('React and TypeScript') !== -1"), true);
check('资料页不再显示生成的面试题', '#/interview', ['Target role', 'Generate interview questions']);
check('独立练习页显示第一题且不含资料表单', '#/interview/session', ['Computer science student', 'Question 1 of 5']);
assertEqual('练习页不重复显示背景填写表单',
  renderHash('#/interview/session').indexOf('Study or career background') === -1, true);
runIn("state.ui.interviewAnswer = 'I built a student project using React, gathered feedback from classmates, improved keyboard navigation, and measured the result through usability testing. '.repeat(2);");
runIn("handleAct('submitInterviewAnswer', {}, { target:{} }, null);");
assertEqual('提交回答后显示本地练习建议',
  runIn("state.ui.interviewSession.feedback"), 'interview.feedbackDetailed');
check('提交每题后立即显示该题参考回答', '#/interview/session', ['Sample answer', 'My background in Computer science student']);
assertEqual('答题过程中暂不显示整场答案汇总',
  renderHash('#/interview/session').indexOf('Sample answers for this interview') === -1, true);
assertEqual('提交的回答保存在本场面试记录中',
  runIn("state.ui.interviewSession.answers[0].indexOf('keyboard navigation') !== -1"), true);
check('回答反馈显示在独立练习页', '#/interview/session', ['Practice tip', 'clear outcome']);
runIn("handleAct('nextInterviewQuestion', {}, { target:{} }, null);");
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
runIn("for (var i = 0; i < 5; i++) { state.ui.interviewSession.index = i; state.ui.interviewSession.feedback = ''; state.ui.interviewAnswer = (i === 1 || i === 3) ? 'Brief answer.' : 'I investigated the issue, worked with the team, and improved the result by 20%. '.repeat(2); handleAct('submitInterviewAnswer', {}, { target:{} }, null); handleAct('nextInterviewQuestion', {}, { target:{} }, null); }");
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
runIn("for (var j = 0; j < 5; j++) { state.ui.interviewSession.index = j; state.ui.interviewSession.feedback = ''; state.ui.interviewAnswer = j === 0 ? 'Another brief answer.' : 'I clarified the requirement, worked with the team, delivered a tested change, and improved the result by 20%. '.repeat(2); handleAct('submitInterviewAnswer', {}, { target:{} }, null); handleAct('nextInterviewQuestion', {}, { target:{} }, null); }");
assertEqual('第二场面试完成后历史错题继续保留',
  runIn('getInterviewReviewItems().length'), 2);
check('资料页汇总多场面试的待复习数量', '#/interview', ['2 answers to review', 'href="#/interview/review"']);
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
check('没有进行中练习时仍可返回资料页', '#/interview/session', ['No interview in progress', 'Set up an interview']);

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

console.log('\n图标规范：');
{
  // 全站不允许用 emoji 充当图标：扫描源码里的 emoji 码位
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const files = ['index.html', 'styles.css', 'icons.js', 'i18n.js', 'data.js', 'app.js', 'README.md'];
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
