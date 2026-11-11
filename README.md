# CourseHub — Online Teaching System

PDF interactive courses: see the [setup and verification guide](docs/pdf-interactive-course.md). Teachers can generate editable lessons from text PDFs and publish versioned courses; student activities and progress persist on the server. Requires a configured AI provider and three additional database tables.

[中文版](README.zh.md) · English

COMP5241 Software Engineering course project. A role-based online teaching platform for **administrators, teachers and students**: teachers publish courses and PDF materials, students browse courses and request enrollment, administrators govern accounts and audit every sensitive operation.

The UI ships in **English and Simplified Chinese** (switchable per user). The system is a Next.js frontend, a FastAPI backend and a hosted Supabase project.

---

## Features

| Area | Student | Teacher | Admin |
|---|---|:---:|:---:|
| Register / sign in / sign out (bilingual) | ✓ | ✓ (invite code) | ✓ |
| Course catalog and course detail | ✓ | ✓ | ✓ |
| View course materials (PDF) | approved only | own courses | all |
| Request / withdraw enrollment | ✓ | — | — |
| Approve / reject enrollment | — | own courses | any |
| Add or remove students manually | — | own courses | any |
| Create / edit / archive courses | — | own courses | any |
| Upload / delete PDF materials | — | own courses | delete |
| User management (disable, change role, reset password) | — | — | ✓ |
| Audit log of sensitive operations | — | — | ✓ |

Rules enforced by the backend:

- **Deny by default.** Two visibility levels: catalog level (public course info) and detail level (materials), which requires an approved enrollment, the owning teacher or an admin.
- **Immediate revocation.** Disabling an account takes effect on the very next request; `status` is re-read from the database, never taken from the token.
- **Explicit enrollment state machine**: `pending → approved / rejected / withdrawn`, `approved → dropped`; illegal transitions return `409`.
- **Stable error codes.** The API returns `{"code", "message", "detail"}` and the frontend maps `code` to a localized message.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · next-intl |
| Backend | FastAPI · Pydantic v2 · SQLAlchemy 2.0 |
| Database | **MySQL 8.0.16+ (self-hosted)** — 6 tables, business data only |
| Auth | Supabase Auth (email + password; JWT verified by the backend) — *pending replacement, see Current status* |
| File storage | Supabase Storage, private bucket `materials` (PDF only, ≤ 20 MB) |
| Deployment | Vercel (frontend) · any host with a persistent disk (backend) · MySQL |

> **Current status (2026-11):** business data has been migrated off Supabase into MySQL.
> The Supabase project that provided Auth and Storage has been deleted, so **login and
> material preview do not work right now**. Everything else (schema, repository layer,
> RBAC, enrollment state machine, tests) is already database-agnostic and green.

---

## Repository layout

```
comp5241_project/
├── frontend/                    # Next.js application (bilingual UI)
├── backend/
│   ├── app/                     # FastAPI service (routers, services, repo, models)
│   ├── db/schema.mysql.sql      # MySQL DDL (no RLS — the backend is the only writer)
│   ├── scripts/                 # init_mysql.py · migrate_from_supabase.py · seed_demo.py
│   └── tests/                   # 35 offline tests (in-memory repo)
├── supabase/                    # legacy: Postgres schema / RLS / storage bucket
├── demo/                        # static clickable prototype (no backend)
├── scripts/check-docs.mjs       # markdown link checker
├── product-design.md            # product design document (Chinese)
├── AGENTS.md                    # team conventions
├── README.md                    # this file (English)
└── README.zh.md                 # Chinese version
```

---

## Prerequisites

- Node.js 18.18+ and npm
- Python 3.12+ (the team uses the Anaconda environment `se_project`)
- **MySQL 8.0.16+** (the `CHECK` constraints need 8.0.16; 8.0.46 is what we run)
- A Supabase project — only for Auth and file storage while the replacement is pending

### Quick start

```bash
# 1) backend  (http://127.0.0.1:8000)
cd backend
python scripts/init_mysql.py                    # create tables (safe to re-run)
uvicorn app.main:app --reload --port 8000

# 2) frontend (http://localhost:3000)
cd frontend
npm install
npm run dev
```

Use another port for either side? Change `--port 8000` and/or `npm run dev -- --port 3001`,
then keep `NEXT_PUBLIC_API_BASE` and `CORS_ORIGINS` in sync with both.

