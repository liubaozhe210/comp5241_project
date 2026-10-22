# CourseHub — Online Teaching System

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
| Backend | FastAPI · Pydantic v2 · supabase-py (service role) |
| Database | Supabase Postgres — 6 tables with RLS policies |
| Auth | Supabase Auth (email + password; JWT verified by the backend) |
| File storage | Supabase Storage, private bucket `materials` (PDF only, ≤ 20 MB) |
| Deployment | Vercel (frontend) · Render (backend) · Supabase Cloud |

---

## Repository layout

```
comp5241_project/
├── frontend/                    # Next.js application (bilingual UI)
├── backend/                     # FastAPI service (all business logic)
├── supabase/
│   ├── schema.sql               # tables, triggers, RLS policies, storage bucket
│   └── README.md                # Supabase project configuration notes
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
- A Supabase project (the free tier is sufficient)

---

## Local setup

### 1. Prepare Supabase

1. Open the project → **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and run it. It creates six tables, the registration trigger, RLS policies and the private `materials` bucket, and is safe to re-run.
2. **Authentication → Providers → Email**: *Confirm email* may stay enabled — the backend creates accounts through the Admin API with `email_confirm: true`, so registration is never blocked by the mailbox.
3. **Authentication → Sign In / Providers**: turn **off** *Allow new users to sign up*. Accounts must only be created by the backend, otherwise the teacher invite code can be bypassed.
4. Copy the keys from **Project Settings → API**:
   - `anon` / publishable key → frontend
   - `service_role` secret key → backend only, never the browser

More detail in [`supabase/README.md`](supabase/README.md).

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env
# fill SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
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

### 4. First-run checklist

1. Register a student account at `/en/register`.
2. Sign in. The catalog is empty until a teacher publishes a course.
3. To obtain an admin account, create a user and promote it once with SQL:
   ```sql
   update public.profiles set role = 'admin' where login_id = '<your login id>';
   ```
   The registration trigger deliberately downgrades any client-supplied `role=admin` to `student`.

---

## Environment variables

### `backend/.env`

| Variable | Required | Description |
|---|:---:|---|
| `SUPABASE_URL` | ✓ | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | `service_role` secret key (server-side only) |
| `SUPABASE_JWT_SECRET` | — | Only for legacy HS256 projects; leave empty to verify tokens via JWKS |
| `SUPABASE_JWT_AUDIENCE` | — | Defaults to `authenticated` |
| `CORS_ORIGINS` | — | Comma-separated frontend origins; defaults to `http://localhost:3000,http://127.0.0.1:3000,null` |
| `MAX_PDF_BYTES` | — | Defaults to 20 MB |
| `SIGNED_URL_TTL` | — | Signed URL lifetime in seconds, defaults to 60 |

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
Vercel            Render
Next.js  ───────► FastAPI ──────► Supabase
(static + SSR)   (service role)   Postgres · Auth · Storage
```

The browser talks to Supabase Auth to obtain a JWT, then calls FastAPI with that JWT. Only the backend holds the `service_role` key.

### Step 1 — Supabase (already hosted)

Nothing to deploy, but verify before going live:

- `supabase/schema.sql` has been executed (six tables, and the `materials` bucket under **Storage**).
- *Allow new users to sign up* is **off**.
- Both keys are at hand: publishable (frontend) and secret (backend).

### Step 2 — Deploy the backend to Render

1. Push the repository to GitHub.
2. Render → **New → Web Service** → connect the repository.
3. Settings:
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Health Check Path**: `/health`
4. **Environment → Add Environment Variable**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CORS_ORIGINS=https://<your-frontend>.vercel.app`
5. Deploy, then confirm `https://<your-backend>.onrender.com/health` returns `{"status":"ok","supabase_configured":true,…}`.

Notes:

- Free instances sleep when idle, so the first request after a pause is slow — worth remembering during a demo.
- Never commit `.env`; set the variables in the dashboard instead.
- Railway, Fly.io, Koyeb or a small VPS behind nginx work just as well with the same start command.

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

- [ ] `GET /health` returns `supabase_configured: true`
- [ ] `/en` and `/zh` both render on the Vercel URL
- [ ] Register a student → sign in → the catalog loads (possibly empty)
- [ ] Promote one account to `admin` with SQL and sign in to `/en/admin`
- [ ] As a teacher, upload a PDF; a student sees it only after approval
- [ ] Disable a user in `/en/admin` and confirm the next request is rejected

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
