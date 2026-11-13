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

Task-resource links, real generation, quizzes, adaptive
adjustments and generation workers are subsequent implementation work. The three
tables are the first migration, not the complete final schema. New versions of a
ready plan do not replace its current version until future generation succeeds.

## Material reading foundation

Install the updated requirements (adds `pypdf>=7.0.1,<8.0`) and restart the backend
if automatic reload has not picked up the changes. No additional database migration
is needed for reading. The course details page retains the original Preview button
and adds Read material, linking to `/en/materials/{id}` or `/zh/materials/{id}`.

`GET /materials/{id}/text` uses existing JWT/profile and course-member checks before
downloading from the configured private Supabase bucket. Pending, rejected,
withdrawn and dropped students cannot read; course teachers and administrators
retain existing access. The API returns page-numbered plain text, title and file
SHA-256. It never sends files to an AI provider, changes enrollment or completes
learning tasks. Authorization is checked on every request, including cache hits.

An eight-entry in-process LRU caches extraction by actual file hash. The file is
downloaded on each request to detect replacement; no files or text are persisted
to the database. Worker restart clears the cache. Responses are private/no-store.

Limits: existing PDF byte limit, 200 pages, 5 MiB decoded page content stream,
20,000 characters per page and 300,000 characters total. Truncated extraction is
explicitly marked partial. Empty extraction is marked no_text, not success with
invented content. OCR and encrypted PDFs are unsupported. Layout, formulas and
images are not reproduced in plain text; the original PDF remains authoritative.
These checks are not a hard process memory/CPU sandbox: decompression/parsing can
still be expensive. A production extraction worker with resource/time limits is
future work. Storage SDK download also buffers the object before the actual byte
size check; metadata is checked before download.

The reading page supports page selection, previous/next and a separately requested
signed PDF preview. Text extraction failure does not disable the original Preview
endpoint. Signed links can expire; Load / refresh PDF requests a fresh link.
Reading does not mark a task complete. Task-linked reading and confirmation await
the generation/resource integration stage.

## Validation

From backend: `python -m pytest -q`. Learning-path tests use a fresh SQLite engine
with foreign keys enabled and real SQLAlchemy sessions; existing authentication
fixtures remain offline. MySQL migration syntax, MySQL concurrency and live
Supabase behavior require separate integration verification.