---

## Local setup

### 1. Prepare MySQL

```bash
cd backend
python scripts/init_mysql.py
```

Creates the database if missing and all six tables (`profiles`, `courses`, `enrollments`,
`materials`, `audit_logs`, `invite_codes`). Safe to re-run.

Connection string format (special characters such as `@` must be URL-encoded as `%40`):

```
DATABASE_URL=mysql+pymysql://<user>:<password>@<host>:3306/<database>
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
# fill DATABASE_URL (MySQL) and, while Auth still lives there, SUPABASE_URL / SERVICE_ROLE_KEY
uvicorn app.main:app --reload --port 8000
```

- Health check: <http://127.0.0.1:8000/health>
- Interactive API docs: <http://127.0.0.1:8000/docs>

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # Windows: copy .env.example .env.local
npm run dev
```

Open <http://localhost:3000>; it redirects to `/en`.
If port 3000 is taken, run `npm run dev -- --port 3001` — and remember to add
`http://localhost:3001` to `CORS_ORIGINS` in `backend/.env`.

### 4. First-run checklist

1. Confirm the backend is healthy: <http://127.0.0.1:8000/health> → `{"status":"ok",...}`.
2. Register a student account at `/en/register`.
3. Sign in. The catalog is empty until a teacher publishes a course.
4. To obtain an admin account, promote one row (the registration trigger deliberately
   downgrades any client-supplied `role=admin` to `student`):
   ```sql
   update profiles set role = 'admin' where login_id = '<your login id>';
   ```
   Re-login is **not** required — the backend re-reads `profiles` on every request.

### 5. Seed demo data (optional)

```bash
cd backend
python scripts/seed_demo.py
```

Creates 2 teachers, 3 students, 6 courses, 8 enrollments and 6 real PDF materials — all accounts share the password `Demo1234!`.

- **Idempotent**: existing users / courses / enrollments / materials are skipped, so it is safe to re-run.
- **Never touches administrators**, and prints the current admin list at the end.
- Teachers are created through the real registration path with the invite code `TEACHER2026`, so two invite uses are consumed.
- The PDFs are generated programmatically (valid xref), so students can actually preview them in the browser.
- Requires Auth to be reachable (accounts are created through it).

| Role | Login ID | Email |
|---|---|---|
| Teacher | `t1001` | `michael.wong@polyu.edu.hk` |
| Teacher | `t1002` | `sarah.lee@polyu.edu.hk` |
| Student | `26072062g` | `26072062g@connect.polyu.hk` |
| Student | `26072063g` | `26072063g@connect.polyu.hk` |
| Student | `26072064g` | `26072064g@connect.polyu.hk` |

### 6. Moving data (one-off)

```bash
python scripts/migrate_from_supabase.py   # copies business tables Supabase → MySQL, keeps UUIDs
```

Idempotent (`INSERT ... ON DUPLICATE KEY UPDATE`). It only moves business data; accounts
still live in Supabase Auth, and `profiles.id` keeps matching the auth user id.

---

## Environment variables

### `backend/.env`

| Variable | Required | Description |
|---|:---:|---|
| `DATABASE_URL` | ✓ | `mysql+pymysql://<user>:<password>@<host>:3306/<database>` — URL-encode special characters (`@` → `%40`) |
| `SUPABASE_URL` | ✓ (Auth) | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ (Auth) | `service_role` secret key (server-side only) |
| `SUPABASE_JWT_SECRET` | — | Only for legacy HS256 projects; leave empty to verify tokens via JWKS |
| `SUPABASE_JWT_AUDIENCE` | — | Defaults to `authenticated` |
| `CORS_ORIGINS` | — | Comma-separated frontend origins; defaults to `http://localhost:3000,http://127.0.0.1:3000,null` |
| `MAX_PDF_BYTES` | — | Defaults to 20 MB |
| `SIGNED_URL_TTL` | — | Signed URL lifetime in seconds, defaults to 60 |
| `DB_POOL_SIZE` | — | Connection pool size, defaults to 5 |
| `DB_POOL_RECYCLE` | — | Seconds before a pooled connection is recycled; must stay below MySQL `wait_timeout` (default 1800) |

