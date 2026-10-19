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

const context = vm.createContext({
  document, window, localStorage,
  setTimeout: () => 0,
  console,
  alert: () => {},
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
check('登录页', '#/login', ['auth-wrap', 'Sign in', 'Demo accounts']);
check('注册页', '#/register', ['auth-wrap', 'Student registration', 'not allowed']);
check('受限页重定向到登录', '#/admin/users', ['auth-wrap']);

console.log('\n学生 Lin Mohan（已选 COMP5241，申请 COMP5421 待审）：');
as('u_s1');
check('课程目录', '#/courses', ['COMP5241', 'Software Engineering', 'Course catalog']);
check('已选课程可见课件', '#/courses/c1', ['Lecture 01', 'i-file', 'Course materials']);
check('未选课程课件被锁', '#/courses/c3', ['Materials are hidden', 'lock-panel']);
check('我的课程', '#/my', ['My courses']);
check('设置页', '#/settings', ['Language', 'Change password']);
check('越权访问管理端返回 403', '#/admin/users', ['403', 'Access denied']);
check('越权访问教师端返回 403', '#/teacher', ['403']);

console.log('\n双语切换：');
setLocale('zh');
check('中文课程目录', '#/courses', ['课程目录', '名额']);
check('中文课程详情', '#/courses/c1', ['课程课件', '授课教师']);
check('中文 403 页面', '#/admin/users', ['403', '无权访问']);
setLocale('en');

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
