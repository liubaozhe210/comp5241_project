# COMP5241 在线教学系统（MVP）

COMP5241 Software Engineering 课程大作业：一个支持 **管理员 / 教师 / 学生** 三种角色的在线教学系统 MVP。教师可建课、发布 PDF 课件；学生可浏览课程、申请选课、查看已选课程课件；管理员负责账号与课程的全局治理。

## 技术栈

- 前端：Next.js (App Router) + TypeScript + Tailwind CSS
- 后端：FastAPI + SQLAlchemy 2.0 (async) + Pydantic v2
- 平台：Supabase（PostgreSQL + Auth + Storage）

## 界面原型（Demo）

`demo/` 是一份**可点击的界面原型**：纯静态、无后端，数据为模拟数据，用于确认整体界面与操作流程。

直接双击 `demo/index.html` 打开即可（不需要 `npm install`，也不需要 Python）。演示账号见 `demo/README.md`，密码统一 `demo1234`，登录页可一键登录。

```bash
cd demo
node smoke-test.mjs      # 页面渲染、权限、注册、课程流程、面试与图标规范
node pdf-course-test.mjs # PDF 互动课程：文件校验、草稿、发布、权限与学习进度
node check-i18n.mjs      # 中英词条 key 一致性
```

## PDF to interactive course — local prototype

Open [the studio shortcut](demo/pdf-course-demo.html) to start as the example teacher in Chinese. The normal entry keeps its existing English default. No installation, backend or internet connection is required.

- Teacher: select a PDF or sample, choose a topic / language / level, generate three lessons, edit explanations and activities, save a draft, preview and publish into an existing course.
- Student: sign in as an approved student, open the course's **Interactive learning** section, answer knowledge checks, complete a scenario and resume saved progress.
- Examples cover requirements engineering, AI coding agents and software testing, in English and Chinese.
- This is a local workflow demonstration: PDF headers and sizes are checked, but PDF text is **not extracted**. Content comes from curated topic templates; scenario feedback uses an editable keyword checklist. Files and answers are not uploaded.

See the [feature guide](docs/pdf-course-demo.md) for the demo walkthrough, data model, test commands and limits.

## 文档

中文产品设计文档见 [product-design.md](product-design.md)，随仓库一并版本化。

## 开发约定

见 [AGENTS.md](AGENTS.md)：每次改动需提交 commit，并保证相关测试通过。

改动文档后请运行链接校验：

```bash
node scripts/check-docs.mjs
```
