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

## Generation setup

AI is disabled by default. POST `/learning-paths` saves a **draft**. POST
`/learning-paths/{id}/generate` accepts `{version_id, locale}`, calls a configured
provider, validates tasks and persists a complete ready plan atomically. There is
no browser endpoint accepting arbitrary generated tasks. Missing configuration
returns `AI_NOT_CONFIGURED`; offline tests replace the generator and use SQLite.

Add these settings to **backend/.env**, not frontend configuration:

```dotenv
AI_GENERATION_ENABLED=true
AI_CHAT_COMPLETIONS_URL=https://<provider-host>/v1/chat/completions
AI_API_KEY=<server-side API key>
AI_MODEL=<provider-model-id>
AI_TIMEOUT_SECONDS=60
```

The endpoint must support Chat Completions messages, `response_format: json_object`
and `max_tokens`. Use a full endpoint URL, not just a host. HTTPS is required except
localhost/127.0.0.1 test services. No redirects or automatic retries are followed.
Keys/provider response bodies are never returned to the browser. Restart the backend
after changing .env. Capability checks report configuration presence, not provider
connectivity or credit availability. Configuration alone does not send requests;
the student explicitly clicks Generate learning path.

Reference request format: [official Chat Completions documentation](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
Compatibility with an arbitrary third-party provider still needs a live check.

Generation sends only the goal, level, budget, language, course name/description
and a bounded subset of authorized PDF text. It does not include student identity,
emails, passwords or signed URLs. Up to three course files are considered, with at
most 12 complete pages / 20,000 text characters total; no OCR or semantic retrieval
is implemented. Only pages actually sent may be cited. Unapproved enrollment uses
public descriptions only; no-course plans use goals only. The UI explains the
source basis and partial coverage. Broken or encrypted materials fail explicitly.
External trusted resource recommendation is not implemented yet.

Task times must sum exactly to the saved budget. File/page references, fingerprints
and enrollment are checked; no unavailable or invented source is accepted. A late
failure rolls back tasks, links and activation. Successful ready versions are
idempotent and retain completion state; to generate again, create a new goal version.
Only the latest draft can be generated. Old ready plans remain active until their
replacement succeeds.

This iteration uses a synchronous request and holds the target plan's row lock
during generation, serializing updates to that plan. A concurrent MySQL request
gets a busy conflict; other plans are independent. Provider timeout defaults to
60 seconds (clamped 5–120), response size is bounded, and no intermediate generating
state is committed. Worker death rolls the database transaction back. This is not
a durable job queue or hard end-to-end deadline; storage and parsing add latency.
Background workers and MySQL concurrency/load verification remain future work.
Generation provider/model provenance history is also not persisted yet.

Plan generation needs migrations 001 and 002. Stage quizzes additionally need 003,
described below. Adaptive adjustments and generation workers remain subsequent work.

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
Reading alone does not mark a task complete. Task pages provide explicit confirmation.

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
endpoint; trusted generation code checks permissions and saves sources atomically
with tasks. No template-generated output is presented as real AI.

The task page `/zh/learning-path/{id}/tasks/{task_id}` (also /en) displays task
instructions and targeted text, provides manual completion/undo and a next-task
link. Historical versions are read-only. Opening a task never completes it.
New drafts contain no tasks until the student invokes configured real generation.

## Validation

From backend: `python -m pytest -q`. Learning-path tests use a fresh SQLite engine
with foreign keys enabled and real SQLAlchemy sessions; existing authentication
fixtures remain offline. MySQL migration syntax, MySQL concurrency and live
Supabase behavior require separate integration verification.

## Stage assessments

Review and apply `db/migrations/003_learning_path_assessments.sql` separately. It
creates only `learning_path_assessments` and `learning_path_attempts`, without
altering existing tables or data. Before migration, the stage summary endpoint
reports assessment_available=false, and the UI explains that assessments are not
enabled. Existing plan/task/resource flows continue to work.

Stage boundaries are contiguous groups of tasks with equal stage titles, in task
position order. The first task UUID is the stable stage anchor; an interior task
cannot be used to create a second quiz for the same stage. Each anchor has at most
one immutable quiz. Its task FK uses ON DELETE CASCADE; no material FK is added,
so existing material deletion is not blocked.

Endpoints:

- GET `/learning-paths/{id}/stages?version_id=...`: completion/score summaries.
- GET `/learning-paths/{id}/stages/{anchor}/assessment`: existing public quiz or
  id=null; never calls AI.
- POST the same assessment URL with `{locale}`: explicitly generate five questions,
  or reuse the existing quiz without another AI call.
- GET `/learning-paths/{id}/assessments/{quiz_id}/attempts`: graded history.
- POST the same attempts URL with `{request_id, answers}`: server grading.

Generated questions require five distinct prompts, four distinct choices per
question, one integer answer index, explanation, concept and valid page references.
The provider adapter is shared with plan generation; tests use mocked providers.
Quiz creation is atomic, with post-call permission and file-fingerprint checks.
AI factual correctness is not guaranteed by structural validation; scores are
self-assessment feedback rather than official exam grades.

Before submission, the response explicitly includes only prompts/options, never
answer indexes or explanations. Only a successful submission reveals feedback.
Answers, immutable quiz content and all scores are preserved. Retakes use the same
questions and report first/latest scores separately; they do not independently
establish mastery. The server rejects extra score fields, invalid choices, unknown
quiz IDs, cross-student/cross-plan requests and historical-version writes.

Each submission has a client-generated UUID. Retrying an identical request returns
the same saved attempt; reusing its UUID with different answers is rejected. A new
intentional retake uses a new UUID. Full feedback remains restricted by current
source permissions and file fingerprints. Deleted/replaced/revoked source material
cannot be read via a stored quiz. Stage-score summaries contain no question text.

Quiz context uses stage objectives/task instructions plus up to 10 complete linked
pages / 12,000 text characters. Without linked materials, it clearly uses task
instructions only. It does not send student identities, course passwords or signed
URLs to AI. Historical quizzes are readable but cannot accept new attempts.
Questions retain their generation language when the interface language changes.

Four out of five passes. A stage is completed only when all its tasks are done AND
the latest score is at least four. Quiz submission never checks off tasks or
changes task progress. Adaptive review/practice recommendations are not implemented
in this iteration. All assessment UI lives inside the learning-path workflow.
