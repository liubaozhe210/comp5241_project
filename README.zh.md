# CourseHub — 在线教学系统

PDF 互动课程正式实现：见 [启用、使用和测试说明](docs/pdf-interactive-course.md)。教师可将文字型 PDF 生成可编辑课程并发布，学生进行测验与情景练习，学习进度保存到服务器。需配置 AI 服务并初始化三张新增表。

[English](README.md) · 中文版

> **学习路径模块补充（2026-11-13）**：学生端 AI 个性化学习路径已在 `frontend/` 与 `backend/` 中实现。
> 运行、使用与演示见[专项指南](docs/learning-path.zh.md)，技术细节见[后端说明](backend/LEARNING_PATHS.md)，
> 验证范围见[验收记录](backend/LEARNING_PATH_ACCEPTANCE.md)。下文保留的部分状态和测试数量属于早期开发记录；
> 本功能的当前运行方式与限制请以专项文档为准。本补充不替其他成员重新判定其模块状态。

COMP5241 Software Engineering 课程大作业。一个面向 **管理员、教师、学生** 三种角色的在线教学平台：教师开课并发布 PDF 课件，学生浏览课程并申请选课，管理员治理账号并审计每一次敏感操作。

界面支持 **中英双语**（用户可自行切换）。系统由 Next.js 前端、FastAPI 后端与自建 MySQL 组成。

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
| 后端 | FastAPI · Pydantic v2 · SQLAlchemy 2.0 |
| 数据库 | **MySQL 8.0.16+（自建）** —— 6 张表，只存业务数据 |
| 认证 | **自托管**：密码 bcrypt 哈希存 MySQL，后端自签 HS256 JWT（`/auth/login`） |
| 文件存储 | **本地磁盘**（`backend/data/materials`），下载走带 HMAC token 的接口 |
| 部署 | Vercel（前端）· 任意有持久磁盘的主机（后端）· MySQL |

> **当前状态（2026-11）**：业务数据、认证与文件存储都已不再依赖 Supabase，
> 全部由 MySQL + 后端自托管承担。

---

## 仓库结构

```
comp5241_project/
├── frontend/                    # Next.js 应用（双语界面）
├── backend/
│   ├── app/                     # FastAPI 服务（routers / services / repo / models）
│   ├── db/schema.mysql.sql      # MySQL 建表语句（无 RLS：后端是唯一写入方）
│   ├── scripts/                 # init_mysql.py · seed_demo.py
│   └── tests/                   # 35 项离线测试（内存版 repo）
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
- **MySQL 8.0.16+**（`CHECK` 约束需要 8.0.16；我们跑的是 8.0.46）

### 快速启动

```bash
# 1) 后端（http://127.0.0.1:8000）
cd backend
python scripts/init_mysql.py                    # 建表，可重复执行
uvicorn app.main:app --reload --port 8000

# 2) 前端（http://localhost:3000）
cd frontend
npm install
npm run dev
```

想换端口？改 `--port 8000` 和/或 `npm run dev -- --port 3001`，
同时保证 `NEXT_PUBLIC_API_BASE` 与 `CORS_ORIGINS` 两边一致。

---

## 本地运行

### 1. 准备 MySQL

```bash
cd backend
python scripts/init_mysql.py
```

库不存在会自动创建，然后建出 6 张表（`profiles`、`courses`、`enrollments`、`materials`、
`audit_logs`、`invite_codes`）。可重复执行。

连接串格式（`@` 等特殊字符要做 URL 编码，写成 `%40`）：

```
DATABASE_URL=mysql+pymysql://<用户名>:<密码>@<主机>:3306/<数据库名>
```

### 2. 后端

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
# 填入 DATABASE_URL（MySQL）与 JWT_SECRET
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
若 3000 被占用，用 `npm run dev -- --port 3001`，同时记得把 `http://localhost:3001`
加进 `backend/.env` 的 `CORS_ORIGINS`。

### 4. 首次运行清单

1. 确认后端健康：<http://127.0.0.1:8000/health> → `{"status":"ok",...}`
2. 在 `/en/register` 注册一个学生账号。
3. 登录。目录为空是正常的 —— 需要教师先发布课程。
4. 需要一个管理员账号时，直接改一行数据（注册流程会故意把客户端传来的 `role=admin` 降级为 `student`）：
   ```sql
   update profiles set role = 'admin' where login_id = '<你的学号/工号>';
   ```
   不需要重新登录 —— 后端每次请求都重新读 `profiles`。

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
- 依赖 Auth 可用（账号是经 Auth 创建的）

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
| `DATABASE_URL` | ✓ | `mysql+pymysql://<用户名>:<密码>@<主机>:3306/<库名>`，特殊字符要 URL 编码（`@` → `%40`） |
| `JWT_SECRET` | ✓ | 自签 JWT 的 HS256 密钥（随机字符串） |
| `MATERIALS_DIR` | — | 课件存储目录，默认 `data/materials` |
| `CORS_ORIGINS` | — | 允许的前端来源，逗号分隔，默认 `http://localhost:3000,http://127.0.0.1:3000,null` |
| `MAX_PDF_BYTES` | — | 默认 20 MB |
| `SIGNED_URL_TTL` | — | 签名 URL 有效期（秒），默认 60 |
| `DB_POOL_SIZE` | — | 连接池大小，默认 5 |
| `DB_POOL_RECYCLE` | — | 连接回收秒数，必须小于 MySQL 的 `wait_timeout`（默认 1800） |

### `frontend/.env.local`

| 变量 | 必填 | 说明 |
|---|:---:|---|
| `NEXT_PUBLIC_API_BASE` | ✓ | 后端地址，例如 `http://127.0.0.1:8000` |

