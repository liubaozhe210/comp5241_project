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
node smoke-test.mjs      # 49 项：页面渲染、权限、注册、申请/审批/上传/禁用、无 emoji
node check-i18n.mjs      # 中英词条 key 一致性
```

## 文档

中文产品设计文档见 [product-design.md](product-design.md)，随仓库一并版本化。

## 开发约定

见 [AGENTS.md](AGENTS.md)：每次改动需提交 commit，并保证相关测试通过。

改动文档后请运行链接校验：

```bash
node scripts/check-docs.mjs
```
