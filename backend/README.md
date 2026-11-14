# CourseHub Backend（FastAPI）

在线教学系统后端。业务数据在 MySQL；认证自托管（密码 bcrypt 哈希 + 后端自签 HS256 JWT）；课件存本地磁盘。不依赖 Supabase。

> **学习路径模块补充（2026-11-13）**：本模块的业务数据使用 MySQL，认证与课件存储沿用当前的自托管配置。
> 原有正文保留了较早阶段的项目状态；学习路径运行与迁移请看[中文专项指南](../docs/learning-path.zh.md)，
> 接口与设计看[LEARNING_PATHS.md](LEARNING_PATHS.md)，实际验证范围看[验收记录](LEARNING_PATH_ACCEPTANCE.md)。
> 共享数据库已有表时不要为启用本功能重跑初始化或种子脚本，应先核对 001–005 专项迁移。

> 部署到 Render 的完整步骤、环境变量与 CORS 配置见仓库根目录的 [README.md](../README.md#deployment)（中文版：[README.zh.md](../README.zh.md#部署)）。

## 快速开始

```powershell
conda activate se_project
cd backend
pip install -r requirements.txt

copy .env.example .env      # 填入 service_role key
uvicorn app.main:app --reload
```

打开 <http://127.0.0.1:8000/docs> 看接口文档。

## Interview Mastery 本地配置

Interview Mastery 使用独立的 MySQL 表和 OpenRouter 配置，不复用课程 AI 配置。先启动 MySQL 并配置 `DATABASE_URL`，然后从 `backend` 目录执行一次模块迁移：

```powershell
mysql -h <主机> -u <用户名> -p <数据库名> < db/migrations/006_interview_mastery.sql
```

在 `backend/.env` 中填写 `OPENROUTER_API_KEY` 和 `OPENROUTER_MODEL`；密钥只保存在后端。PDF 优先本地提取；遇到文字映射异常时，页面会在单独取得用户同意后，仅将需要识别的页面发送给 OpenRouter 视觉模型。`OPENROUTER_OCR_MODEL` 默认是 `qwen/qwen3-vl-30b-a3b-instruct`，可按需覆盖；OCR 依赖 `requirements.txt` 中的 PyMuPDF。识别结果可编辑，用户应检查并修正错误。若前端运行于 `localhost:3310`，确保 `CORS_ORIGINS` 包含 `http://localhost:3310`。默认 API 地址为 `http://127.0.0.1:8000`，可用前端 `NEXT_PUBLIC_API_BASE` 覆盖。进入 Interview Mastery 需要登录学生账户。

```powershell
python -m pytest tests/test_interview.py -q
```

## 环境变量

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | MySQL 连接串（`mysql+pymysql://user:pass@host:3306/db`，特殊字符要 URL 编码） |
| `JWT_SECRET` | 自签 JWT 的 HS256 密钥（随机字符串） |
| `MATERIALS_DIR` | 课件存储目录，默认 `data/materials` |
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
python -m pytest -q          # 39 项，全部离线（内存版 repo，不连数据库）
```

覆盖：鉴权链路、RBAC 越权、草稿可见性、选课全流程、满员、重复申请、课件上传校验与签名 URL 鉴权、审计留痕。

## 尚未完成

- `python scripts/init_mysql.py` 需在部署时执行以建库建表（含 `profiles.password_hash`）
- 前端（Next.js）尚未开始
- 邮件通知、分页、公告（P1）
