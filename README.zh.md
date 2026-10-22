# CourseHub — 在线教学系统

[English](README.md) · 中文版

COMP5241 Software Engineering 课程大作业。一个面向 **管理员、教师、学生** 三种角色的在线教学平台：教师开课并发布 PDF 课件，学生浏览课程并申请选课，管理员治理账号并审计每一次敏感操作。

界面支持 **中英双语**（用户可自行切换）。系统由 Next.js 前端、FastAPI 后端与托管的 Supabase 项目组成。

---

## 功能

| 能力 | 学生 | 教师 | 管理员 |
|---|---|:---:|:---:|
| 注册 / 登录 / 登出（双语） | ✓ | ✓（需邀请码） | ✓ |
| 课程目录与课程详情 | ✓ | ✓ | ✓ |
| 查看课件（PDF） | 仅已通过审批 | 自己的课程 | 全部 |
| 申请 / 撤回选课 | ✓ | — | — |
| 审批选课申请 | — | 自己的课程 | 任意课程 |
| 手动添加 / 移除学生 | — | 自己的课程 | 任意课程 |
| 创建 / 编辑 / 归档课程 | — | 自己的课程 | 任意课程 |
| 上传 / 删除 PDF 课件 | — | 自己的课程 | 可删除 |
| 用户管理（禁用、改角色、重置密码） | — | — | ✓ |
| 敏感操作审计日志 | — | — | ✓ |

后端强制执行的几条规则：

- **默认拒绝**：目录级（公开课程信息）与详情级（课件）两层可见性；课件只对已通过审批的学生、任课教师与管理员开放。
- **禁用即时生效**：每次请求都重新读 `profiles.status`，从不信任 token 里的状态。
- **显式选课状态机**：`pending → approved / rejected / withdrawn`、`approved → dropped`；非法迁移返回 `409`。
- **稳定错误码**：接口返回 `{"code", "message", "detail"}`，前端按 `code` 映射当前语言文案。

---

## 技术栈

| 层 | 选择 |
|---|---|
| 前端 | Next.js 14（App Router）· React 18 · TypeScript · Tailwind CSS · next-intl |
| 后端 | FastAPI · Pydantic v2 · supabase-py（service role） |
| 数据库 | Supabase Postgres —— 6 张表，带 RLS 策略 |
| 认证 | Supabase Auth（邮箱 + 密码；JWT 由后端验签） |
| 文件存储 | Supabase Storage，私有桶 `materials`（仅 PDF，≤ 20 MB） |
| 部署 | Vercel（前端）· Render（后端）· Supabase Cloud |

---

## 仓库结构

```
comp5241_project/
├── frontend/                    # Next.js 应用（双语界面）
├── backend/                     # FastAPI 服务（全部业务逻辑）
├── supabase/
│   ├── schema.sql               # 建表、触发器、RLS 策略、Storage 桶
│   └── README.md                # Supabase 项目配置说明
├── demo/                        # 可点击的静态原型（无后端）
├── scripts/check-docs.mjs       # Markdown 链接校验
├── product-design.md            # 产品设计文档
├── AGENTS.md                    # 团队约定
├── README.md                    # 英文版
└── README.zh.md                 # 中文版（本文件）
```

---

## 前置条件

- Node.js 18.18+ 与 npm
- Python 3.12+（团队统一使用 Anaconda 环境 `se_project`）
- 一个 Supabase 项目（免费额度足够）

---

## 本地运行

### 1. 配置 Supabase

1. 打开项目 → **SQL Editor → New query**，粘贴 [`supabase/schema.sql`](supabase/schema.sql) 全文并执行。它会建立 6 张表、注册触发器、RLS 策略与私有 `materials` 桶，可重复执行。
2. **Authentication → Providers → Email**：`Confirm email` 开着也没关系 —— 后端创建账号时会带 `email_confirm: true`，注册不会被邮箱确认卡住。
3. **Authentication → Sign In / Providers**：关闭 **Allow new users to sign up**。账号只能由后端创建，否则任何人都能绕过教师邀请码直连注册。
4. 在 **Project Settings → API** 复制两把 key：
   - `anon` / publishable key → 给前端
   - `service_role` secret key → 只给后端，绝不进浏览器

更细的说明见 [`supabase/README.md`](supabase/README.md)。

