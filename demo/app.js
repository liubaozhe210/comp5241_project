/* CourseHub demo — 前端原型：无后端，所有数据来自 data.js 的模拟数据 */
/* global I18N, MOCK */

const DEMO_PASSWORD = 'demo1234';
const DEMO_TEACHER_CODE = 'TEACHER2026';
const SESSION_KEY = 'coursehub.demo.session';
const LOCALE_KEY = 'coursehub.demo.locale';
const INTERVIEW_HISTORY_KEY = 'coursehub.demo.interviewHistory.';

const state = {
  db: null,
  user: null,
  locale: 'en',
  ui: {
    search: '',
    userSearch: '',
    roleFilter: 'all',
    auditFilter: 'all',
    loginEmail: '',
    loginPwd: '',
    loginError: '',
    registerError: '',
    regRole: 'student',
    tab: 'info',
    formError: '',
    previewId: null,
    interviewJob: 'frontend',
    interviewExperience: 'student',
    interviewBackground: '',
    interviewSkills: '',
    interviewIntroBackground: '',
    interviewIntroSkills: '',
    interviewIntroTemplate: '',
    interviewProjectName: '',
    interviewProjectContext: '',
    interviewProjectRole: '',
    interviewProjectActions: '',
    interviewProjectSkills: '',
    interviewProjectResult: '',
    interviewProjectTemplate: '',
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
  },
};

/* ---------------- 工具 ---------------- */

function t(key, vars) {
  const dict = I18N[state.locale] || I18N.en;
  let out = dict[key];
  if (out === undefined) out = I18N.en[key];
  if (out === undefined) out = key;
  if (vars) {
    Object.keys(vars).forEach(function (k) {
      out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    });
  }
  return out;
}

