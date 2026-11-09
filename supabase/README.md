# Supabase 配置说明

项目：`https://ncfyrpxfbiunsjsmecax.supabase.co`

## 当前状态（2026-10 探测结果）

| 项 | 状态 |
|---|---|
| Auth（邮箱密码） | 可用 |
| 业务表（profiles / courses / enrollments / materials / audit_logs） | **不存在**（REST 访问全部 404） |
| Storage bucket | **不存在** |
| 邮箱确认（Confirm email） | **开启**，会挡住演示注册后的登录 |

SQL 必须由你执行 —— Supabase 的 REST 接口不支持 DDL。

## 三步配置

### 1. 建表（必须有）

打开 Dashboard → **SQL Editor** → New query → 粘贴 `supabase/schema.sql` 全文 → **Run**。

跑完最后那条自检 SQL 应返回 6 个 `true`。

脚本是幂等的，重复执行不会报错；包含：

- 5 张业务表 + `invite_codes`（已预置演示邀请码 `TEACHER2026`，可用 50 次）
- 注册触发器：`auth.users` 插入时自动建 `profiles`；**教师注册必须带有效邀请码**，客户端伪造 `role=admin` 会被强制降级为 student
- 6 个判定辅助函数（`is_admin` / `is_course_teacher` / `is_course_member` …）
- 全表 RLS 策略（默认拒绝，按角色与课程成员资格开放）
- 私有 Storage 桶 `materials`（仅 PDF、单文件 ≤ 20 MB）+ 对象级策略

### 2. 关掉邮箱确认（建议）

Dashboard → **Authentication → Providers → Email** → 关闭 **Confirm email**。

否则学生注册后必须点邮件里的确认链接才能登录，而 Supabase 免费额度对发信有严格限流，演示时很容易卡住。

> 若坚持开启，后端创建账号时可用 Admin API 的 `email_confirm: true` 直接标记已确认。

### 3. 拿 service_role key（后端需要）

Dashboard → **Project Settings → API → Project API keys** → 复制 **`service_role`**（标注 `secret` 的那一个）。

它只能放在后端环境变量里，**绝不能进前端包**。用途：

- 建教师账号 / 重置密码（Admin API）
- 写审计日志（绕过 RLS）
- 生成课件签名 URL

> 你目前给的 `sb_publishable_...` 是公开可用的 anon 级别 key，前端用它登录没问题，但做不了上面这些事。

## 待定决策

1. **后端怎么访问数据**（影响依赖与代码结构）
   - A. `supabase-py` + service_role 走 REST —— 不需要数据库密码，与 Auth/Storage 同一套 SDK
   - B. SQLAlchemy 2.0 + 直连 Postgres —— 与设计文档 7.1 一致，但需要 **数据库密码**（Dashboard → Settings → Database）
2. **依赖安装与本地运行由谁执行**：本会话执行命令需要逐次放行（沙箱限制），可以代劳，也可以你本地跑。
3. 是否需要我顺带准备 `seed.sql`（演示课程/选课/课件元数据）—— 依赖真实 auth 用户 id，通常放在后端 seed 脚本里更合适。

## 前端需要的环境变量

```bash
NEXT_PUBLIC_SUPABASE_URL=https://ncfyrpxfbiunsjsmecax.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

## 后端需要的环境变量

```bash
SUPABASE_URL=https://ncfyrpxfbiunsjsmecax.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>
SUPABASE_JWT_SECRET=<Dashboard → API → JWT Settings>   # 或改用 JWKS 验签
```