### `frontend/.env.local`

| Variable | Required | Description |
|---|:---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | publishable / anon key |
| `NEXT_PUBLIC_API_BASE` | ✓ | Backend base URL, e.g. `http://127.0.0.1:8000` |

> `NEXT_PUBLIC_*` values are inlined into the browser bundle at **build time** — changing one requires a rebuild/redeploy. Never place the `service_role` key in a `NEXT_PUBLIC_*` variable.

---

## API overview

Everything except `/health` and `/auth/register` requires `Authorization: Bearer <supabase access token>`.
Full schema: <http://127.0.0.1:8000/docs> (or `/openapi.json` in production).

| Method | Path | Who |
|---|---|---|
| `POST` | `/auth/register` | public (teacher needs an invite code) |
| `GET` | `/auth/me` | signed in |
| `PATCH` | `/auth/me/locale` | signed in |
| `GET` | `/courses` | signed in (published only) |
| `GET` | `/courses/mine` | teacher / admin |
| `GET` | `/courses/{id}` | signed in |
| `POST` · `PATCH` | `/courses` · `/courses/{id}` | owning teacher / admin |
| `GET` · `POST` | `/courses/{id}/materials` | members · owning teacher / admin |
| `GET` | `/materials/{id}/url` | members (60 s signed URL) |
| `DELETE` | `/materials/{id}` | owning teacher / admin |
| `POST` | `/courses/{id}/enrollments` | student |
| `DELETE` | `/courses/{id}/enrollments/me` | student |
| `GET` | `/me/enrollments` | student |
| `GET` | `/courses/{id}/enrollments` | owning teacher / admin |
| `POST` | `/courses/{id}/enrollments/{eid}/approve` · `/reject` | owning teacher / admin |
| `POST` · `DELETE` | `/courses/{id}/members` · `/courses/{id}/members/{eid}` | owning teacher / admin |
| `GET` · `POST` · `PATCH` | `/admin/users…` | admin |
| `GET` | `/admin/audit` | admin |

---

## Testing

```bash
# Backend: 35 tests, fully offline (in-memory repository, no network)
cd backend && python -m pytest -q

# Static prototype: 121 checks + i18n key parity
cd demo && node smoke-test.mjs && node check-i18n.mjs

# Documentation links
node scripts/check-docs.mjs
```

---

## Deployment

Production is three managed services; there is no server to maintain.

```
        Browser
           │
   ┌───────┴─────────┐
   │                 │
Vercel            Backend host
Next.js  ───────► FastAPI ──────► MySQL (self-hosted)
(static + SSR)                    Supabase Auth/Storage (pending removal)
```

The browser obtains a JWT from Supabase Auth, then calls FastAPI with it. Only the backend
holds the `service_role` key and the MySQL credentials.

### Step 1 — MySQL (already hosted)

Nothing to deploy, but verify before going live:

- `python scripts/init_mysql.py` has been executed (six tables present).
- The account used by the backend is scoped to that one database — **not** `ALL PRIVILEGES ON *.*`.
- Port 3306 is open only to the addresses that need it (never `0.0.0.0/0`).
- `skip_name_resolve=1` on the server, otherwise every new connection pays a reverse-DNS lookup.

### Step 2 — Deploy the backend to Render

1. Push the repository to GitHub.
2. Render → **New → Web Service** → connect the repository.
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
4. **Environment → Add Environment Variable**:
   - `DATABASE_URL` (the MySQL connection string, password URL-encoded)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (while Auth still lives there)
   - `CORS_ORIGINS=https://<your-frontend>.vercel.app`
5. Deploy, then confirm `https://<your-backend>.onrender.com/health` returns `{"status":"ok",...}`.

> Render's egress IPs are dynamic, so allow-listing them in MySQL is fragile. If the
> database stays on Alibaba Cloud, hosting the backend on the same VPC is both faster
> and easier to secure.

### Step 3 — Deploy the frontend to Vercel

