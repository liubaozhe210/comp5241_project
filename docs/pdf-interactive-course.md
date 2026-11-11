# PDF 互动课程（正式前后端实现）

入口：教师或已获选课审批的学生打开课程详情，点击「PDF 互动课程」。
路由：`/{locale}/courses/{courseId}/interactive`。

本实现移植旧演示版的创作和学习流程，运行在 Next.js / FastAPI 中。它真实读取 PDF 文本、调用配置的 AI、将原文及课程和学习记录写入数据库。旧 `feature/pdf-interactive-course` 分支仍是独立的静态示例，不需要合并其整套 mock 数据层。

## 启用

### 暂无登录配置时：本机完整体验

在项目根目录执行（Windows PowerShell）：

```powershell
# 首次准备：使用已安装依赖的 Python 环境
python -m pip install -r backend/requirements-dev.txt
cd frontend
npm ci
cd ..
.\scripts\start-pdf-lab.ps1
```

如果使用虚拟环境，可传入 `-Python "虚拟环境的 Scripts\python.exe 完整路径"`。
打开 `http://localhost:3310/local-pdf-lab.html`，先选教师上传 PDF、生成并发布，再回到入口选学生学习。

该入口使用测试身份和选课数据；PDF 解析、OpenRouter 调用及互动课流程真实执行。原文、课程、发布版本和学习进度持久化到 `backend/.local-pdf-lab/courses.sqlite`，不连接云端 MySQL。真实 AI 密钥仍从后端 `.env` 读取。每次生成会产生 API 用量，建议先用文字型短 PDF。切换身份前保存当前工作。

两个服务仅监听本机，日志和进程记录位于 `backend/.local-pdf-lab/`。用 `.\scripts\stop-pdf-lab.ps1` 停止，数据仍保留。重新启动不会重置已生成课程。

测试启动器临时设置子进程环境变量，使用独立 `.next-pdf-lab` 构建目录；不写入正式前端认证配置。生成的入口 HTML、测试数据和构建文件都被 Git 忽略。本模式仅用于开发，不能用作正式部署；正式部署继续使用 `app.main:app` 和真实认证。

### 正式服务配置

