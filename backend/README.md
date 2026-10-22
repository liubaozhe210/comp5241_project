# CourseHub Backend（FastAPI）

在线教学系统后端。数据/Auth/Storage 全部走 Supabase（service_role）。

## 快速开始

```powershell
conda activate se_project
cd backend
pip install -r requirements.txt

copy .env.example .env      # 填入 service_role key
uvicorn app.main:app --reload
```

打开 <http://127.0.0.1:8000/docs> 看接口文档。

## 环境变量

| 变量 | 说明 |
|---|---|
| `SUPABASE_URL` | `https://ncfyrpxfbiunsjsmecax.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Settings → API → `service_role`（**只放后端**） |
| `SUPABASE_JWT_SECRET` | 项目仍用旧版 HS256 时填；留空则走 JWKS 非对称验签 |
| `MAX_PDF_BYTES` / `SIGNED_URL_TTL` | 可选，默认 20MB / 60s |

## 已实现接口

| 方法 | 路径 | 权限 |
|---|---|---|
| POST | `/auth/register` | 公开（教师需邀请码） |
| GET | `/auth/me` | 登录 |
| PATCH | `/auth/me/locale` | 登录 |
| GET | `/courses` | 登录（仅已发布） |
| GET | `/courses/mine` | 教师 / 管理员 |
| GET | `/courses/{id}` | 登录（草稿仅本人与管理员） |
| POST | `/courses` | 教师 / 管理员 |
| PATCH | `/courses/{id}` | 任课教师 / 管理员 |
| GET | `/courses/{id}/materials` | 课程成员 / 任课教师 / 管理员 |
| POST | `/courses/{id}/materials` | 任课教师 / 管理员（PDF，≤20MB） |
| GET | `/materials/{id}/url` | 课程成员（返回 60s 签名 URL） |
| DELETE | `/materials/{id}` | 任课教师 / 管理员 |
| POST | `/courses/{id}/enrollments` | 学生（申请） |
| DELETE | `/courses/{id}/enrollments/me` | 学生（撤回） |
| GET | `/me/enrollments` | 学生 |
| GET | `/courses/{id}/enrollments` | 任课教师 / 管理员 |
| POST | `/courses/{id}/enrollments/{eid}/approve` \| `/reject` | 任课教师 / 管理员 |
| POST | `/courses/{id}/members` | 任课教师 / 管理员（按学号/邮箱加人） |
| DELETE | `/courses/{id}/members/{eid}` | 任课教师 / 管理员 |
| GET | `/admin/users` | 管理员 |
| POST | `/admin/users/{id}/disable` \| `/enable` | 管理员 |
| PATCH | `/admin/users/{id}/role` | 管理员 |
| POST | `/admin/users/{id}/reset-password` | 管理员 |
| GET | `/admin/audit` | 管理员 |

错误统一为 `{"code": "...", "message": "...", "detail": {...}}`，前端按 `code` 映射文案。

## 关键设计

- **授权集中在依赖层**（`app/deps.py`）：`get_current_user` 每次请求查 `profiles.status`，禁用账号立即生效，不等 token 过期。
- **选课状态机**（`app/services.py`）：非法迁移返回 409 `INVALID_TRANSITION`；满员 409 `ENROLLMENT_FULL`；重复加人 409 `ALREADY_MEMBER`。
- **课件双层鉴权**：列表与签名 URL 都要先过 `can_view_course_detail`（仅 approved 成员/教师/管理员），未通过返回 403 且不泄露文件是否存在。
- **PDF 校验看文件头** `%PDF-`，不看扩展名；大小上限 20MB。
- **审计**：注册、建课改课、上传/删除课件、审批、加人踢人、禁用、改角色、重置密码都会写 `audit_logs`。

## 测试

```powershell
cd backend
python -m pytest -q          # 33 项，全部离线（内存版 repo，不连 Supabase）
```

覆盖：鉴权链路、RBAC 越权、草稿可见性、选课全流程、满员、重复申请、课件上传校验与签名 URL 鉴权、审计留痕。

## 尚未完成

- Supabase 尚未执行 `supabase/schema.sql`（表都不存在，目前只有单元测试能跑）
- 前端（Next.js）尚未开始
- 邮件通知、分页、公告（P1）
