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
is needed for reading. The course details page retains only its original Preview
button. The standalone reader at `/en/materials/{id}` or `/zh/materials/{id}` is
reserved for integration from learning-path tasks; there is no new course-page
entry. Future reading entry points belong inside the learning-path workflow.

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

## Reading from the learning-path workflow

Plan details now show Related course materials for the selected goal version.
This is an authorized course-material list, explicitly not AI-selected knowledge
points or generated tasks. No course-page changes or database migrations are
required. Drafts can access materials if their owner has approved enrollment.

GET `/learning-paths/{id}/resources?version_id=...` returns available, locked,
no_course or unavailable. Locked responses contain no material metadata. Text and
signed URL endpoints under `/learning-paths/{id}/resources/{material_id}/...`
validate student ownership, version ownership, course match and current enrollment
before delegating to the existing readers. A plan does not grant new permissions.

The reader route is `/zh/learning-path/{id}/materials/{material_id}?version=...`
(also `/en/...`). Its return link preserves the selected goal version. Original
standalone readers remain available. Reading neither changes tasks nor enrollment.
The material list is separate from task-to-page references, described below.

## Task-to-page reading contract

`db/migrations/002_learning_path_task_sources.sql` creates one additive table for
task/material/SHA-256/page-range references. It is NOT executed automatically.
Until applied, new task study endpoints return migration_pending and task
instructions; existing draft and progress APIs do not query the new table.

GET `/learning-paths/{id}/tasks/{task_id}/study` resolves ownership and current
resource permissions and returns only the linked PDF pages with original page
numbers. Its `/url` subroute revalidates the reference before signing. Replaced
files produce SOURCE_CHANGED; removed materials produce SOURCE_REMOVED. The FK
uses ON DELETE SET NULL so existing material deletion remains possible.

The internal `bind_task_source` hook accepts only ordered valid page ranges,
matching material/hash, and complete nonempty text. It has no public browser write
endpoint; future trusted generation code must check permissions and save sources
atomically with tasks. No AI output, tasks or source links are fabricated here.

The task page `/zh/learning-path/{id}/tasks/{task_id}` (also /en) displays task
instructions and targeted text, provides manual completion/undo and a next-task
link. Historical versions are read-only. Opening a task never completes it.
New drafts still contain no tasks until real generation is implemented/configured.

## Validation

From backend: `python -m pytest -q`. Learning-path tests use a fresh SQLite engine
with foreign keys enabled and real SQLAlchemy sessions; existing authentication
fixtures remain offline. MySQL migration syntax, MySQL concurrency and live
Supabase behavior require separate integration verification.
