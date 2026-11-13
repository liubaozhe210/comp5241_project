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
described below. Adaptive adjustment storage additionally needs migration 004.
Generation workers remain subsequent work.

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
After confirming completion, the reader offers the first unfinished task in the
same stage. When that stage is complete, including any added review tasks, it
instead links to the stage quiz on the main path screen and expands that quiz.
It does not skip directly to a later stage. Reopening a completed current-version
task restores this continuation; historical versions show no continuation action.

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
one immutable quiz before migration 005; after 005 it can have multiple immutable
rounds, as described below. Its task FK uses ON DELETE CASCADE; no material FK is added,
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
Answers, immutable quiz content and all scores are preserved. Retakes within one
round use the same questions and report first/latest scores separately; they do not independently
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

The main learning-path screen groups tasks by these same stage boundaries and
places each quiz directly after its own tasks, before the next stage. Quizzes
expand in place; study instructions, answer forms, results and history share the
path screen. Finishing all stage tasks highlights the quiz and opens it by default
if it is not already passed. Users may still choose to self-test earlier; no new
hard progression lock is imposed. Collapsing an opened quiz preserves its mounted
form state. Submitted feedback stays expanded while the stage summary refreshes.
The standalone stage quiz routes remain compatible and reuse the same StageQuiz
component. No new database migration is needed for this layout change; migration
003 is still required to enable quiz storage itself.

Frontend regression checks: run `npm run test:learning-path` from frontend. These
verify contiguous grouping, stable quiz anchors, rendered task/quiz order and
read-only historical task controls without network or database access.

Four out of five passes. A stage is completed only when all its tasks are done AND
the latest score is at least four. Quiz submission never checks off tasks or
changes task progress. All assessment UI lives inside the learning-path workflow.

## Adaptive adjustment preview and application

Review `db/migrations/004_learning_path_adjustments.sql` before applying it to the
shared database. It creates only `learning_path_adjustments`; it does not alter
existing tables or run automatically. Missing migration disables adjustments with
a specific message while existing plan, reading and assessment endpoints remain
available.

After grading, the student can explicitly request a preview, inspect all new tasks
and time changes, then apply it. This iteration uses deterministic score rules,
without additional AI calls: 0–2/5 adds 15-minute reviews for distinct missed
concepts; 3/5 adds 20-minute practice tasks; 4–5/5 offers a 30-minute applied
challenge only after all stage tasks are done. Otherwise it recommends finishing
the current tasks. These recommendations do not claim to be AI-generated exercises.

New tasks are inserted at the end of their existing stage, before its quiz. The
first-task stage anchor, original tasks, completion timestamps, quiz questions and
attempt history are preserved. New unfinished tasks can lower the displayed
completion percentage and reopen the stage. Recommendations reuse explanations
and validated PDF references from the quiz; challenge tasks are self-contained.
Applying an adjustment does not silently regenerate the stage quiz.
After application, the frontend waits for the latest plan, replaces the entire
stage/quiz component tree in one update and reloads stage summaries. Old mounted
quiz state is discarded; a manual browser refresh is unnecessary. If loading the
updated plan fails, the existing plan stays visible with a retry message.

Only unfinished tasks in later stages can have their estimated time shortened,
by at most half per adjustment, retaining at least five minutes. The preview shows
each reduction. If the revised total exceeds the original budget, a separate
checkbox is required. The saved original budget remains unchanged; plan responses
report `estimated_minutes` and `extra_minutes` separately. Shorter estimates do
not remove or rewrite future learning content.

Endpoints:

- GET `/learning-paths/{id}/attempts/{attempt_id}/adjustment`: saved preview/status;
  no generation or mutation.
- POST the same URL: create or refresh a preview for that attempt.
- POST `/learning-paths/{id}/adjustments/{adjustment_id}/apply` with
  `{allow_extra_time: false}` (or explicit true): atomically apply the preview.

