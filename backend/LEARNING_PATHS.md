# Learning paths: persistence foundation

Implemented: student-owned goal drafts, multiple plans, immutable goal versions,
history selection, task completion/undo and derived progress. API endpoints are in
`app/learning_paths.py`; the Next.js entry is `/en/learning-path` or `/zh/learning-path`.

## Database setup (not automatic)

The existing six-table initialization script does **not** install these tables.
Review `db/migrations/001_learning_paths.sql` with the database owner, then execute
it separately against the agreed development database. The application does not
run migrations at startup. This migration only creates three new tables and does
not update existing business tables. Do not run seed or initialization scripts
against the shared database just to enable this feature.

Configure the existing `backend/.env` DATABASE_URL locally. Credentials do not
belong in frontend environment variables or Git. Authentication still requires
the existing Supabase integration to work.

## Explicit incomplete capabilities

No AI provider is configured or called. POST `/learning-paths` saves a **draft**,
not a generated plan; POST `/learning-paths/{id}/generate` returns
`AI_NOT_CONFIGURED`. The UI explains this limitation. There is no production
endpoint accepting arbitrary generated tasks from the browser. Tests insert
ready tasks only into disposable SQLite to validate progress without AI.

PDF extraction/reader, task-resource links, real generation, quizzes, adaptive
adjustments and generation workers are subsequent implementation work. The three
tables are the first migration, not the complete final schema. New versions of a
ready plan do not replace its current version until future generation succeeds.

## Validation

From backend: `python -m pytest -q`. Learning-path tests use a fresh SQLite engine
with foreign keys enabled and real SQLAlchemy sessions; existing authentication
fixtures remain offline. MySQL migration syntax, MySQL concurrency and live
Supabase behavior require separate integration verification.