1. Vercel → **Add New → Project** → import the same repository.
2. Settings:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Next.js (auto-detected; `next build` is handled by Vercel)
3. **Environment Variables** (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE=https://<your-backend>.onrender.com`
4. Deploy, then open `https://<your-frontend>.vercel.app` — it redirects to `/en`.

> `NEXT_PUBLIC_*` variables are baked in at build time; change one and redeploy. If the frontend is deployed before the backend, pages still render but every API call fails with `errors.network`.

### Step 4 — Wire CORS

The backend only accepts requests from the origins listed in `CORS_ORIGINS`. After the first frontend deploy:

1. Copy the exact Vercel URL (custom domains must be added as well).
2. Set `CORS_ORIGINS=https://<your-frontend>.vercel.app` (comma-separated for several) and redeploy the backend.
3. A missing origin appears as a CORS error in the browser console and as `errors.network` in the UI.

### Step 5 — Post-deploy checklist

- [ ] `GET /health` returns `{"status":"ok",...}`
- [ ] `/en` and `/zh` both render on the Vercel URL
- [ ] Register a student → sign in → the catalog loads (possibly empty)
- [ ] Promote one account to `admin` with SQL and sign in to `/en/admin`
- [ ] As a teacher, upload a PDF; a student sees it only after approval
- [ ] Disable a user in `/en/admin` and confirm the next request is rejected

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `OperationalError (2003)` / `getaddrinfo failed` to MySQL | Wrong host/port, or the MySQL port is not open from your IP | Check `DATABASE_URL`; confirm the security group / firewall allows 3306 from your egress IP |
| `(1045) Access denied for user ...` | Wrong password, or the account exists only as `'user'@'localhost'` | `SELECT user, host FROM mysql.user WHERE user='...'`, then create `'user'@'%'` with a grant on the one database |
| `MySQL server has gone away` after idle time | Pooled connection exceeded MySQL `wait_timeout` | Keep `DB_POOL_RECYCLE` below `wait_timeout`; `pool_pre_ping` is already enabled |
| `(1824) Failed to open the referenced table` while creating tables | Tables created out of order (foreign keys) | Run `python scripts/init_mysql.py` — it applies `db/schema.mysql.sql` in the right order |
| Backend log shows `OPTIONS /auth/register 400`, browser console shows a CORS error | The frontend origin is not in `CORS_ORIGINS`; Starlette answers the preflight with `400 Disallowed CORS origin` | Add the exact origin (**scheme + host + port**) to `CORS_ORIGINS`, then **restart** the backend — `.env` is not reloaded by `--reload` |
| Every request fails with `errors.network` | `NEXT_PUBLIC_API_BASE` points at the wrong host/port, or the backend is down | Fix the value and **restart the Next dev server**; for a production build, redeploy |
| Sign-in works but `/courses` returns 401 `PROFILE_NOT_FOUND` | The account was created outside the backend (direct Supabase signup), so the registration trigger never created a profile | Create accounts through `/auth/register`, or insert the `profiles` row manually |

> `http://localhost:3001` and `http://127.0.0.1:3001` are **different origins** to a browser. List whichever one you actually open, or both.

---

## Static prototype (`demo/`)

`demo/` is the earlier **clickable prototype** — pure HTML/CSS/JS with mock data and no backend. It is kept as a design reference and for demos that must run without any service:

```bash
cd demo && node smoke-test.mjs    # or simply open demo/index.html
```

It also contains an experimental *AI mock interview* module which is **out of scope** (see §3.3 of the design document); remove three lines from `demo/index.html` to drop the module entirely.

---

## Documentation

- [`product-design.md`](product-design.md) — product design document (Chinese): roles, permission matrix, enrollment state machine, data model, acceptance criteria, milestones.
- [`supabase/README.md`](supabase/README.md) — Supabase project setup notes.
- [`backend/README.md`](backend/README.md) — endpoint list and backend design notes.
- [`frontend/README.md`](frontend/README.md) — page map, auth split, i18n notes.

---

## Not implemented yet

- Teacher UI for creating/editing courses, uploading materials and approving enrollments (endpoints are ready)
- Admin UI for role changes, password reset and the audit log (endpoints are ready)
- Seed script for demo users and courses
- Pagination, toasts, skeleton loaders
- AI mock interview (explicitly out of scope)

---

## Conventions

See [`AGENTS.md`](AGENTS.md): every change is committed, and tests must pass before delivery.

- Backend tests are offline by design — the repository layer is replaced by an in-memory fake, so no network is required.
- Documentation links are validated by [`scripts/check-docs.mjs`](scripts/check-docs.mjs).
