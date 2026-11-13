"""PDF → draft → immutable published lessons → server-checked learner activities."""
import copy
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from ..config import settings
from ..deps import get_current_user, get_repo, require_roles
from ..errors import Forbidden, NotFound, Unprocessable
from ..interactive_schema import Activity, Content, Publish, SaveDraft, learner_content, validate_sources
from ..interactive_store import get_interactive_store
from ..pdf_generation import extract_pdf, generate_content
from ..services import audit, can_view_course_detail, require_course_teacher

router = APIRouter(tags=["interactive courses"])


def access(repo, user, course_id, edit=False):
    course = repo.get_course(course_id)
    if not course:
        raise NotFound("COURSE_NOT_FOUND")
    manager = user["role"] == "admin" or (user["role"] == "teacher" and course["teacher_id"] == user["id"])
    if edit:
        require_course_teacher(user, course)
        if course["status"] == "archived":
            raise Unprocessable("COURSE_ARCHIVED")
    elif not manager and (course["status"] != "published" or not can_view_course_detail(repo, user, course)):
        raise Forbidden("NOT_COURSE_MEMBER")
    return course, manager


def detail(row, store, manager, revision=None):
    content = copy.deepcopy(row.content) if manager else store.snapshot(row, revision)
    if not manager:
        content = learner_content(content)
    return {"id": row.id, "course_id": row.course_id, "version": row.version if manager else None,
            "revision": row.revision if revision is None else revision, "latest_revision": row.revision,
            "source_name": row.source_name, "source_page_count": len(row.source_pages),
            "content": content, "can_edit": manager}


@router.get("/courses/{course_id}/interactive")
def list_courses(course_id: str, user=Depends(get_current_user), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    _, manager = access(repo, user, course_id)
    result = []
    for row in store.list(course_id):
        if not manager and not row.revision:
            continue
        content = row.content if manager else store.snapshot(row)
        result.append({"id": row.id, "title": content["title"], "revision": row.revision,
                       "lessons": len(content["lessons"]), "source_name": row.source_name})
    return result


@router.post("/courses/{course_id}/interactive", status_code=201)
def generate(course_id: str, file: UploadFile = File(...), language: Literal["zh", "en"] = Form("en"),
             level: Literal["beginner", "intermediate"] = Form("beginner"), goal: str = Form("", max_length=2000),
             activities: Literal["quiz", "scenario", "both"] = Form("both"),
             user=Depends(require_roles("teacher", "admin")), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    access(repo, user, course_id, edit=True)
    data = file.file.read(settings.max_pdf_bytes + 1)
    pages = extract_pdf(data)
    content = generate_content(pages, language, level, goal, activities)
    # Recheck parent state after the long-running external call.
    if hasattr(repo, "session"):
        repo.session.rollback()
    access(repo, user, course_id, edit=True)
    name = (file.filename or "source.pdf").replace("\\", "/").split("/")[-1][:200]
    row = store.create(course_id, user["id"], name, data, pages, content.model_dump())
    audit(repo, user, "actGenerateInteractive", "interactive", row.id, {"course_id": course_id})
    return detail(row, store, True)


@router.get("/interactive/{iid}")
def read(iid: str, revision: int | None = None, user=Depends(get_current_user), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    row = store.get(iid)
    _, manager = access(repo, user, row.course_id)
    return detail(row, store, manager, revision if not manager else None)


@router.get("/interactive/{iid}/source")
def source(iid: str, user=Depends(get_current_user), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    row = store.get(iid)
    _, manager = access(repo, user, row.course_id)
    if not manager and not row.revision:
        raise NotFound("INTERACTIVE_NOT_PUBLISHED")
    return Response(row.source_data, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="source.pdf"',
                             "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store"})


@router.put("/interactive/{iid}")
def save(iid: str, payload: SaveDraft, user=Depends(require_roles("teacher", "admin")), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    row = store.get(iid)
    access(repo, user, row.course_id, edit=True)
    validate_sources(payload.content, row.source_pages)
    store.save(row, payload.version, payload.content.model_dump())
    audit(repo, user, "actEditInteractive", "interactive", row.id)
    return detail(row, store, True)


@router.post("/interactive/{iid}/publish")
def publish(iid: str, payload: Publish, user=Depends(require_roles("teacher", "admin")), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    row = store.get(iid)
    course, _ = access(repo, user, row.course_id, edit=True)
    if course["status"] != "published":
        raise Unprocessable("COURSE_NOT_PUBLISHED")
    validate_sources(Content.model_validate(row.content), row.source_pages)
    store.publish(row, payload.version)
    audit(repo, user, "actPublishInteractive", "interactive", row.id, {"revision": row.revision})
    return detail(row, store, True)


@router.get("/interactive/{iid}/progress")
def progress(iid: str, revision: int | None = None, user=Depends(require_roles("student")), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    row = store.get(iid)
    access(repo, user, row.course_id)
    revision = row.revision if revision is None else revision
    store.snapshot(row, revision)
    _, data = store.progress(row, user["id"], revision)
    return {"revision": revision, **data}


def apply_activity(content, data, payload):
    """Pure server grading; preview uses the same function without writing progress."""
    if payload.lesson >= len(content["lessons"]):
        raise Unprocessable("INVALID_LESSON")
    lesson = content["lessons"][payload.lesson]
    key = str(payload.lesson)
    if payload.kind == "quiz":
        quiz = lesson.get("quiz")
        if not quiz or payload.answer >= len(quiz["options"]):
            raise Unprocessable("INVALID_ANSWER")
        previous = data["quizzes"].get(key, {})
        correct = payload.answer == quiz["answer"]
        data["quizzes"][key] = {"selected": payload.answer, "correct": correct,
            "passed": previous.get("passed", False) or correct, "answer": quiz["answer"],
            "explanation": quiz["explanation"], "attempts": previous.get("attempts", 0) + 1}
    elif payload.kind == "scenario":
        scenario = content.get("scenario")
        if not scenario or len("".join(payload.response.split())) < 30:
            raise Unprocessable("SCENARIO_TOO_SHORT")
        text = payload.response.casefold()
        data["scenario"] = {"response": payload.response, "example_answer": scenario["example_answer"],
            "checks": [{"label": r["label"], "matched": any(k.casefold() in text for k in r["keywords"])}
                       for r in scenario["rubric"]]}
    else:
        if lesson.get("quiz") and not data["quizzes"].get(key, {}).get("passed"):
            raise Unprocessable("QUIZ_REQUIRED")
        if payload.lesson == len(content["lessons"]) - 1 and content.get("scenario") and not data["scenario"]:
            raise Unprocessable("SCENARIO_REQUIRED")
        data["completed"] = sorted(set(data["completed"] + [payload.lesson]))
    return data


@router.post("/interactive/{iid}/activities")
def activity(iid: str, payload: Activity, user=Depends(require_roles("student")), repo=Depends(get_repo), store=Depends(get_interactive_store)):
    row = store.get(iid)
    course, _ = access(repo, user, row.course_id)
    if course["status"] == "archived":
        raise Unprocessable("COURSE_ARCHIVED")
    content = store.snapshot(row, payload.revision)
    record, data = store.progress(row, user["id"], payload.revision)
    apply_activity(content, data, payload)
    store.save_progress(row, user["id"], payload.revision, record, data)
    return {"revision": payload.revision, **data}