function esc(value) {
  return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function localeTag() {
  return state.locale === 'zh' ? 'zh-Hans-HK' : 'en-GB';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(localeTag(), { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(localeTag(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtSize(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function initials(name) {
  return name.split(/\s+/).map(function (w) { return w.charAt(0); }).slice(0, 2).join('').toUpperCase();
}

function uid(prefix) {
  state.db.seq += 1;
  return prefix + '_' + state.db.seq;
}

function nowIso() {
  return new Date().toISOString();
}

function persist() {
  MOCK.save(state.db);
}

function addAudit(action, target) {
  if (!state.user) return;
  state.db.audit.unshift({ id: uid('a'), actorId: state.user.id, action: action, target: target, at: nowIso() });
}

/* ---------------- 查询 ---------------- */

function userById(id) { return state.db.users.filter(function (u) { return u.id === id; })[0]; }
function courseById(id) { return state.db.courses.filter(function (c) { return c.id === id; })[0]; }
function enrollmentsOf(courseId) { return state.db.enrollments.filter(function (e) { return e.courseId === courseId; }); }
function materialsOf(courseId) { return state.db.materials.filter(function (m) { return m.courseId === courseId; }); }

function myEnrollment(courseId) {
  if (!state.user) return null;
  return state.db.enrollments.filter(function (e) {
    return e.courseId === courseId && e.studentId === state.user.id;
  })[0] || null;
}

function memberCount(courseId) {
  return enrollmentsOf(courseId).filter(function (e) { return e.status === 'approved'; }).length;
}

function pendingCount(courseId) {
  return enrollmentsOf(courseId).filter(function (e) { return e.status === 'pending'; }).length;
}

function isAdmin() { return !!state.user && state.user.role === 'admin'; }
function isTeacherOf(course) { return !!state.user && state.user.role === 'teacher' && course.teacherId === state.user.id; }

function roleHome(user) {
  if (user.role === 'teacher') return '#/teacher';
  if (user.role === 'admin') return '#/admin/users';
  return '#/courses';
}

/* 详情级可见性：管理员 / 任课教师 / 已通过审批的学生 */
function canSeeCourse(course) {
  if (!course || !state.user) return false;
  if (isAdmin()) return true;
  if (isTeacherOf(course)) return true;
  const e = myEnrollment(course.id);
  return !!(e && e.status === 'approved');
}

function visibleCourses() {
  // 目录级：仅 published
  return state.db.courses.filter(function (c) { return c.status === 'published'; });
}

/* ---------------- 视图组件 ---------------- */

function roleBadge(role) {
  const cls = role === 'admin' ? 'badge-err' : role === 'teacher' ? 'badge-brand' : 'badge-grey';
  return '<span class="badge ' + cls + '">' + t('roles.' + role) + '</span>';
}

function courseStatusBadge(status) {
  const cls = status === 'published' ? 'badge-ok' : status === 'draft' ? 'badge-warn' : 'badge-grey';
  return '<span class="badge ' + cls + '">' + t('courseStatus.' + status) + '</span>';
}

function policyBadge(policy) {
  if (policy === 'open') return '<span class="badge badge-ok">' + t('catalog.policyOpen') + '</span>';
  if (policy === 'closed') return '<span class="badge badge-grey">' + t('catalog.policyClosed') + '</span>';
  return '<span class="badge badge-brand">' + t('catalog.policyApproval') + '</span>';
}

function myStatusBadge(course) {
  const e = myEnrollment(course.id);
  if (e) {
    if (e.status === 'approved') return '<span class="badge badge-ok"><i class="dot"></i>' + t('enrollStatus.enrolled') + '</span>';
    if (e.status === 'pending') return '<span class="badge badge-warn"><i class="dot"></i>' + t('enrollStatus.pending') + '</span>';
    if (e.status === 'rejected') return '<span class="badge badge-err"><i class="dot"></i>' + t('enrollStatus.rejected') + '</span>';
  }
  if (course.policy === 'closed') return '<span class="badge badge-grey">' + t('enrollStatus.closed') + '</span>';
  if (memberCount(course.id) >= course.capacity) return '<span class="badge badge-grey">' + t('enrollStatus.full') + '</span>';
  return '';
}

function emptyState(title, body, glyph) {
  return '<div class="empty"><div class="empty-ic">' + icon(glyph || 'info') + '</div>' +
    '<div class="empty-title">' + esc(title) + '</div>' +
    (body ? '<div class="empty-body">' + esc(body) + '</div>' : '') + '</div>';
}

/* ---------------- 路由 ---------------- */

const ROUTES = [
  { name: 'welcome', re: /^#\/$/, roles: null, view: viewWelcome },
  { name: 'login', re: /^#\/login$/, roles: null, view: viewLogin },
  { name: 'register', re: /^#\/register$/, roles: null, view: viewRegister },
  { name: 'catalog', re: /^#\/courses$/, roles: ['student', 'teacher', 'admin'], view: viewCatalog },
  { name: 'course', re: /^#\/courses\/([\w-]+)$/, roles: ['student', 'teacher', 'admin'], view: viewCourse, keys: ['id'] },
  { name: 'myCourses', re: /^#\/my$/, roles: ['student'], view: viewMyCourses },
  { name: 'interactiveLesson', re: /^#\/learn\/([\w-]+)$/, roles: ['student', 'teacher', 'admin'], view: PDFCOURSE.viewReader, keys: ['id'] },
  { name: 'interview', re: /^#\/interview$/, roles: ['student'], view: viewInterview },
  { name: 'interviewIntro', re: /^#\/interview\/intro$/, roles: ['student'], view: viewInterviewIntro },
  { name: 'interviewProject', re: /^#\/interview\/project$/, roles: ['student'], view: viewInterviewProject },
  { name: 'interviewSalary', re: /^#\/interview\/salary$/, roles: ['student'], view: viewInterviewSalary },
  { name: 'interviewPrep', re: /^#\/interview\/prep$/, roles: ['student'], view: viewInterviewPrep },
  { name: 'interviewSession', re: /^#\/interview\/session$/, roles: ['student'], view: viewInterviewSession },
  { name: 'interviewReviewSessionAnswer', re: /^#\/interview\/review\/([\w-]+)\/(\d+)$/, roles: ['student'], view: viewInterviewReview, keys: ['sessionId', 'index'] },
  { name: 'interviewReviewAnswer', re: /^#\/interview\/review\/(\d+)$/, roles: ['student'], view: viewInterviewReview, keys: ['index'] },
  { name: 'interviewReview', re: /^#\/interview\/review$/, roles: ['student'], view: viewInterviewReview },
  { name: 'teacherCourses', re: /^#\/teacher$/, roles: ['teacher'], view: viewTeacherCourses },
  { name: 'createCourse', re: /^#\/teacher\/new$/, roles: ['teacher'], view: viewCreateCourse },
  { name: 'pdfStudio', re: /^#\/teacher\/studio$/, roles: ['teacher'], view: PDFCOURSE.viewStudio },
  { name: 'pdfStudioEdit', re: /^#\/teacher\/studio\/([\w-]+)$/, roles: ['teacher'], view: PDFCOURSE.viewStudio, keys: ['id'] },
  { name: 'manage', re: /^#\/teacher\/([\w-]+)$/, roles: ['teacher'], view: viewManageCourse, keys: ['id'] },
  { name: 'adminUsers', re: /^#\/admin\/users$/, roles: ['admin'], view: viewAdminUsers },
  { name: 'adminCourses', re: /^#\/admin\/courses$/, roles: ['admin'], view: viewAdminCourses },
  { name: 'adminAudit', re: /^#\/admin\/audit$/, roles: ['admin'], view: viewAdminAudit },
  { name: 'settings', re: /^#\/settings$/, roles: ['student', 'teacher', 'admin'], view: viewSettings },
];

function currentHash() {
  return window.location.hash || '';
}

function go(hash) {
  window.location.hash = hash;
}

function render() {
  const app = document.getElementById('app');
  const hash = currentHash();

  if (!state.user) {
    if (hash === '#/courses' || hash === '#/my') {
      window.location.replace('#/login');
      return;
    }
  }

  let matched = null;
  let params = {};
  ROUTES.forEach(function (r) {
    if (matched) return;
    const m = hash.match(r.re);
    if (m) {
      matched = r;
      if (r.keys) r.keys.forEach(function (k, i) { params[k] = m[i + 1]; });
    }
  });

  if (!matched) {
    app.innerHTML = state.user ? shell(viewError(404)) : viewLogin();
    bindChrome();
    return;
  }

  if (matched.roles === null) {
    // 登录 / 注册
    app.innerHTML = matched.view(params);
    document.documentElement.lang = state.locale === 'zh' ? 'zh-Hans' : 'en';
    return;
  }

  if (!state.user) {
    window.location.replace('#/login');
    return;
  }

  if (matched.roles.indexOf(state.user.role) === -1) {
    app.innerHTML = shell(viewError(403));
    bindChrome();
    return;
  }

  app.innerHTML = shell(matched.view(params));
  bindChrome();
  if (state.ui.previewId) openPreviewModal(state.ui.previewId);
}

function bindChrome() {
  document.documentElement.lang = state.locale === 'zh' ? 'zh-Hans' : 'en';
  document.title = 'CourseHub — ' + t('common.appName');
}

/* ---------------- 外壳 ---------------- */

function navLink(name, hash, label, glyph, count) {
  const active = currentHash().indexOf(hash) === 0;
  const badge = count ? '<span class="nav-count">' + count + '</span>' : '';
  return '<a class="nav-item' + (active ? ' active' : '') + '" href="' + hash + '">' +
    '<span>' + glyph + esc(label) + '</span>' + badge + '</a>';
}

function sidebar() {
  const u = state.user;
  const parts = [];
  if (u.role === 'student') {
    parts.push('<div class="nav-group">' + t('nav.sectionLearn') + '</div>');
    parts.push(navLink('catalog', '#/courses', t('nav.catalog'), icon('catalog')));
    parts.push(navLink('my', '#/my', t('nav.myCourses'), icon('cap')));
    parts.push(navLink('interview', '#/interview', t('nav.interview'), icon('spark')));
  } else if (u.role === 'teacher') {
    parts.push('<div class="nav-group">' + t('nav.sectionManage') + '</div>');
    parts.push(navLink('teacher', '#/teacher', t('nav.teacherCourses'), icon('layers')));
    parts.push(navLink('new', '#/teacher/new', t('nav.createCourse'), icon('plus')));
    parts.push(navLink('studio', '#/teacher/studio', t('studio.nav'), icon('spark')));
    parts.push('<div class="nav-group">' + t('nav.sectionLearn') + '</div>');
    parts.push(navLink('catalog', '#/courses', t('nav.catalog'), icon('catalog')));
  } else {
    parts.push('<div class="nav-group">' + t('nav.sectionPlatform') + '</div>');
    parts.push(navLink('users', '#/admin/users', t('nav.users'), icon('users')));
    parts.push(navLink('courses', '#/admin/courses', t('nav.courses'), icon('grid')));
    parts.push(navLink('audit', '#/admin/audit', t('nav.audit'), icon('audit')));
  }
  parts.push('<div class="nav-group">' + t('nav.sectionAccount') + '</div>');
  parts.push(navLink('settings', '#/settings', t('nav.settings'), icon('settings')));
  return '<aside class="sidebar">' + parts.join('') + '</aside>';
}

function topbar() {
  const u = state.user;
  const isEn = state.locale === 'en';
  return '' +
    '<header class="topbar">' +
      '<div class="brand"><span class="brand-mark">' + icon('spark') + '</span>' + esc(t('common.appName')) +
        '<span class="demo-tag">' + t('common.demo') + '</span></div>' +
      '<div class="topbar-spacer"></div>' +
      '<div class="lang-switch">' +
        '<button type="button" data-act="setLocale" data-locale="en" class="' + (isEn ? 'on' : '') + '">EN</button>' +
        '<button type="button" data-act="setLocale" data-locale="zh" class="' + (isEn ? '' : 'on') + '">中文</button>' +
      '</div>' +
      '<div class="userchip">' +
        '<span class="avatar">' + esc(initials(u.name)) + '</span>' +
        '<span>' + esc(u.name) + ' ' + roleBadge(u.role) + '</span>' +
      '</div>' +
      '<a class="icon-btn" href="#/settings" title="' + t('common.settings') + '">' + icon('settings') + '</a>' +
      '<button type="button" class="icon-btn" data-act="logout">' + t('common.signOut') + '</button>' +
    '</header>';
}

function shell(content) {
  return topbar() + '<div class="layout">' + sidebar() + '<main class="main">' + content + '</main></div>';
}

function pageHead(title, sub, actionsHtml) {
  return '<div class="page-head"><div><h1>' + esc(title) + '</h1>' +
    (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' +
    (actionsHtml ? '<div class="page-head-actions">' + actionsHtml + '</div>' : '') + '</div>';
}

function viewError(code) {
  const isForbidden = code === 403;
  return '<div class="centered-page"><div class="error-card card"><div class="card-body">' +
    '<div class="error-code">' + code + '</div>' +
    '<h2 style="margin:10px 0 6px">' + t(isForbidden ? 'errors.forbidden' : 'errors.notFound') + '</h2>' +
    '<p class="muted small">' + t(isForbidden ? 'errors.forbiddenBody' : 'errors.notFoundBody') + '</p>' +
    '<div class="row" style="justify-content:center;margin-top:16px">' +
      '<a class="btn btn-ghost" href="#/courses">' + t('errors.goHome') + '</a>' +
    '</div></div></div></div>';
}

/* ---------------- 登录 / 注册 ---------------- */

function langSwitchInline() {
  const isEn = state.locale === 'en';
  return '<div class="lang-switch">' +
    '<button type="button" data-act="setLocale" data-locale="en" class="' + (isEn ? 'on' : '') + '">EN</button>' +
    '<button type="button" data-act="setLocale" data-locale="zh" class="' + (isEn ? '' : 'on') + '">中文</button>' +
    '</div>';
}

function viewWelcome() {
  return '<div class="auth-wrap">' +
    '<div class="auth-side">' +
      '<div class="brand"><span class="brand-mark">' + icon('spark') + '</span>' + esc(t('common.appName')) +
        '<span class="demo-tag">' + t('common.demo') + '</span></div>' +
      '<h1>' + t('welcome.title') + '</h1>' +
      '<p>' + t('welcome.subtitle') + '</p>' +
      '<ul class="auth-points">' +
        '<li>' + icon('shield') + t('login.sidePoint1') + '</li>' +
        '<li>' + icon('check') + t('login.sidePoint2') + '</li>' +
        '<li>' + icon('lock') + t('login.sidePoint3') + '</li>' +
      '</ul>' +
    '</div>' +
    '<div class="auth-panel"><div class="stack">' +
      '<div class="row"><div class="spacer"></div>' + langSwitchInline() + '</div>' +
      '<div><h1>' + t('common.appName') + '</h1><p class="muted small" style="margin-top:4px">' + t('welcome.panelSub') + '</p></div>' +
      '<a class="btn btn-block" href="#/register">' + t('welcome.registerBtn') + '</a>' +
      '<a class="btn btn-ghost btn-block" href="#/login">' + t('welcome.loginBtn') + '</a>' +
    '</div></div>' +
  '</div>';
}

function viewLogin() {
  const demos = state.db.users.filter(function (u) { return u.role !== 'student' || u.id === 'u_s1' || u.id === 'u_s4'; });
  const chipIcon = { admin: 'shield', teacher: 'layers', student: 'cap' };
  const chips = demos.map(function (u) {
    const label = t('roles.' + u.role) + ' · ' + u.name + (u.status === 'disabled' ? ' (' + t('admin.disabled') + ')' : '');
    return '<button type="button" class="chip" data-act="demoLogin" data-email="' + esc(u.email) + '">' +
      icon(chipIcon[u.role] || 'user') + esc(label) + '</button>';
  }).join('');

  return '<div class="auth-wrap">' +
    '<div class="auth-side">' +
      '<div class="brand"><span class="brand-mark">' + icon('spark') + '</span>' + esc(t('common.appName')) +
        '<span class="demo-tag">' + t('common.demo') + '</span></div>' +
      '<h1>' + t('login.sideTitle') + '</h1>' +
      '<p>' + t('login.sideBody') + '</p>' +
      '<ul class="auth-points">' +
        '<li>' + icon('shield') + t('login.sidePoint1') + '</li>' +
        '<li>' + icon('check') + t('login.sidePoint2') + '</li>' +
        '<li>' + icon('lock') + t('login.sidePoint3') + '</li>' +
      '</ul>' +
    '</div>' +
    '<div class="auth-panel"><div class="stack">' +
      '<div class="row"><div class="spacer"></div>' + langSwitchInline() + '</div>' +
      '<div><h1>' + t('login.title') + '</h1><p class="muted small" style="margin-top:4px">' + t('login.subtitle') + '</p></div>' +
      (state.ui.loginError ? '<div class="form-error">' + esc(state.ui.loginError) + '</div>' : '') +
      '<form data-form="login" class="stack">' +
        '<div class="field"><label>' + t('common.email') + '</label>' +
          '<input class="input" type="email" name="email" value="' + esc(state.ui.loginEmail) + '" autocomplete="username" required></div>' +
        '<div class="field"><label>' + t('common.password') + '</label>' +
          '<input class="input" type="password" name="password" value="' + esc(DEMO_PASSWORD) + '" autocomplete="current-password" required></div>' +
        '<button class="btn btn-block" type="submit">' + t('common.signIn') + '</button>' +
      '</form>' +
      '<div class="field"><label>' + t('login.demoAccounts') + '</label><div class="chips">' + chips + '</div></div>' +
      '<div class="row small"><span class="muted">' + t('login.noAccount') + '</span><a href="#/register">' + t('login.goRegister') + '</a></div>' +
    '</div></div>' +
  '</div>';
}

function viewRegister() {
  return '<div class="auth-wrap">' +
    '<div class="auth-side">' +
      '<div class="brand"><span class="brand-mark">' + icon('spark') + '</span>' + esc(t('common.appName')) +
        '<span class="demo-tag">' + t('common.demo') + '</span></div>' +
      '<h1>' + t('register.title') + '</h1>' +
      '<p>' + t('register.subtitle') + '</p>' +
    '</div>' +
    '<div class="auth-panel"><div class="stack">' +
      '<div class="row"><div class="spacer"></div>' + langSwitchInline() + '</div>' +
      '<div><h1>' + t('register.title') + '</h1><p class="muted small" style="margin-top:4px">' + t('register.subtitle') + '</p></div>' +
      (state.ui.registerError ? '<div class="form-error">' + esc(state.ui.registerError) + '</div>' : '') +
      '<form data-form="register" class="stack">' +
        '<div class="field"><label>' + t('register.roleLabel') + '</label>' +
          '<div class="row">' +
            '<button type="button" class="btn btn-sm ' + (state.ui.regRole === 'student' ? '' : 'btn-ghost') + '" data-act="setRegRole" data-role="student">' + t('roles.student') + '</button>' +
            '<button type="button" class="btn btn-sm ' + (state.ui.regRole === 'teacher' ? '' : 'btn-ghost') + '" data-act="setRegRole" data-role="teacher">' + t('roles.teacher') + '</button>' +
          '</div></div>' +
        '<div class="field"><label>' + t('common.loginId') + '</label><input class="input" name="loginId" required></div>' +
        '<div class="field"><label>' + t('common.name') + '</label><input class="input" name="name" required></div>' +
        '<div class="field"><label>' + t('common.email') + '</label><input class="input" type="email" name="email" required></div>' +
        (state.ui.regRole === 'teacher'
          ? '<div class="field"><label>' + t('register.inviteCode') + '</label><input class="input" name="inviteCode" placeholder="TEACHER2026" required>' +
            '<div class="small muted" style="margin-top:4px">' + t('register.inviteHint') + '</div></div>'
          : '') +
        '<div class="field"><label>' + t('common.password') + '</label><input class="input" type="password" name="password" required></div>' +
        '<div class="field"><label>' + t('common.confirmPassword') + '</label><input class="input" type="password" name="confirm" required></div>' +
        '<button class="btn btn-block" type="submit">' + t('common.submit') + '</button>' +
      '</form>' +
      '<div class="row small"><a href="#/login">' + icon('back') + ' ' + t('common.signIn') + '</a></div>' +
    '</div></div>' +
  '</div>';
}

/* ---------------- 学生端 ---------------- */

/* 课程封面：预生成的程序化封面按 id 映射，新建课程按 id 哈希落到通用封面 */
const COVER_KEYS = { c1: 'c1', c2: 'c2', c3: 'c3', c4: 'c4', c5: 'c5', c6: 'c6' };

function coverFor(course) {
  let key = COVER_KEYS[course.id];
  if (!key) {
    let h = 0;
    const src = String(course.id || course.code || '');
    for (let i = 0; i < src.length; i++) h = (h * 31 + src.charCodeAt(i)) >>> 0;
    key = 'g' + (h % 3 + 1);
  }
  return 'assets/cover-' + key + '.jpg';
}

function courseCard(course) {
  const teacher = userById(course.teacherId);
  const seats = memberCount(course.id) + '/' + course.capacity;
  const flag = myStatusBadge(course) || policyBadge(course.policy);
  return '<a class="card course-card" href="#/courses/' + course.id + '">' +
    '<div class="cover">' +
      '<img class="cover-img" src="' + coverFor(course) + '" alt="" loading="lazy" draggable="false">' +
      '<span class="course-code">' + esc(course.code) + '</span>' +
      '<span class="cover-badge">' + flag + '</span>' +
    '</div>' +
    '<div class="course-body">' +
      '<div class="course-name">' + esc(course.name) + '</div>' +
      '<div class="course-meta"><span>' + esc(teacher ? teacher.name : '—') + '</span><span>·</span><span>' + esc(course.semester) + '</span></div>' +
      '<div class="course-desc">' + esc(course.description) + '</div>' +
      '<div class="course-foot">' +
        '<span class="small muted">' + t('catalog.seats') + ' ' + seats + '</span>' +
        '<span class="spacer"></span>' +
        '<span class="small muted">' + icon('next') + '</span>' +
      '</div>' +
    '</div></a>';
}

function viewCatalog() {
  const q = state.ui.search.trim().toLowerCase();
  const list = visibleCourses().filter(function (c) {
    if (!q) return true;
    return (c.name + ' ' + c.code).toLowerCase().indexOf(q) !== -1;
  });

  const actions = isAdmin() || state.user.role === 'teacher'
    ? ''
    : '<a class="btn btn-ghost btn-sm" href="#/my">' + t('nav.myCourses') + '</a>';

  return '<div class="page">' + pageHead(t('catalog.title'), t('catalog.subtitle'), actions) +
    '<div class="row" style="margin-bottom:16px">' +
      '<div class="search"><input class="input" data-bind="search" placeholder="' + t('catalog.searchPh') + '" value="' + esc(state.ui.search) + '"></div>' +
      '<span class="small muted">' + list.length + ' / ' + visibleCourses().length + '</span>' +
    '</div>' +
    (list.length
      ? '<div class="grid grid-cards">' + list.map(courseCard).join('') + '</div>'
      : '<div class="card">' + emptyState(t('catalog.empty'), t('catalog.emptyBody'), 'search') + '</div>') +
  '</div>';
}

function materialRow(m, opts) {
  const canDelete = opts && opts.manage;
  return '<div class="list-row">' +
    '<span class="file-icon">' + icon('file') + '</span>' +
    '<div style="min-width:0;flex:1">' +
      '<div style="font-weight:600;font-size:13.5px">' + esc(m.title) + '</div>' +
      '<div class="small muted">' + m.pages + ' ' + t('course.pages') + ' · ' + fmtSize(m.size) + ' · ' + fmtDate(m.createdAt) + '</div>' +
    '</div>' +
    '<div class="cell-actions">' +
      '<button class="btn btn-ghost btn-sm" data-act="preview" data-id="' + m.id + '">' + t('common.preview') + '</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="download" data-id="' + m.id + '">' + t('common.download') + '</button>' +
      (canDelete ? '<button class="btn btn-danger btn-sm" data-act="deleteMaterial" data-id="' + m.id + '">' + t('common.delete') + '</button>' : '') +
    '</div>' +
  '</div>';
}

function enrollmentAction(course) {
  const e = myEnrollment(course.id);
  if (e && e.status === 'approved') {
    return '<div class="note note-ok">' + icon('check') + '<span>' + t('course.enrolledNote') + '</span></div>';
  }
  if (e && e.status === 'pending') {
    return '<div class="note note-warn">' + icon('info') + '<span>' + t('course.pendingNote') + '</span></div>' +
      '<button class="btn btn-ghost btn-block" data-act="withdraw" data-id="' + course.id + '">' + t('course.withdrawBtn') + '</button>';
  }
  if (course.policy === 'closed') return '<div class="note">' + icon('lock') + '<span>' + t('course.closedNote') + '</span></div>';
  if (memberCount(course.id) >= course.capacity) return '<div class="note">' + icon('lock') + '<span>' + t('course.fullNote') + '</span></div>';
  const rejected = e && e.status === 'rejected'
    ? '<div class="note note-err">' + icon('x') + '<span>' + t('course.rejectedNote') + '</span></div>' : '';
  return rejected + '<button class="btn btn-block" data-act="apply" data-id="' + course.id + '">' + t('course.applyBtn') + '</button>';
}

/* 课程详情 / 课程管理的顶部封面横幅 */
function courseHero(course, actionsHtml) {
  const teacher = userById(course.teacherId);
  return '<div class="course-hero">' +
    '<img class="course-hero-img" src="' + coverFor(course) + '" alt="" draggable="false">' +
    '<div class="course-hero-scrim"></div>' +
    '<div class="course-hero-actions">' + (actionsHtml || '') + '</div>' +
    '<div class="course-hero-body">' +
      '<div class="row" style="gap:8px"><span class="hero-code">' + esc(course.code) + '</span>' +
        courseStatusBadge(course.status) + policyBadge(course.policy) + '</div>' +
      '<h1>' + esc(course.name) + '</h1>' +
      '<div class="hero-sub">' + esc(teacher ? teacher.name : '—') + ' · ' + esc(course.semester) +
        ' · ' + memberCount(course.id) + '/' + course.capacity + '</div>' +
    '</div>' +
  '</div>';
}

function viewCourse(params) {
  const course = courseById(params.id);
  if (!course) return viewError(404);

  const teacher = userById(course.teacherId);
  const canSee = canSeeCourse(course);
  const mats = materialsOf(course.id);
  const isTeacherViewer = isTeacherOf(course) || isAdmin();

  const materialsBlock = canSee
    ? '<div class="card"><div class="card-head"><h2>' + t('course.materials') + '</h2>' +
        '<span class="spacer"></span><span class="badge badge-grey">' + mats.length + '</span></div>' +
        (mats.length ? mats.map(function (m) { return materialRow(m, { manage: isTeacherViewer }); }).join('')
          : emptyState(t('course.noMaterials'), t('course.noMaterialsBody'), 'file')) + '</div>'
    : '<div class="lock-panel"><span class="lock-icon">' + icon('lock') + '</span><div>' +
        '<div style="font-weight:650">' + t('course.lockedTitle') + '</div>' +
        '<div class="small muted">' + t('course.lockedBody') + '</div></div></div>';

  const info = '<div class="card"><div class="card-head"><h2>' + t('course.about') + '</h2></div>' +
    '<div class="card-body"><p class="muted" style="font-size:14px">' + esc(course.description) + '</p></div></div>';

  const aside = '<div class="card"><div class="card-body stack" style="gap:14px">' +
    '<dl class="kv">' +
      '<dt>' + t('course.teacher') + '</dt><dd>' + esc(teacher ? teacher.name : '—') + '</dd>' +
      '<dt>' + t('course.semester') + '</dt><dd>' + esc(course.semester) + '</dd>' +
      '<dt>' + t('catalog.seats') + '</dt><dd>' + memberCount(course.id) + ' / ' + course.capacity + '</dd>' +
      '<dt>' + t('manage.policy') + '</dt><dd>' + policyBadge(course.policy) + '</dd>' +
    '</dl>' +
    (state.user.role === 'student' ? '<div class="stack" style="gap:8px">' + enrollmentAction(course) + '</div>' : '') +
    (isTeacherViewer && course.status !== 'published' ? '<div class="badge badge-warn">' + t('courseStatus.' + course.status) + '</div>' : '') +
  '</div></div>';

  return '<div class="page">' +
    courseHero(course, '<a class="btn btn-ghost btn-sm" href="#/courses">' + icon('back') + ' ' + t('common.back') + '</a>') +
    '<div class="grid course-detail-grid">' +
      '<div class="stack">' + info + PDFCOURSE.courseSection(course) + materialsBlock + '</div>' +
      aside +
    '</div>' +
  '</div>';
}

function viewMyCourses() {
  const mine = state.db.enrollments.filter(function (e) { return e.studentId === state.user.id; });
  const approved = mine.filter(function (e) { return e.status === 'approved'; }).map(function (e) { return courseById(e.courseId); }).filter(Boolean);
  const pending = mine.filter(function (e) { return e.status === 'pending'; }).map(function (e) { return courseById(e.courseId); }).filter(Boolean);
  const rejected = mine.filter(function (e) { return e.status === 'rejected'; }).map(function (e) { return courseById(e.courseId); }).filter(Boolean);

  const pendCard = pending.length
    ? '<div class="card"><div class="card-head"><h2>' + t('course.applications') + '</h2></div>' +
      pending.map(function (c) {
        return '<div class="list-row"><div style="flex:1"><a href="#/courses/' + c.id + '" style="font-weight:600">' + esc(c.name) + '</a>' +
          '<div class="small muted">' + esc(c.code) + ' · ' + esc((userById(c.teacherId) || {}).name || '') + '</div></div>' +
          '<span class="badge badge-warn">' + t('enrollStatus.pending') + '</span>' +
          '<button class="btn btn-ghost btn-sm" data-act="withdraw" data-id="' + c.id + '">' + t('course.withdrawBtn') + '</button></div>';
      }).join('') + '</div>'
    : '';

  const rejCard = rejected.length
    ? '<div class="card"><div class="card-head"><h2>' + t('enrollStatus.rejected') + '</h2></div>' +
      rejected.map(function (c) {
        return '<div class="list-row"><div style="flex:1"><a href="#/courses/' + c.id + '">' + esc(c.name) + '</a>' +
          '<div class="small muted">' + esc(c.code) + '</div></div>' +
          '<span class="badge badge-err">' + t('enrollStatus.rejected') + '</span>' +
          '<button class="btn btn-ghost btn-sm" data-act="apply" data-id="' + c.id + '">' + t('course.applyBtn') + '</button></div>';
      }).join('') + '</div>'
    : '';

  return '<div class="page">' + pageHead(t('nav.myCourses'), t('catalog.subtitle'), '<a class="btn btn-ghost btn-sm" href="#/courses">' + t('nav.catalog') + '</a>') +
    '<div class="stack">' +
      (approved.length ? '<div class="grid grid-cards">' + approved.map(courseCard).join('') + '</div>'
        : '<div class="card">' + emptyState(t('my.empty'), t('my.emptyBody'), 'cap') + '</div>') +
      pendCard + rejCard +
    '</div>' +
  '</div>';
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

function viewInterviewIntro() {
  const template = state.ui.interviewIntroTemplate
    ? '<div class="interview-template"><h2>' + t('interview.generatedIntro') + '</h2><p>' +
      esc(t('interview.introTemplate', {
        name: state.user.name,
        background: state.ui.interviewIntroBackground || t('interview.defaultBackground'),
        job: t('interview.job.' + state.ui.interviewJob),
        skills: state.ui.interviewIntroSkills || state.ui.interviewSkills || t('interview.defaultSkills'),
      })) + '</p></div>'
    : '';
  return '<div class="page">' + pageHead(t('interview.sectionIntro'), t('interview.sectionIntroBody'),
    '<a class="btn btn-ghost btn-sm" href="#/interview">' + icon('back') + ' ' + t('interview.backToPractice') + '</a>') +
    '<div class="card"><div class="card-head"><h2>' + t('interview.introInfoTitle') + '</h2></div><div class="card-body">' +
      '<form data-form="interviewIntro" class="stack">' +
        '<div class="field"><label>' + t('interview.background') + '</label><textarea class="textarea" name="background" data-bind="interviewIntroBackground" maxlength="240" placeholder="' +
          t('interview.backgroundPh') + '">' + esc(state.ui.interviewIntroBackground) + '</textarea></div>' +
        '<div class="field"><label>' + t('interview.skills') + '</label><textarea class="textarea" name="skills" data-bind="interviewIntroSkills" maxlength="200" placeholder="' +
          t('interview.skillsPh') + '">' + esc(state.ui.interviewIntroSkills) + '</textarea></div>' +
        '<div class="row"><span class="hint">' + t('interview.introUserInfo', { name: state.user.name }) +
          '</span><span class="spacer"></span><button class="btn" type="submit">' + t('interview.generateIntro') + '</button></div>' +
      '</form></div></div>' + template +
  '</div>';
}

function viewInterviewProject() {
  const template = state.ui.interviewProjectTemplate
    ? '<div class="interview-template"><h2>' + t('interview.generatedProject') + '</h2><p>' +
      esc(t('interview.projectTemplate', {
        name: state.ui.interviewProjectName,
        context: state.ui.interviewProjectContext,
        role: state.ui.interviewProjectRole,
        actions: state.ui.interviewProjectActions,
        skills: state.ui.interviewProjectSkills,
        result: state.ui.interviewProjectResult,
      })) + '</p></div>'
    : '';
  return '<div class="page">' + pageHead(t('interview.sectionProject'), t('interview.sectionProjectBody'),
    '<a class="btn btn-ghost btn-sm" href="#/interview">' + icon('back') + ' ' + t('interview.backToPractice') + '</a>') +
    '<div class="card"><div class="card-head"><h2>' + t('interview.projectInfoTitle') + '</h2></div><div class="card-body">' +
      '<form data-form="interviewProject" class="stack">' +
        '<div class="field"><label>' + t('interview.projectName') + '</label><input class="input" name="projectName" data-bind="interviewProjectName" maxlength="100" value="' +
          esc(state.ui.interviewProjectName) + '"></div>' +
        '<div class="field"><label>' + t('interview.projectContext') + '</label><textarea class="textarea" name="projectContext" data-bind="interviewProjectContext" maxlength="300">' +
          esc(state.ui.interviewProjectContext) + '</textarea></div>' +
        '<div class="field"><label>' + t('interview.projectRole') + '</label><input class="input" name="projectRole" data-bind="interviewProjectRole" maxlength="160" value="' +
          esc(state.ui.interviewProjectRole) + '"></div>' +
        '<div class="field"><label>' + t('interview.projectActions') + '</label><textarea class="textarea" name="projectActions" data-bind="interviewProjectActions" maxlength="300">' +
          esc(state.ui.interviewProjectActions) + '</textarea></div>' +
        '<div class="field"><label>' + t('interview.projectSkills') + '</label><input class="input" name="projectSkills" data-bind="interviewProjectSkills" maxlength="160" value="' +
          esc(state.ui.interviewProjectSkills) + '"></div>' +
        '<div class="field"><label>' + t('interview.projectResult') + '</label><textarea class="textarea" name="projectResult" data-bind="interviewProjectResult" maxlength="240">' +
          esc(state.ui.interviewProjectResult) + '</textarea></div>' +
        '<div class="row"><span class="spacer"></span><button class="btn" type="submit">' + t('interview.generateProject') + '</button></div>' +
      '</form></div></div>' + template +
  '</div>';
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

function viewTeacherCourses() {
  const mine = state.db.courses.filter(function (c) { return c.teacherId === state.user.id; });
  const rows = mine.map(function (c) {
    const pending = pendingCount(c.id);
    return '<div class="list-row">' +
      '<div style="flex:1;min-width:0">' +
        '<div class="row" style="gap:8px"><span class="mono muted">' + esc(c.code) + '</span>' + courseStatusBadge(c.status) + '</div>' +
        '<div style="font-weight:650;margin-top:3px">' + esc(c.name) + '</div>' +
        '<div class="small muted">' + esc(c.semester) + ' · ' + memberCount(c.id) + '/' + c.capacity + ' · ' + materialsOf(c.id).length + ' ' + t('course.materials') + '</div>' +
      '</div>' +
      (pending ? '<span class="badge badge-warn">' + pending + ' ' + t('course.applications') + '</span>' : '') +
      '<a class="btn btn-ghost btn-sm" href="#/teacher/' + c.id + '">' + t('manage.tabInfo') + ' →</a>' +
    '</div>';
  }).join('');

  return '<div class="page">' + pageHead(t('nav.teacherCourses'), t('catalog.subtitle'),
    '<a class="btn btn-sm" href="#/teacher/new">' + icon('plus') + ' ' + t('nav.createCourse') + '</a>') +
    '<div class="card">' + (mine.length ? rows : emptyState(t('catalog.empty'), t('catalog.emptyBody'), 'layers')) + '</div>' +
  '</div>';
}

function courseFormFields(c, opts) {
  const semesters = ['2026/27 Semester 1', '2026/27 Semester 2', '2025/26 Semester 2'];
  const isNew = !c;
  return '' +
    '<div class="grid grid-2">' +
      '<div class="field"><label>' + t('manage.courseCode') + '</label>' +
        '<input class="input" name="code" value="' + esc(isNew ? '' : c.code) + '" ' + (isNew ? 'required' : 'disabled') + ' placeholder="COMP5xxx"></div>' +
      '<div class="field"><label>' + t('manage.semester') + '</label>' +
        '<select class="select" name="semester">' + semesters.map(function (s) {
          return '<option value="' + s + '"' + (c && c.semester === s ? ' selected' : '') + '>' + s + '</option>';
        }).join('') + '</select></div>' +
    '</div>' +
    '<div class="field"><label>' + t('manage.courseName') + '</label>' +
      '<input class="input" name="name" value="' + esc(isNew ? '' : c.name) + '" required></div>' +
    '<div class="field"><label>' + t('manage.description') + '</label>' +
      '<textarea class="textarea" name="description">' + esc(isNew ? '' : c.description) + '</textarea></div>' +
    '<div class="grid grid-2">' +
      '<div class="field"><label>' + t('manage.capacity') + '</label>' +
        '<input class="input" type="number" min="1" name="capacity" value="' + (isNew ? 30 : c.capacity) + '" required></div>' +
      '<div class="field"><label>' + t('manage.policy') + '</label>' +
        '<select class="select" name="policy">' +
          ['approval', 'open', 'closed'].map(function (p) {
            return '<option value="' + p + '"' + (c && c.policy === p ? ' selected' : '') + '>' + t('catalog.policy' + p.charAt(0).toUpperCase() + p.slice(1)) + '</option>';
          }).join('') +
        '</select></div>' +
    '</div>';
}

function viewCreateCourse() {
  return '<div class="page">' + pageHead(t('create.title'), t('create.subtitle'), '<a class="btn btn-ghost btn-sm" href="#/teacher">' + icon('back') + ' ' + t('common.back') + '</a>') +
    '<div class="card" style="max-width:720px"><div class="card-body">' +
      (state.ui.formError ? '<div class="form-error" style="margin-bottom:12px">' + esc(state.ui.formError) + '</div>' : '') +
      '<form data-form="createCourse" class="stack">' + courseFormFields(null, {}) +
        '<div class="row"><span class="spacer"></span><button class="btn" type="submit">' + t('create.submit') + '</button></div>' +
      '</form>' +
    '</div></div>' +
  '</div>';
}

function viewManageCourse(params) {
  const course = courseById(params.id);
  if (!course) return viewError(404);
  if (!isTeacherOf(course)) return viewError(403);

  const tab = state.ui.tab;
  const pending = pendingCount(course.id);
  const statusAction = course.status === 'published'
    ? '<button class="btn btn-danger btn-sm" data-act="archive" data-id="' + course.id + '">' + t('manage.archive') + '</button>'
    : '<button class="btn btn-ok btn-sm" data-act="publish" data-id="' + course.id + '">' + (course.status === 'draft' ? t('manage.publish') : t('manage.restore')) + '</button>';

  const tabs = '<div class="tabs">' +
    ['info', 'materials', 'members', 'applications'].map(function (k) {
      const label = t('manage.tab' + k.charAt(0).toUpperCase() + k.slice(1));
      const count = k === 'applications' && pending ? '<span class="nav-count">' + pending + '</span>' : '';
      return '<button class="tab' + (tab === k ? ' active' : '') + '" data-act="tab" data-tab="' + k + '">' + label + count + '</button>';
    }).join('') + '</div>';

  let panel = '';
  if (tab === 'info') {
    panel = '<div class="card-body">' +
      (state.ui.formError ? '<div class="form-error" style="margin-bottom:12px">' + esc(state.ui.formError) + '</div>' : '') +
      '<form data-form="courseInfo" class="stack">' + courseFormFields(course, {}) +
        '<div class="row"><span class="spacer"></span><button class="btn" type="submit">' + t('manage.saveInfo') + '</button></div>' +
      '</form></div>';
  } else if (tab === 'materials') {
    const mats = materialsOf(course.id);
    panel = '<div class="card-body stack">' +
      '<div class="lock-panel" style="justify-content:space-between">' +
        '<div><div style="font-weight:650">' + t('course.uploadMaterial') + '</div>' +
          '<div class="small muted">' + t('course.fileHint') + '</div></div>' +
        '<div class="row"><input type="file" id="matFile" accept="application/pdf,.pdf" style="max-width:230px">' +
        '<button class="btn btn-sm" data-act="uploadMaterial" data-id="' + course.id + '">' + t('common.upload') + '</button></div>' +
      '</div>' +
      '<div class="card" style="box-shadow:none">' +
        (mats.length ? mats.map(function (m) { return materialRow(m, { manage: true }); }).join('')
          : emptyState(t('course.noMaterials'), t('course.noMaterialsBody'), 'file')) +
      '</div></div>';
  } else if (tab === 'members') {
    const members = enrollmentsOf(course.id).filter(function (e) { return e.status === 'approved'; });
    const rows = members.map(function (e) {
      const s = userById(e.studentId);
      return '<tr><td><div style="font-weight:600">' + esc(s ? s.name : '?') + '</div>' +
        '<div class="small muted mono">' + esc(s ? s.loginId : '') + '</div></td>' +
        '<td>' + esc(s ? s.email : '') + '</td>' +
        '<td>' + (e.source === 'teacher_add' ? t('manage.addStudent') : t('course.applyBtn')) + '</td>' +
        '<td>' + fmtDate(e.decidedAt || e.appliedAt) + '</td>' +
        '<td><button class="btn btn-danger btn-sm" data-act="removeMember" data-id="' + e.id + '">' + t('common.remove') + '</button></td></tr>';
    }).join('');

    panel = '<div class="card-body stack">' +
      '<form data-form="addMember" class="row">' +
        '<input class="input" name="query" placeholder="' + t('manage.addStudentPh') + '" style="max-width:320px" required>' +
        '<button class="btn btn-sm" type="submit">' + t('manage.addStudent') + '</button>' +
      '</form>' +
      '<div class="table-wrap card" style="box-shadow:none">' +
        (members.length ? '<table class="table"><thead><tr><th>' + t('common.name') + '</th><th>' + t('common.email') +
          '</th><th>' + t('manage.source') + '</th><th>' + t('manage.decidedAt') + '</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
          : emptyState(t('course.noMembers'), t('catalog.emptyBody'), 'users')) +
      '</div></div>';
  } else {
    const pendingList = enrollmentsOf(course.id).filter(function (e) { return e.status === 'pending'; });
    panel = '<div class="card-body stack">' +
      (pendingList.length ? pendingList.map(function (e) {
        const s = userById(e.studentId);
        return '<div class="list-row">' +
          '<span class="avatar">' + esc(initials(s ? s.name : '?')) + '</span>' +
          '<div style="flex:1"><div style="font-weight:600">' + esc(s ? s.name : '?') + '</div>' +
            '<div class="small muted mono">' + esc(s ? s.loginId : '') + ' · ' + fmtDate(e.appliedAt) + '</div></div>' +
          '<div class="cell-actions">' +
            '<button class="btn btn-ok btn-sm" data-act="approve" data-id="' + e.id + '">' + t('manage.approve') + '</button>' +
            '<button class="btn btn-danger btn-sm" data-act="reject" data-id="' + e.id + '">' + t('manage.reject') + '</button>' +
          '</div></div>';
      }).join('') : emptyState(t('course.noApplications'), t('course.noApplicationsBody'), 'check')) +
    '</div>';
  }

  return '<div class="page">' +
    courseHero(course, statusAction +
      '<a class="btn btn-ghost btn-sm" href="#/teacher">' + icon('back') + ' ' + t('common.back') + '</a>') +
    '<div class="card" style="margin-top:18px"><div style="padding:0 6px">' + tabs + '</div>' + panel + '</div>' +
  '</div>';
}

/* ---------------- 管理端 ---------------- */

function viewAdminUsers() {
  const q = state.ui.userSearch.trim().toLowerCase();
  const roleFilter = state.ui.roleFilter;
  const list = state.db.users.filter(function (u) {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!q) return true;
    return (u.name + ' ' + u.loginId + ' ' + u.email).toLowerCase().indexOf(q) !== -1;
  });

  const rows = list.map(function (u) {
    const isSelf = u.id === state.user.id;
    return '<tr>' +
      '<td><div style="font-weight:600">' + esc(u.name) + (isSelf ? ' <span class="small muted">(' + t('admin.you') + ')</span>' : '') + '</div>' +
        '<div class="small muted mono">' + esc(u.loginId) + '</div></td>' +
      '<td class="small">' + esc(u.email) + '</td>' +
      '<td>' + roleBadge(u.role) + '</td>' +
      '<td>' + (u.status === 'active' ? '<span class="badge badge-ok">' + t('admin.active') + '</span>'
        : '<span class="badge badge-err">' + t('admin.disabled') + '</span>') + '</td>' +
      '<td><div class="cell-actions">' +
        '<select class="select" style="width:120px;padding:5px 8px;font-size:12.5px" data-act="changeRole" data-id="' + u.id + '"' + (isSelf ? ' disabled' : '') + '>' +
          ['student', 'teacher', 'admin'].map(function (r) {
            return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + t('roles.' + r) + '</option>';
          }).join('') +
        '</select>' +
        (u.status === 'active'
          ? '<button class="btn btn-danger btn-sm" data-act="toggleUser" data-id="' + u.id + '"' + (isSelf ? ' disabled' : '') + '>' + t('admin.disable') + '</button>'
          : '<button class="btn btn-ok btn-sm" data-act="toggleUser" data-id="' + u.id + '">' + t('admin.enable') + '</button>') +
        '<button class="btn btn-ghost btn-sm" data-act="resetPwd" data-id="' + u.id + '">' + t('admin.resetPwd') + '</button>' +
      '</div></td></tr>';
  }).join('');

  return '<div class="page">' + pageHead(t('admin.usersTitle'), t('admin.usersSub')) +
    '<div class="row" style="margin-bottom:14px">' +
      '<div class="search"><input class="input" data-bind="userSearch" placeholder="' + t('admin.searchUsers') + '" value="' + esc(state.ui.userSearch) + '"></div>' +
      '<select class="select" style="width:150px" data-act="roleFilter">' +
        '<option value="all"' + (roleFilter === 'all' ? ' selected' : '') + '>' + t('admin.allRoles') + '</option>' +
        ['student', 'teacher', 'admin'].map(function (r) {
          return '<option value="' + r + '"' + (roleFilter === r ? ' selected' : '') + '>' + t('roles.' + r) + '</option>';
        }).join('') +
      '</select>' +
      '<span class="small muted">' + list.length + ' / ' + state.db.users.length + '</span>' +
    '</div>' +
    '<div class="card table-wrap"><table class="table"><thead><tr>' +
      '<th>' + t('common.name') + '</th><th>' + t('common.email') + '</th><th>' + t('common.role') + '</th><th>' + t('common.status') + '</th><th>' + t('common.actions') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
  '</div>';
}

function viewAdminCourses() {
  const rows = state.db.courses.map(function (c) {
    const teacher = userById(c.teacherId);
    return '<tr>' +
      '<td class="mono">' + esc(c.code) + '</td>' +
      '<td><a href="#/courses/' + c.id + '" style="font-weight:600">' + esc(c.name) + '</a>' +
        '<div class="small muted">' + esc(c.semester) + '</div></td>' +
      '<td class="small">' + esc(teacher ? teacher.name : '—') + '</td>' +
      '<td>' + courseStatusBadge(c.status) + '</td>' +
      '<td class="small">' + memberCount(c.id) + '/' + c.capacity + '</td>' +
      '<td><div class="cell-actions">' +
        '<a class="btn btn-ghost btn-sm" href="#/courses/' + c.id + '">' + t('common.preview') + '</a>' +
        (c.status === 'archived'
          ? '<button class="btn btn-ok btn-sm" data-act="publish" data-id="' + c.id + '">' + t('manage.restore') + '</button>'
          : '<button class="btn btn-danger btn-sm" data-act="archive" data-id="' + c.id + '">' + t('manage.archive') + '</button>') +
      '</div></td></tr>';
  }).join('');

  return '<div class="page">' + pageHead(t('admin.coursesTitle'), t('admin.coursesSub')) +
    '<div class="card table-wrap"><table class="table"><thead><tr>' +
      '<th>' + t('manage.code') + '</th><th>' + t('manage.courseName') + '</th><th>' + t('course.teacher') + '</th><th>' + t('common.status') + '</th><th>' + t('course.enrolledCount') + '</th><th>' + t('common.actions') + '</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
  '</div>';
}

function viewAdminAudit() {
  const filter = state.ui.auditFilter;
  const list = state.db.audit.filter(function (a) { return filter === 'all' || a.action === filter; });
  const actions = ['actLogin', 'actRegister', 'actApply', 'actApprove', 'actReject', 'actWithdraw', 'actUpload', 'actDeleteMat',
    'actAddMember', 'actRemoveMember', 'actDisable', 'actEnable', 'actRole', 'actResetPwd', 'actArchive', 'actCreateCourse', 'actUpdateCourse'];

  const rows = list.map(function (a) {
    const actor = userById(a.actorId);
    return '<tr>' +
      '<td class="small muted" style="white-space:nowrap">' + fmtDateTime(a.at) + '</td>' +
      '<td><div style="font-weight:600">' + esc(actor ? actor.name : '—') + '</div>' +
        '<div class="small muted">' + (actor ? t('roles.' + actor.role) : '') + '</div></td>' +
      '<td><span class="badge badge-grey">' + t('audit.' + a.action) + '</span></td>' +
      '<td class="small">' + esc(a.target) + '</td></tr>';
  }).join('');

  return '<div class="page">' + pageHead(t('admin.auditTitle'), t('admin.auditSub')) +
    '<div class="row" style="margin-bottom:14px">' +
      '<select class="select" style="width:230px" data-act="auditFilter">' +
        '<option value="all"' + (filter === 'all' ? ' selected' : '') + '>' + t('admin.allActions') + '</option>' +
        actions.map(function (k) {
          return '<option value="' + k + '"' + (filter === k ? ' selected' : '') + '>' + t('audit.' + k) + '</option>';
        }).join('') +
      '</select>' +
      '<span class="small muted">' + list.length + '</span>' +
    '</div>' +
    '<div class="card table-wrap">' + (list.length
      ? '<table class="table"><thead><tr><th>' + t('admin.time') + '</th><th>' + t('admin.actor') + '</th><th>' + t('admin.action') + '</th><th>' + t('admin.target') + '</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : emptyState(t('admin.noLogs'), t('admin.noLogsBody'), 'audit')) + '</div>' +
  '</div>';
}

/* ---------------- 设置 ---------------- */

function viewSettings() {
  const u = state.user;
  return '<div class="page">' + pageHead(t('settings.title'), t('settings.subtitle')) +
    '<div class="grid grid-2" style="align-items:start">' +
      '<div class="card"><div class="card-head"><h2>' + t('settings.languageSection') + '</h2></div><div class="card-body stack">' +
        '<div class="small muted">' + t('settings.languageDesc') + '</div>' +
        '<div class="row">' +
          ['en', 'zh'].map(function (l) {
            const label = l === 'en' ? t('common.english') : t('common.chinese');
            return '<button class="btn ' + (state.locale === l ? '' : 'btn-ghost') + ' btn-sm" data-act="setLocale" data-locale="' + l + '">' + label + '</button>';
          }).join('') +
        '</div></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + t('common.settings') + '</h2></div><div class="card-body">' +
        '<dl class="kv">' +
          '<dt>' + t('common.name') + '</dt><dd>' + esc(u.name) + '</dd>' +
          '<dt>' + t('common.loginId') + '</dt><dd class="mono">' + esc(u.loginId) + '</dd>' +
          '<dt>' + t('common.email') + '</dt><dd>' + esc(u.email) + '</dd>' +
          '<dt>' + t('common.role') + '</dt><dd>' + roleBadge(u.role) + '</dd>' +
        '</dl></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + t('settings.pwdSection') + '</h2></div><div class="card-body">' +
        '<form data-form="changePwd" class="stack">' +
          '<div class="field"><label>' + t('settings.currentPwd') + '</label><input class="input" type="password" name="current" required></div>' +
          '<div class="field"><label>' + t('settings.newPwd') + '</label><input class="input" type="password" name="next" required></div>' +
          '<button class="btn" type="submit">' + t('common.save') + '</button>' +
        '</form></div></div>' +

      '<div class="card"><div class="card-head"><h2>' + t('settings.dangerSection') + '</h2></div><div class="card-body stack">' +
        '<div class="small muted">' + t('settings.resetDemoDesc') + '</div>' +
        '<div><button class="btn btn-danger btn-sm" data-act="resetDemo">' + t('common.resetDemo') + '</button></div>' +
      '</div></div>' +
    '</div>' +
  '</div>';
}

/* ---------------- PDF 预览弹窗 ---------------- */

function openPreviewModal(materialId) {
  const m = state.db.materials.filter(function (x) { return x.id === materialId; })[0];
  const root = document.getElementById('modal-root');
  if (!m) { root.innerHTML = ''; return; }
  const course = courseById(m.courseId);
  root.innerHTML = '<div class="modal-mask" data-act="closeModal">' +
    '<div class="modal" data-stop="1">' +
      '<div class="modal-head"><span class="file-icon">' + icon('file') + '</span>' +
        '<div style="flex:1;min-width:0"><div style="font-weight:650">' + esc(m.title) + '</div>' +
        '<div class="small muted">' + esc(course ? course.code : '') + ' · ' + m.pages + ' ' + t('course.pages') + ' · ' + fmtSize(m.size) + '</div></div>' +
        '<button class="icon-btn" data-act="closeModal">' + icon('x') + '</button></div>' +
      '<div class="modal-body">' +
        '<div class="pdf-page">' +
          '<div class="pdf-kicker">' + esc(course ? course.code : '') + '</div>' +
          '<div class="pdf-title">' + esc(m.title) + '</div>' +
          '<div class="pdf-rule"></div>' +
          '<div class="pdf-bars">' +
            '<div class="pdf-bar w90"></div><div class="pdf-bar"></div><div class="pdf-bar w80"></div>' +
            '<div class="pdf-bar w60"></div><div class="pdf-bar"></div><div class="pdf-bar w90"></div>' +
            '<div class="pdf-bar w80"></div><div class="pdf-bar w60"></div><div class="pdf-bar"></div>' +
          '</div>' +
          '<div class="pdf-foot"><span>' + esc(course ? course.name : '') + '</span><span>' + t('course.pageOf', { current: 1, total: m.pages }) + '</span></div>' +
        '</div>' +
        '<div class="watermark">' + t('course.previewMock') + '</div>' +
      '</div>' +
      '<div class="modal-foot">' +
        '<button class="btn btn-ghost" data-act="closeModal">' + t('common.close') + '</button>' +
        '<button class="btn" data-act="download" data-id="' + m.id + '">' + t('common.download') + '</button>' +
      '</div>' +
    '</div></div>';
}

function closePreviewModal() {
  state.ui.previewId = null;
  document.getElementById('modal-root').innerHTML = '';
}

/* ---------------- Toast ---------------- */

function toast(message, kind) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(function () { el.remove(); }, 2600);
}

/* ---------------- 事件 ---------------- */

function signIn(user) {
  state.user = user;
  try { localStorage.setItem(SESSION_KEY, user.id); } catch (e) { /* ignore */ }
  state.ui.loginError = '';
  state.ui.formError = '';
  state.ui.tab = 'info';
  go(roleHome(user));
  render();
  toast(t('login.welcome', { name: user.name }), 'ok');
}

function handleAct(act, data, event, target) {
  if (act === 'logout' || act === 'resetDemo') PDFCOURSE.reset();
  if (PDFCOURSE.handleAct(act, data)) return;
  const courseId = data.id;

  if (act === 'setLocale') {
    state.locale = data.locale;
    try { localStorage.setItem(LOCALE_KEY, state.locale); } catch (e) { /* ignore */ }
    render();
    return;
  }

  if (act === 'setRegRole') {
    state.ui.regRole = data.role;
    state.ui.registerError = '';
    render();
    return;
  }

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

  if (act === 'logout') {
    state.user = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    go('#/login');
    render();
    toast(t('toast.loggedOut'));
    return;
  }

  if (act === 'demoLogin') {
    const user = state.db.users.filter(function (u) { return u.email === data.email; })[0];
    if (!user) return;
    if (user.status === 'disabled') {
      state.ui.loginError = t('login.errDisabled');
      render();
      return;
    }
    signIn(user);
    return;
  }

  if (act === 'apply') {
    const course = courseById(courseId);
    if (!course) return;
    const existing = myEnrollment(courseId);
    const autoApprove = course.policy === 'open';
    if (existing) {
      existing.status = autoApprove ? 'approved' : 'pending';
      existing.source = 'self_apply';
      existing.appliedAt = nowIso();
      existing.decidedAt = autoApprove ? nowIso() : null;
      existing.decidedBy = autoApprove ? 'system' : null;
    } else {
      state.db.enrollments.push({
        id: uid('e'), courseId: courseId, studentId: state.user.id,
        status: autoApprove ? 'approved' : 'pending', source: 'self_apply',
        appliedAt: nowIso(), decidedAt: autoApprove ? nowIso() : null, decidedBy: autoApprove ? 'system' : null,
      });
    }
    addAudit(autoApprove ? 'actApprove' : 'actApply', course.code + ' ' + course.name);
    persist();
    render();
    toast(t('toast.applied'), 'ok');
    return;
  }

  if (act === 'withdraw') {
    const e = myEnrollment(courseId);
    if (!e) return;
    e.status = 'withdrawn';
    e.decidedAt = nowIso();
    addAudit('actWithdraw', (courseById(courseId) || {}).code);
    persist();
    render();
    toast(t('toast.withdrawn'));
    return;
  }

  if (act === 'approve' || act === 'reject') {
    const e = state.db.enrollments.filter(function (x) { return x.id === courseId; })[0];
    if (!e) return;
    e.status = act === 'approve' ? 'approved' : 'rejected';
    e.decidedAt = nowIso();
    e.decidedBy = state.user.id;
    const student = userById(e.studentId);
    addAudit(act === 'approve' ? 'actApprove' : 'actReject', student ? student.loginId : e.studentId);
    persist();
    render();
    toast(t(act === 'approve' ? 'toast.approved' : 'toast.rejected'), 'ok');
    return;
  }

  if (act === 'removeMember') {
    const e = state.db.enrollments.filter(function (x) { return x.id === courseId; })[0];
    if (!e) return;
    e.status = 'dropped';
    const student = userById(e.studentId);
    addAudit('actRemoveMember', student ? student.loginId : e.studentId);
    persist();
    render();
    toast(t('toast.memberRemoved'));
    return;
  }

  if (act === 'uploadMaterial') {
    const input = document.getElementById('matFile');
    const file = input && input.files ? input.files[0] : null;
    if (!file) { toast(t('toast.noFile'), 'err'); return; }
    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (!isPdf) { toast(t('toast.notPdf'), 'err'); return; }
    if (file.size > 20 * 1024 * 1024) { toast(t('toast.tooLarge'), 'err'); return; }
    state.db.materials.push({
      id: uid('m'), courseId: courseId,
      title: file.name.replace(/\.pdf$/i, ''),
      pages: Math.max(4, Math.round(file.size / 180000) || 8),
      size: file.size, uploaderId: state.user.id, createdAt: nowIso(),
    });
    addAudit('actUpload', file.name);
    persist();
    render();
    toast(t('toast.materialUploaded'), 'ok');
    return;
  }

  if (act === 'deleteMaterial') {
    const m = state.db.materials.filter(function (x) { return x.id === courseId; })[0];
    if (!m) return;
    state.db.materials = state.db.materials.filter(function (x) { return x.id !== courseId; });
    addAudit('actDeleteMat', m.title);
    persist();
    render();
    toast(t('toast.materialDeleted'));
    return;
  }

  if (act === 'preview') {
    state.ui.previewId = courseId;
    openPreviewModal(courseId);
    return;
  }

  if (act === 'download') {
    toast(t('course.downloadMock'), 'ok');
    return;
  }

  if (act === 'closeModal') {
    // 点遮罩空白处才关闭；点弹窗内部不关闭
    if (target && target.classList.contains('modal-mask') && event.target !== target) return;
    closePreviewModal();
    return;
  }

  if (act === 'tab') {
    state.ui.tab = data.tab;
    state.ui.formError = '';
    render();
    return;
  }

  if (act === 'publish' || act === 'archive') {
    const course = courseById(courseId);
    if (!course) return;
    course.status = act === 'publish' ? 'published' : 'archived';
    addAudit(act === 'archive' ? 'actArchive' : 'actUpdateCourse', course.code + ' ' + course.name);
    persist();
    render();
    toast(t('toast.courseUpdated'), 'ok');
    return;
  }

  if (act === 'toggleUser') {
    const user = userById(courseId);
    if (!user) return;
    if (user.id === state.user.id) { toast(t('admin.cannotSelf'), 'err'); return; }
    user.status = user.status === 'active' ? 'disabled' : 'active';
    addAudit(user.status === 'active' ? 'actEnable' : 'actDisable', user.loginId);
    persist();
    render();
    toast(t(user.status === 'active' ? 'toast.userEnabled' : 'toast.userDisabled'));
    return;
  }

  if (act === 'changeRole') {
    const user = userById(data.id);
    if (!user) return;
    const nextRole = event.target.value;
    if (nextRole === user.role) return;
    user.role = nextRole;
    addAudit('actRole', user.loginId + ' → ' + t('roles.' + nextRole));
    persist();
    render();
    toast(t('toast.roleChanged'), 'ok');
    return;
  }

  if (act === 'resetPwd') {
    const user = userById(data.id);
    addAudit('actResetPwd', user ? user.loginId : data.id);
    persist();
    toast(t('admin.pwdReset'), 'ok');
    return;
  }

  if (act === 'roleFilter') {
    state.ui.roleFilter = event.target.value;
    render();
    return;
  }

  if (act === 'auditFilter') {
    state.ui.auditFilter = event.target.value;
    render();
    return;
  }

  if (act === 'resetDemo') {
    state.db = MOCK.reset();
    const keep = state.user ? state.user.id : null;
    const restored = keep ? userById(keep) : null;
    state.user = restored && restored.status === 'active' ? restored : null;
    if (!state.user) {
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
      go('#/login');
    }
    render();
    toast(t('common.resetDemoDone'), 'ok');
    return;
  }
}

function handleSubmit(form, event) {
  event.preventDefault();
  if (PDFCOURSE.handleSubmit(form)) return;
  const fd = new FormData(form);
  const val = function (k) { return (fd.get(k) || '').toString().trim(); };
  const type = form.getAttribute('data-form');

  if (type === 'login') {
    const email = val('email').toLowerCase();
    const pwd = val('password');
    if (!email || !pwd) { state.ui.loginError = t('login.errRequired'); render(); return; }
    const user = state.db.users.filter(function (u) { return u.email.toLowerCase() === email; })[0];
    if (!user || pwd !== DEMO_PASSWORD) { state.ui.loginError = t('login.errInvalid'); render(); return; }
    if (user.status === 'disabled') { state.ui.loginError = t('login.errDisabled'); render(); return; }
    signIn(user);
    return;
  }

  if (type === 'register') {
    const loginId = val('loginId');
    const email = val('email').toLowerCase();
    const pwd = val('password');
    const role = state.ui.regRole || 'student';
    if (!loginId || !email || !val('name') || !pwd) { state.ui.registerError = t('register.errRequired'); render(); return; }
    if (role === 'teacher' && val('inviteCode') !== DEMO_TEACHER_CODE) {
      state.ui.registerError = t('register.errInviteCode'); render(); return;
    }
    if (state.db.users.some(function (u) { return u.loginId.toLowerCase() === loginId.toLowerCase(); })) {
      state.ui.registerError = t('register.errIdTaken'); render(); return;
    }
    if (state.db.users.some(function (u) { return u.email.toLowerCase() === email; })) {
      state.ui.registerError = t('register.errEmailTaken'); render(); return;
    }
    if (pwd.length < 8 || !/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) {
      state.ui.registerError = t('register.errWeakPwd'); render(); return;
    }
    if (pwd !== val('confirm')) { state.ui.registerError = t('register.errMismatch'); render(); return; }
    const user = {
      id: uid('u'), loginId: loginId, name: val('name'), email: email,
      role: role, status: 'active',
    };
    state.db.users.push(user);
    state.db.audit.unshift({ id: uid('a'), actorId: user.id, action: 'actRegister', target: loginId, at: nowIso() });
    persist();
    state.ui.registerError = '';
    state.ui.regRole = 'student';
    go('#/login');
    render();
    toast(t('register.success'), 'ok');
    return;
  }

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

  if (type === 'interviewIntro') {
    state.ui.interviewIntroBackground = val('background').slice(0, 240);
    state.ui.interviewIntroSkills = val('skills').slice(0, 200);
    state.ui.interviewIntroTemplate = true;
    render();
    return;
  }

  if (type === 'interviewProject') {
    const project = {
      name: val('projectName').slice(0, 100),
      context: val('projectContext').slice(0, 300),
      role: val('projectRole').slice(0, 160),
      actions: val('projectActions').slice(0, 300),
      skills: val('projectSkills').slice(0, 160),
      result: val('projectResult').slice(0, 240),
    };
    if (Object.keys(project).some(function (key) { return !project[key]; })) {
      toast(t('interview.projectInfoRequired'), 'err');
      return;
    }
    state.ui.interviewProjectName = project.name;
    state.ui.interviewProjectContext = project.context;
    state.ui.interviewProjectRole = project.role;
    state.ui.interviewProjectActions = project.actions;
    state.ui.interviewProjectSkills = project.skills;
    state.ui.interviewProjectResult = project.result;
    state.ui.interviewProjectTemplate = true;
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

  if (type === 'createCourse') {
    const code = val('code');
    const capacity = parseInt(val('capacity'), 10);
    if (!code || !val('name')) { state.ui.formError = t('register.errRequired'); render(); return; }
    if (!capacity || capacity < 1) { state.ui.formError = t('manage.errCapacity'); render(); return; }
    if (state.db.courses.some(function (c) { return c.code.toLowerCase() === code.toLowerCase(); })) {
      state.ui.formError = t('create.errCodeTaken'); render(); return;
    }
    const course = {
      id: uid('c'), code: code, name: val('name'), teacherId: state.user.id,
      semester: val('semester'), status: 'draft', policy: val('policy') || 'approval',
      capacity: capacity, description: val('description'), createdAt: nowIso(),
    };
    state.db.courses.push(course);
    addAudit('actCreateCourse', code + ' ' + course.name);
    persist();
    state.ui.formError = '';
    state.ui.tab = 'info';
    go('#/teacher/' + course.id);
    render();
    toast(t('create.created'), 'ok');
    return;
  }

  if (type === 'courseInfo') {
    const id = (currentHash().match(/^#\/teacher\/([\w-]+)$/) || [])[1];
    const target = courseById(id);
    if (!target) return;
    const capacity = parseInt(val('capacity'), 10);
    if (!capacity || capacity < 1) { state.ui.formError = t('manage.errCapacity'); render(); return; }
    target.name = val('name') || target.name;
    target.semester = val('semester') || target.semester;
    target.description = val('description');
    target.capacity = capacity;
    target.policy = val('policy') || target.policy;
    addAudit('actUpdateCourse', target.code + ' ' + target.name);
    persist();
    state.ui.formError = '';
    render();
    toast(t('toast.courseUpdated'), 'ok');
    return;
  }

  if (type === 'addMember') {
    const query = val('query').toLowerCase();
    const id = (currentHash().match(/^#\/teacher\/([\w-]+)$/) || [])[1];
    const course = courseById(id);
    if (!course) return;
    const student = state.db.users.filter(function (u) {
      return u.role === 'student' && (u.loginId.toLowerCase() === query || u.email.toLowerCase() === query);
    })[0];
    if (!student) { toast(t('toast.userNotFound'), 'err'); return; }
    if (memberCount(course.id) >= course.capacity) { toast(t('course.fullNote'), 'err'); return; }
    const existing = state.db.enrollments.filter(function (e) {
      return e.courseId === course.id && e.studentId === student.id;
    })[0];
    if (existing && existing.status === 'approved') { toast(t('toast.memberExists'), 'err'); return; }
    if (existing) {
      existing.status = 'approved';
      existing.source = 'teacher_add';
      existing.decidedAt = nowIso();
      existing.decidedBy = state.user.id;
    } else {
      state.db.enrollments.push({
        id: uid('e'), courseId: course.id, studentId: student.id, status: 'approved',
        source: 'teacher_add', appliedAt: nowIso(), decidedAt: nowIso(), decidedBy: state.user.id,
      });
    }
    addAudit('actAddMember', student.loginId);
    persist();
    render();
    toast(t('toast.memberAdded'), 'ok');
    return;
  }

  if (type === 'changePwd') {
    if (!val('current') || !val('next')) return;
    toast(t('settings.pwdChanged'), 'ok');
    form.reset();
    return;
  }
}

function handleInput(event) {
  if (PDFCOURSE.handleInput(event)) return;
  const key = event.target.getAttribute('data-bind');
  if (!key) return;
  state.ui[key] = event.target.value;
  const pos = event.target.selectionStart;
  render();
  const next = document.querySelector('[data-bind="' + key + '"]');
  if (next) {
    next.focus();
    try { next.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
  }
}

/* ---------------- 启动 ---------------- */

/** 读查询参数（不用 URLSearchParams，保持与测试环境兼容） */
function queryParam(name) {
  const search = (window.location && window.location.search) || '';
  const m = search.match(new RegExp('[?&]' + name + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function boot() {
  state.db = MOCK.load();

  if (window.injectIconSprite) window.injectIconSprite();

  try {
    const savedLocale = localStorage.getItem(LOCALE_KEY);
    if (savedLocale === 'zh' || savedLocale === 'en') state.locale = savedLocale;
  } catch (e) { /* ignore */ }

  try {
    const sessionId = localStorage.getItem(SESSION_KEY);
    if (sessionId) {
      const user = state.db.users.filter(function (u) { return u.id === sessionId; })[0];
      if (user && user.status === 'active') state.user = user;
    }
  } catch (e) { /* ignore */ }

  // 演示用深链：?user=u_s1 / ?user=26072062g 直接以该身份进入（原型无后端，登录本就是本地模拟）
  const deepLink = queryParam('user');
  if (deepLink) {
    const user = state.db.users.filter(function (u) {
      return u.id === deepLink || u.email === deepLink || u.loginId === deepLink;
    })[0];
    if (user && user.status === 'active') {
      state.user = user;
      try { localStorage.setItem(SESSION_KEY, user.id); } catch (e) { /* ignore */ }
    }
  }

  // 演示用深链：?lang=zh / ?lang=en
  const langParam = queryParam('lang');
  if (langParam === 'zh' || langParam === 'en') {
    state.locale = langParam;
    try { localStorage.setItem(LOCALE_KEY, langParam); } catch (e) { /* ignore */ }
  }

  // The studio shortcut selects a demo identity once, so reload respects later account switches.
  if (queryParam('once') === '1' && window.history && window.history.replaceState) {
    try {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('user');
      cleanUrl.searchParams.delete('once');
      window.history.replaceState(null, '', cleanUrl.href);
    } catch (e) { /* The ordinary demo entry still works when history is unavailable. */ }
  }

  document.addEventListener('click', function (event) {
    const target = event.target.closest('[data-act]');
    if (!target) return;
    if (target.tagName === 'SELECT') return;
    handleAct(target.getAttribute('data-act'), target.dataset, event, target);
  });

  document.addEventListener('change', function (event) {
    if (PDFCOURSE.handleChange(event)) return;
    const target = event.target.closest('[data-act]');
    if (!target) return;
    const act = target.getAttribute('data-act');
    if (act === 'changeRole' || act === 'roleFilter' || act === 'auditFilter') {
      handleAct(act, target.dataset, event);
    }
  });

  document.addEventListener('submit', function (event) {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    handleSubmit(form, event);
  });

  document.addEventListener('input', handleInput);

  bindTilt();

  window.addEventListener('hashchange', function () {
    state.ui.previewId = null;
    closePreviewModal();
    render();
  });

  if (!currentHash()) {
    window.location.replace(state.user ? roleHome(state.user) : '#/');
  }
  render();

  if (state.user && state.user.role === 'student') {
    // 首次进入给个轻提示，说明这是原型
    setTimeout(function () { toast(t('course.unlockDemo')); }, 600);
  }
}

/** 课程卡片的 3D 倾斜（指针跟随），尊重"减少动态效果"设置 */
function bindTilt() {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) return;

  document.addEventListener('pointermove', function (event) {
    const card = event.target.closest ? event.target.closest('.course-card') : null;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
    const py = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
    card.style.setProperty('--ry', (px * 7).toFixed(2) + 'deg');
    card.style.setProperty('--rx', (-py * 7).toFixed(2) + 'deg');
  }, { passive: true });

  document.addEventListener('pointerout', function (event) {
    const card = event.target.closest ? event.target.closest('.course-card') : null;
    if (!card) return;
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;
    card.style.setProperty('--ry', '0deg');
    card.style.setProperty('--rx', '0deg');
  }, { passive: true });
}

boot();