### 2. 后端

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
# 填入 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY
uvicorn app.main:app --reload --port 8000
```

- 健康检查：<http://127.0.0.1:8000/health>
- 接口文档：<http://127.0.0.1:8000/docs>

### 3. 前端

```bash
cd frontend
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
npm run dev
```

打开 <http://localhost:3000>，会自动跳转到 `/en`。

### 4. 首次运行清单

1. 在 `/en/register` 注册一个学生账号。
2. 登录。目录为空是正常的 —— 需要教师先发布课程。
3. 需要一个管理员账号时，先注册普通账号，再用 SQL 提升一次：
   ```sql
   update public.profiles set role = 'admin' where login_id = '<你的学号/工号>';
   ```
   注册触发器会故意把客户端传来的 `role=admin` 降级为 `student`。

### 5. 写入演示数据（可选）

```bash
cd backend
python scripts/seed_demo.py
```

会创建 2 个教师、3 个学生、6 门课程、8 条选课记录与 6 份真实 PDF 课件，所有账号密码统一为 `Demo1234!`。

- **幂等**：已存在的账号 / 课程 / 选课 / 课件会跳过，可重复执行
- **不会改动管理员账号**，结束时打印当前管理员列表
- 教师走真实注册链路（带邀请码 `TEACHER2026`），会消费 2 次邀请额度
- PDF 由脚本程序化生成（xref 正确），学生能真的在浏览器里预览

| 角色 | 学号/工号 | 邮箱 |
|---|---|---|
| 教师 | `t1001` | `michael.wong@polyu.edu.hk` |
| 教师 | `t1002` | `sarah.lee@polyu.edu.hk` |
| 学生 | `26072062g` | `26072062g@connect.polyu.hk` |
| 学生 | `26072063g` | `26072063g@connect.polyu.hk` |
| 学生 | `26072064g` | `26072064g@connect.polyu.hk` |

---

## 环境变量

### `backend/.env`

| 变量 | 必填 | 说明 |
|---|:---:|---|
| `SUPABASE_URL` | ✓ | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | `service_role` secret key（仅服务端） |
| `SUPABASE_JWT_SECRET` | — | 仅老项目用 HS256 时填；留空则走 JWKS 验签 |
| `SUPABASE_JWT_AUDIENCE` | — | 默认 `authenticated` |
| `CORS_ORIGINS` | — | 允许的前端来源，逗号分隔，默认 `http://localhost:3000,http://127.0.0.1:3000,null` |
| `MAX_PDF_BYTES` | — | 默认 20 MB |
| `SIGNED_URL_TTL` | — | 签名 URL 有效期（秒），默认 60 |

### `frontend/.env.local`

| 变量 | 必填 | 说明 |
|---|:---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | Supabase 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | publishable / anon key |
| `NEXT_PUBLIC_API_BASE` | ✓ | 后端地址，例如 `http://127.0.0.1:8000` |

> `NEXT_PUBLIC_*` 的值在 **构建时** 被打进浏览器包，改完必须重新构建/重新部署。`service_role` key 绝不能放进任何 `NEXT_PUBLIC_*` 变量。

---

## 接口一览

除 `/health` 与 `/auth/register` 外，都需要 `Authorization: Bearer <supabase access token>`。
完整定义见 <http://127.0.0.1:8000/docs>（线上为 `/openapi.json`）。

| 方法 | 路径 | 谁能调 |
|---|---|---|
| `POST` | `/auth/register` | 公开（教师需邀请码） |
| `GET` | `/auth/me` | 已登录 |
| `PATCH` | `/auth/me/locale` | 已登录 |
| `GET` | `/courses` | 已登录（仅已发布） |
| `GET` | `/courses/mine` | 教师 / 管理员 |
| `GET` | `/courses/{id}` | 已登录 |
| `POST` · `PATCH` | `/courses` · `/courses/{id}` | 任课教师 / 管理员 |
| `GET` · `POST` | `/courses/{id}/materials` | 课程成员 · 任课教师 / 管理员 |
| `GET` | `/materials/{id}/url` | 课程成员（60 秒签名 URL） |
| `DELETE` | `/materials/{id}` | 任课教师 / 管理员 |
| `POST` | `/courses/{id}/enrollments` | 学生 |
| `DELETE` | `/courses/{id}/enrollments/me` | 学生 |
| `GET` | `/me/enrollments` | 学生 |
| `GET` | `/courses/{id}/enrollments` | 任课教师 / 管理员 |
| `POST` | `/courses/{id}/enrollments/{eid}/approve` · `/reject` | 任课教师 / 管理员 |
| `POST` · `DELETE` | `/courses/{id}/members` · `/courses/{id}/members/{eid}` | 任课教师 / 管理员 |
| `GET` · `POST` · `PATCH` | `/admin/users…` | 管理员 |
| `GET` | `/admin/audit` | 管理员 |

---

## 测试

```bash
# 后端：35 项，完全离线（内存版 repo，不连网）
cd backend && python -m pytest -q

# 静态原型：121 项检查 + 中英词条一致性
cd demo && node smoke-test.mjs && node check-i18n.mjs

# 文档链接校验
node scripts/check-docs.mjs
```

---

## 部署

生产环境是三个托管服务，没有需要自己维护的服务器。

```
        浏览器
           │
   ┌───────┴─────────┐
   │                 │
Vercel            Render
Next.js  ───────► FastAPI ──────► Supabase
(静态 + SSR)     (service role)   Postgres · Auth · Storage
```

浏览器直接与 Supabase Auth 交换密码换 JWT，再用 JWT 调 FastAPI。只有后端持有 `service_role` key。

### 第 1 步 —— Supabase（已在托管）

无需部署，但上线前确认：

- `supabase/schema.sql` 已执行（6 张表，**Storage** 里能看到 `materials` 桶）
- **Allow new users to sign up** 已关闭
- 两把 key 都在手上：publishable（前端）与 secret（后端）

