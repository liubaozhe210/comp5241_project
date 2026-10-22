# CourseHub Frontend（Next.js）

在线教学系统前端。认证走 Supabase Auth（浏览器端只拿 JWT），**业务数据全部经 FastAPI 后端**，不直连数据库。

> 部署到 Vercel 的完整步骤、环境变量与 CORS 打通见仓库根目录的 [README.md](../README.md#deployment)（中文版：[README.zh.md](../README.zh.md#部署)）。

## 快速开始

```powershell
cd frontend
npm install
copy .env.example .env.local     # 默认值已指向本地后端与 Supabase 项目
npm run dev                      # http://localhost:3000
```

生产构建：

```powershell
npm run build
npm run start
```

后端需同时在跑：`cd backend && uvicorn app.main:app --port 8000`。

## 环境变量

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable / anon key（**只能放这个，不能放 service_role**） |
| `NEXT_PUBLIC_API_BASE` | FastAPI 地址，默认 `http://127.0.0.1:8000` |

## 已实现页面

| 路径 | 说明 |
|---|---|
| `/[locale]` | 欢迎页（未登录入口） |
| `/[locale]/login` | 登录（Supabase Auth） |
| `/[locale]/register` | 注册：学生免邀请码；教师需邀请码（走后端 `/auth/register`） |
| `/[locale]/courses` | 课程目录（`GET /courses`），带搜索 |
| `/[locale]/courses/[id]` | 课程详情：申请/撤回、课件列表；未通过审批显示锁态 |
| `/[locale]/my` | 学生：我的课程与申请状态 |
| `/[locale]/teaching` | 教师：我的课程（含草稿/归档） |
| `/[locale]/admin` | 管理员：用户列表、禁用/启用 |

`locale` 支持 `en` / `zh`，默认 `en`，右上角可切换（`next-intl` + 路由前缀）。

## 认证与授权分工

```
浏览器 ──(email+password)──> Supabase Auth ──> access_token(JWT)
   │
   └──(Authorization: Bearer JWT)──> FastAPI ──> Supabase(service_role, 绕过 RLS)
```

- 前端只做**引导与展示**：没登录就跳登录页，按 `me.role` 渲染导航
- 真正的权限判定全在后端依赖层；前端拿到的 403 直接展示
- `useSession()` 用 JWT 调 `/auth/me` 换 profile；账号被禁用会立刻被后端拒绝，前端自动清会话

## 错误处理

后端统一返回 `{code, message, detail}`。前端 `lib/api.ts` 里的 `errorText()` 按 `code` 查 `messages/*.json` 的 `errors.*` 文案，查不到才用通用提示 —— 所以新增错误码时，两处补一下即可。

## 视觉

象牙白底 + 单一墨蓝强调色 + 衬线标题（与 `demo/` 原型同一套语言），Tailwind 自定义色板见 `tailwind.config.ts`。

## 还没做

- 教师端的建课/改课、课件上传表单、选课审批界面（后端接口已就绪）
- 管理员的改角色/重置密码/审计日志页面（后端已就绪）
- 分页、骨架屏、Toast 组件