1. 保证项目现有 MySQL 和 Supabase Auth 可用。项目主 README 中记录旧 Supabase 项目已删除；需要团队提供有效认证项目。此功能没有绕过认证，也不替换现有登录。
2. 在后端环境中安装 `pip install -r requirements.txt`。
3. 在后端 `.env` 中设置以下配置（密钥不要提交到 Git）：

   ```dotenv
   COURSE_AI_BASE_URL=https://openrouter.ai/api/v1
   COURSE_AI_API_KEY=your-server-side-key
   COURSE_AI_MODEL=openai/gpt-4o
   ```

   已按 OpenRouter 配置，先沿用已有调用记录中的 GPT-4o。当前适配器使用 `POST {BASE_URL}/chat/completions`，Bearer 认证、`messages` 与 `response_format: {type: "json_object"}`；要求 `choices[0].message.content` 包含课程 JSON，`finish_reason` 为 `stop`。OpenRouter 请求额外设置 `provider.require_parameters=true`，仅路由到支持请求参数的供应商。未配置密钥时明确返回错误，不会生成示例课程。

   先不用数据库也可以测试：在 `backend` 下运行 `python scripts/check_course_ai.py`。它会用内置教学文本真实调用模型并校验完整课程结构，可能产生少量调用费用。成功输出 `PASS`；失败只输出错误码，不打印密钥或原始响应。`COURSE_AI_KEY_INVALID` 表示密钥无效，`COURSE_AI_CREDIT_LIMIT` 表示余额或消费上限问题，`COURSE_AI_RATE_LIMIT` 表示请求限流。OpenRouter 页面中的 Credit limit 是消费上限，不是账户余额。

   密钥只填写在本地 `backend/.env` 的 `COURSE_AI_API_KEY=` 后；不要放入前端环境变量或提交到 Git。配置修改后重启后端。官方参考：[API](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)、[参数路由要求](https://openrouter.ai/docs/guides/routing/provider-selection)、[模型 ID](https://openrouter.ai/openai/gpt-4o)。
4. 确认 `DATABASE_URL` 指向预期数据库，在 `backend` 下运行：

   ```powershell
   python scripts/init_interactive.py
   uvicorn app.main:app --reload --port 8000
   ```

   初始化脚本可重复运行，只创建缺少的三张新表，不修改现有表和数据。新数据库仍需先运行原有 `scripts/init_mysql.py`。PDF 字节保存在 `interactive_courses.source_data`（MySQL LONGBLOB），数据库 `max_allowed_packet` 应至少为 32 MB；此功能的原文下载不依赖 Supabase Storage。其余普通课件仍沿用现有 Storage。
5. 在 `frontend` 下执行 `npm ci`，按 `.env.example` 配置有效的认证 URL、公开密钥和后端地址，然后 `npm run dev`。

## 教师流程

1. 打开自己课程的互动课程入口，选择 PDF、教学目标、课程语言、水平与活动类型。
2. 提交时会将提取的文本发送给配置的 AI 服务。生成是同步请求，模型响应超时为 90 秒；部署代理的请求超时需覆盖解析和生成时间。失败可重试，失败结果不会创建课程。
3. 阅读生成内容并下载原文核对。可编辑标题、目标、讲解、例子、来源页码、选择题及解析、情景任务与检查项关键词。
4. 保存草稿后，可切换学生视角预览；预览不写入任何学生学习记录。
5. 发布前必须先发布所属课程。保存草稿不改变学生看到的版本；每次发布不同内容创建独立版本，相同内容重复发布不增加版本。
6. 其他页面同时修改时返回 409，保留页面上的未保存内容；确认后重新加载草稿再编辑。

## 学生流程

学生必须登录、账号有效且选课状态为 approved，所属课程也必须已发布。草稿对学生不可见。

- 逐节阅读讲解、例子和来源页码，下载有权限的原文。
- 选择题答案由后端判断；提交前接口不返回答案和解析。可重复练习，记录最近反馈、尝试次数和是否曾答对。
- 情景练习提交后按教师设定关键词返回检查表和参考答案。这是透明的练习提示，不是 AI 评分或正确性认证。
- 有测验的小节须答对后才能完成；最后一节如有情景练习，需先提交有效回答。
- 进度保存在服务器，按用户、课程和发布版本隔离；同一账号换浏览器后可恢复。进入课程后 URL 固定当前版本，刷新继续此版本；重新从列表打开进入最新版本，旧记录仍保留。

## 边界与验证

- 支持具有文字层的 PDF，最大 20 MB、100 页、60,000 字符；超限须拆分，密文和损坏文件拒绝。没有足够文本的扫描件提示先 OCR。未实现 OCR、图表理解或公式识别。
- 生成结果按 Pydantic 结构校验：选项和正确答案、非空字段、活动类型、语言和来源页码均验证；页码有效不代表内容事实一定正确，发布前须教师审核。
- 原文按权限下载，学生不能读草稿；停用账号、退课后即失去访问权限。归档课程禁止编辑。
- 真实 MySQL、认证服务和指定 AI 服务的联合运行，需要有效部署配置。离线测试不能证明外部服务已可用，也不能证明模型输出的教学质量。
- 不自动修改云数据库，不提交密钥，不自动发布到 GitHub。

## 自动检查

后端：

```powershell
cd backend
pip install -r requirements-dev.txt
python -m pytest -q
```

覆盖真实 PDF 提取、格式与大小限制、AI HTTP 协议和异常、教师与学生权限、草稿隔离、答案隐藏、发布版本、服务器评分、完成条件、跨会话持久化、并发冲突和 MySQL DDL。

前端：`npm ci`、`npm run typecheck`、`npm run build`。构建时需要认证环境变量；测试占位值只可用于隔离测试，不可作为正式配置。

浏览器完整流程测试使用明确隔离的 SQLite、测试身份和固定的生成结果；不会访问真实 AI 或认证项目：

1. 安装开发依赖，并准备一份至少有 100 个可提取字符的 PDF。
2. 后端终端：设置 `INTERACTIVE_E2E_DB` 为临时 SQLite 文件绝对路径、`CORS_ORIGINS=http://localhost:3310`，运行 `python -m uvicorn tests.serve_interactive_e2e:app --host 127.0.0.1 --port 8017`。
3. 前端终端：设置 `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co`、`NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon-key-for-build`、`NEXT_PUBLIC_API_BASE=http://127.0.0.1:8017`，运行 `npm run build`，然后 `npm run start -- --hostname localhost --port 3310`。浏览器访问 `http://localhost:3310`，保持监听和访问主机名一致。
4. 测试终端：将 `E2E_PDF` 设为测试 PDF 绝对路径。安装 Chromium（`npx playwright install chromium`），或设置 `E2E_BROWSER_CHANNEL=msedge` 使用本机 Edge，然后运行 `npm run test:e2e`。

`tests.serve_interactive_e2e` 仅用于测试，严禁作为部署入口。正式入口始终为 `app.main:app`。

## 接口

| 接口 | 用途 |
| --- | --- |
| GET /courses/{courseId}/interactive | 有权限的课程列表 |
| POST /courses/{courseId}/interactive | multipart PDF 与生成参数，返回草稿 |
| GET /interactive/{id}?revision=N | 教师草稿或学生发布快照 |
| PUT /interactive/{id} | 携带 version 的完整草稿保存 |
| POST /interactive/{id}/publish | 携带 version 发布快照 |
| GET /interactive/{id}/source | 鉴权下载原文 |
| GET /interactive/{id}/progress?revision=N | 当前学生的版本进度 |
| POST /interactive/{id}/activities | 携带 revision 的 quiz/scenario/complete 操作 |

实现参考：[pypdf 文本提取](https://pypdf.readthedocs.io/en/stable/user/extract-text.html)、[JSON 输出约定](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)。