The latest attempt and current ready version are required for changes. Source
access and fingerprints are rechecked. Task-progress/time/order changes invalidate
the preview and require refresh. An already-applied adjustment is idempotent;
unfinished additions of the same kind prevent stacking that kind repeatedly.
All writes roll back together on failure. Historical versions remain read-only.
Tests cover budget confirmation, owner checks, stale previews, newer attempts,
duplicate applications, rollback, score rules and missing-table compatibility.
SQLite regression tests do not replace live MySQL concurrency verification.

## Plan completion and task progress

`progress` remains the percentage of checked-off study tasks. It can reach 100
before the plan is completed. The shared `app/learning_progress.py` summary is
used by plan list/detail/history responses and stage summaries. A nonempty ready
plan is completed only when all tasks are done and each stage's latest quiz
attempt scores at least 4/5. Empty plans, drafts and missing assessment tables
never produce `plan_completed=true`.

Responses additionally expose `assessment_available`, `total_stages`,
`passed_stages`, `completed_stages`, `plan_completed`, `completion_status` and
`next_assessment_anchor`. Passed stages count latest passing scores, whereas
completed stages additionally require all stage tasks to be done. No answer keys
or question text are included in these derived fields, and no completion flag is
stored. Undoing a task, a later failed attempt, or newly added unfinished review
tasks updates completion on the next read; previous scores and timestamps stay
intact. Original plan generation status (`ready` etc.) remains unchanged.

The list and details show stage-pass counts and a separate completion label. Plan
details explain the 4/5 rule and link to a finished stage still awaiting a passing
quiz. Submitting a quiz refreshes completion without remounting its visible
feedback; applying an adjustment still replaces the stage tree. This requires no
database migration or AI request. Offline tests cover these transitions and
list/detail/history/stage-summary agreement.

## Fresh quiz rounds

Migration `db/migrations/005_learning_path_quiz_rounds.sql` changes only indexes
on our `learning_path_assessments` table: add a nonunique anchor index to support
the existing foreign key, then remove the unique anchor index. It creates no
tables, changes no columns or row contents, and preserves questions, attempts and
foreign keys. Review and run once separately; it is not an automatic startup
migration. The ORM does not require new columns, so before migration all existing
quiz endpoints remain usable and the UI reports that new rounds are unavailable.

POST `/learning-paths/{id}/stages/{anchor}/assessment/rounds` accepts
`{previous_assessment_id, locale}`. It requires ownership, a current ready version,
all stage tasks completed and at least one submission in the current round. An
explicit confirmation warns that this calls AI and reopens stage completion.
Generation checks sources, access and output using the same validation as initial
generation. It additionally sends prompts from the last three rounds as exclusions
and rejects any prompt matching any historical prompt after case/whitespace
normalization. This does not guarantee semantic novelty or factual correctness.
Generation failure rolls back without replacing the current round or pass status.

The plan row lock serializes generation and progress writes. Retrying a request
whose previous round was already replaced returns the newest round without another
AI call. A new unanswered round cannot be replaced again. Round order uses stored
creation time plus UUID, with new times strictly after the previous round.

GET the original assessment endpoint defaults to the latest round. Optional
`assessment_id` selects a historical round belonging to that stage. Responses
include round number, round-selector metadata and latest ID, never answer keys.
The existing attempts endpoint returns only the selected round's results. A
historical round cannot receive new submissions; replay of an already saved
identical request remains idempotent. History reads retain source-access checks.

Stage pass/completion and adjustment eligibility now use the newest round's latest
attempt. Successful generation of a new round reopens completion until it passes;
old scores remain available through the selector. Old unapplied adjustments cannot
be applied after replacement. Duplicate supplementary-task prevention also spans
rounds. The UI retains ordinary same-question retakes as a separate action and
allows old questions, explanations and scores to be viewed without overwriting them.

Regression tests cover generation prerequisites, historical read-only behavior,
retry idempotency, completion transitions, stale adjustments, exact prompt reuse,
provider failures, fabricated sources, source revocation, owner/version checks,
legacy unique-index compatibility and explicit UI confirmation. Tests use SQLite
and mocked AI; live provider quality and MySQL concurrency need separate checks.