### 第 2 步 —— 部署后端到 Render

1. 把仓库推到 GitHub。
2. Render → **New → Web Service** → 连接该仓库。
3. 配置：
   - **Root Directory**：`backend`
   - **Build Command**：`pip install -r requirements.txt`
   - **Start Command**：`uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**：`/health`
4. **Environment → Add Environment Variable**：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGINS=https://<你的前端>.vercel.app`
5. 部署完成后访问 `https://<your-backend>.onrender.com/health`，应返回 `{"status":"ok","supabase_configured":true,…}`。

注意：

- 免费实例空闲会休眠，休眠后第一个请求很慢 —— 演示时要留意。
- 不要提交 `.env`，变量在平台面板里配置。
- Railway、Fly.io、Koyeb 或一台装 nginx 的小 VPS 用同一条启动命令即可。

### 第 3 步 —— 部署前端到 Vercel

1. Vercel → **Add New → Project** → 导入同一个仓库。
2. 配置：
   - **Root Directory**：`frontend`
   - **Framework Preset**：Next.js（自动识别，`next build` 由 Vercel 处理）
3. **Environment Variables**（Production 与 Preview 都配）：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE=https://<your-backend>.onrender.com`
4. 部署后打开 `https://<your-frontend>.vercel.app`，会跳转到 `/en`。

> `NEXT_PUBLIC_*` 在构建时写死，改完要重新部署。若前端先于后端部署，页面能打开但所有接口都会报 `errors.network`。

### 第 4 步 —— 打通 CORS

后端只接受 `CORS_ORIGINS` 里列出的来源。前端首次部署后：

1. 复制 Vercel 给出的确切域名（自定义域名也要加）。
2. 设置 `CORS_ORIGINS=https://<your-frontend>.vercel.app`（多个用逗号分隔），然后重新部署后端。
3. 漏配时的表现：浏览器控制台报 CORS 错误，界面上显示 `errors.network`。

### 第 5 步 —— 上线后检查清单

- [ ] 后端 `GET /health` 返回 `supabase_configured: true`
- [ ] Vercel 域名下 `/en` 与 `/zh` 都能正常渲染
- [ ] 注册学生 → 登录 → 目录能加载（可能为空）
- [ ] 用 SQL 提升一个管理员，能登录 `/en/admin`
- [ ] 教师上传 PDF，学生只有在审批通过后才能看到
- [ ] 在 `/en/admin` 禁用一个用户，其下一次请求立即被拒

### 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 后端日志出现 `OPTIONS /auth/register 400`，浏览器控制台报 CORS | 前端来源不在 `CORS_ORIGINS` 里；Starlette 对预检直接返回 `400 Disallowed CORS origin` | 把**完整来源（协议 + 主机 + 端口）**加进 `CORS_ORIGINS`，然后**重启后端** —— `.env` 不会被 `--reload` 重新加载 |
| 所有请求都报 `errors.network` | `NEXT_PUBLIC_API_BASE` 指向的主机/端口不对，或后端没起 | 改完后**重启 Next dev server**；生产构建则要重新部署 |
| 能登录但 `/courses` 返回 401 `PROFILE_NOT_FOUND` | 账号不是经后端创建的（直接用 Supabase signup），注册触发器没建 profile | 走 `/auth/register` 建号，或手工插入 `profiles` 行 |

> 对浏览器来说 `http://localhost:3001` 与 `http://127.0.0.1:3001` 是**两个不同来源**。你实际打开哪个就写哪个，或者两个都写。

---

## 静态原型（`demo/`）

`demo/` 是早期的 **可点击原型** —— 纯 HTML/CSS/JS + 模拟数据，没有后端。保留它作为设计参照，也用于不能启动任何服务的场合：

```bash
cd demo && node smoke-test.mjs    # 或者直接双击 demo/index.html
```

里面还包含一个实验性的「AI 模拟面试」模块，属于**本期不做**范围（见设计文档 3.3）；从 `demo/index.html` 删掉三行引用即可整体移除。

---

## 文档

- [`product-design.md`](product-design.md) —— 产品设计文档：角色、权限矩阵、选课状态机、数据模型、验收清单、里程碑。
- [`supabase/README.md`](supabase/README.md) —— Supabase 项目配置说明。
- [`backend/README.md`](backend/README.md) —— 接口清单与后端设计要点。
- [`frontend/README.md`](frontend/README.md) —— 页面地图、认证分工、i18n 说明。

---

## 尚未实现

- 教师端：建课/改课、课件上传、选课审批界面（后端接口已就绪）
- 管理端：改角色、重置密码、审计日志页面（后端接口已就绪）
- 演示数据种子脚本
- 分页、Toast、骨架屏
- AI 模拟面试（明确不在本期范围）

---

## 开发约定

见 [`AGENTS.md`](AGENTS.md)：每次改动都要提交 commit，交付前所有测试必须通过。

- 后端测试天然离线：仓库层被替换为内存实现，不依赖网络。
- 文档链接由 [`scripts/check-docs.mjs`](scripts/check-docs.mjs) 校验。