> `NEXT_PUBLIC_*` 的值在 **构建时** 被打进浏览器包，改完必须重新构建/重新部署。

---

## 接口一览

除 `/health`、`/auth/register` 与 `/auth/login` 外，都需要 `Authorization: Bearer <后端签发的 access token>`。
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
Vercel            后端主机
Next.js  ───────► FastAPI ──────► MySQL（自建）
(静态 + SSR)
```

浏览器先向后端 `/auth/login` 换取 JWT，再用 JWT 调 FastAPI。只有后端持有 MySQL 凭据与 JWT 密钥。

### 第 1 步 —— MySQL（已在托管）

无需部署，但上线前确认：

- `python scripts/init_mysql.py` 已执行（6 张表都在）
- 后端用的账号只对该库有权限，**不是** `ALL PRIVILEGES ON *.*`
- 3306 只对需要的地址开放（绝不要 `0.0.0.0/0`）
- 服务器开启 `skip_name_resolve=1`，否则每次新建连接都要做一次反向 DNS

### 第 2 步 —— 部署后端到 Render

1. 把仓库推到 GitHub。
2. Render → **New → Web Service** → 连接该仓库。
3. 配置：
   - **Root Directory**：`backend`
   - **Build Command**：`pip install -r requirements.txt`
   - **Start Command**：`uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**：`/health`
4. **Environment → Add Environment Variable**：
   - `DATABASE_URL`（MySQL 连接串，密码要 URL 编码）
   - `JWT_SECRET`（自签 JWT 的 HS256 密钥）
   - `CORS_ORIGINS=https://<你的前端>.vercel.app`
5. 部署完成后访问 `https://<your-backend>.onrender.com/health`，应返回 `{"status":"ok",...}`。

> Render 的出口 IP 是动态的，往 MySQL 白名单里加会很麻烦。如果数据库继续放在阿里云，
> 把后端也放在同一 VPC 里既更快也更好管。

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
   - `NEXT_PUBLIC_API_BASE=https://<your-backend>.onrender.com`
4. 部署后打开 `https://<your-frontend>.vercel.app`，会跳转到 `/en`。

> `NEXT_PUBLIC_*` 在构建时写死，改完要重新部署。若前端先于后端部署，页面能打开但所有接口都会报 `errors.network`。

### 第 4 步 —— 打通 CORS

后端只接受 `CORS_ORIGINS` 里列出的来源。前端首次部署后：

1. 复制 Vercel 给出的确切域名（自定义域名也要加）。
2. 设置 `CORS_ORIGINS=https://<your-frontend>.vercel.app`（多个用逗号分隔），然后重新部署后端。
3. 漏配时的表现：浏览器控制台报 CORS 错误，界面上显示 `errors.network`。

### 第 5 步 —— 上线后检查清单

- [ ] 后端 `GET /health` 返回 `{"status":"ok",...}`
- [ ] Vercel 域名下 `/en` 与 `/zh` 都能正常渲染
- [ ] 注册学生 → 登录 → 目录能加载（可能为空）
- [ ] 用 SQL 提升一个管理员，能登录 `/en/admin`
- [ ] 教师上传 PDF，学生只有在审批通过后才能看到
- [ ] 在 `/en/admin` 禁用一个用户，其下一次请求立即被拒

### 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| `OperationalError (2003)` / 连 MySQL 报 `getaddrinfo failed` | 主机端口不对，或你的 IP 没被放行 | 检查 `DATABASE_URL`；确认安全组 / 防火墙对 3306 放行你的出口 IP |
| `(1045) Access denied for user ...` | 密码错，或账号只建成了 `'user'@'localhost'` | `SELECT user, host FROM mysql.user WHERE user='...'`，再建 `'user'@'%'` 并只授权该库 |
| 空闲一段时间后报 `MySQL server has gone away` | 池里的连接超过了 MySQL `wait_timeout` | `DB_POOL_RECYCLE` 要小于 `wait_timeout`；`pool_pre_ping` 已默认开启 |
| 建表报 `(1824) Failed to open the referenced table` | 建表顺序不对（外键依赖） | 用 `python scripts/init_mysql.py`，它按正确顺序执行 `db/schema.mysql.sql` |
| 后端日志出现 `OPTIONS /auth/register 400`，浏览器控制台报 CORS | 前端来源不在 `CORS_ORIGINS` 里；Starlette 对预检直接返回 `400 Disallowed CORS origin` | 把**完整来源（协议 + 主机 + 端口）**加进 `CORS_ORIGINS`，然后**重启后端** —— `.env` 不会被 `--reload` 重新加载 |
| 所有请求都报 `errors.network` | `NEXT_PUBLIC_API_BASE` 指向的主机/端口不对，或后端没起 | 改完后**重启 Next dev server**；生产构建则要重新部署 |
| 能登录但 `/courses` 返回 401 `PROFILE_NOT_FOUND` | 账号不是经后端 `/auth/register` 创建的，profiles 里没有对应行 | 走 `/auth/register` 建号，或手工插入 `profiles` 行 |

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

- [`docs/learning-path.zh.md`](docs/learning-path.zh.md) —— AI 个性化学习路径：本地运行、操作、演示、常见问题与交接。
- [`backend/LEARNING_PATHS.md`](backend/LEARNING_PATHS.md) —— 学习路径技术说明与接口约定（英文）。
- [`backend/LEARNING_PATH_ACCEPTANCE.md`](backend/LEARNING_PATH_ACCEPTANCE.md) —— 分别记录自动化与真实环境的验收结果及限制。

- [`product-design.md`](product-design.md) —— 产品设计文档：角色、权限矩阵、选课状态机、数据模型、验收清单、里程碑。
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
