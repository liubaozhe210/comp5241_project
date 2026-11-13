"""Task-specific reading. Sources are written by trusted generation code, never browser input."""
from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from .db import get_session
from .deps import get_repo, require_student
from .errors import Conflict, NotFound, Unprocessable
from .learning_paths import owned, path_material
from .material_reading import read_material
from .models import LearningPathTask, LearningPathTaskSource, LearningPathVersion

router = APIRouter(tags=["learning-path-task-reading"])


class TaskSourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    material_id: str = Field(min_length=1, max_length=36)
    fingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")
    page_start: int = Field(ge=1, le=200)
    page_end: int = Field(ge=1, le=200)

    @model_validator(mode="after")
    def ordered(self):
        if self.page_end < self.page_start:
            raise ValueError("Page range must be ordered")
        return self


def bind_task_source(session, task, source: TaskSourceInput, reading: dict):
    """Internal generation hook. Caller checks permissions and commits atomically with tasks."""
    if source.material_id != reading["material_id"] or source.fingerprint != reading["fingerprint"]:
        raise Conflict("LEARNING_PATH_SOURCE_CHANGED")
    pages = [p for p in reading["pages"] if source.page_start <= p["number"] <= source.page_end]
    if len(pages) != source.page_end - source.page_start + 1:
        raise Unprocessable("LEARNING_PATH_PAGE_RANGE_INVALID")
    if any(p["truncated"] for p in pages) or not any(p["text"].strip() for p in pages):
        raise Unprocessable("LEARNING_PATH_SOURCE_TEXT_UNAVAILABLE")
    session.add(LearningPathTaskSource(task_id=task.id, **source.model_dump()))


def task_context(session, path_id, task_id, user):
    path = owned(session, path_id, user["id"])
    task = session.get(LearningPathTask, task_id)
    if not task:
        raise NotFound("LEARNING_PATH_TASK_NOT_FOUND")
    version = session.get(LearningPathVersion, task.version_id)
    if version.path_id != path.id:
        raise NotFound("LEARNING_PATH_TASK_NOT_FOUND")
    return path, task, version


def linked_reading(session, repo, path, task, version, user, response):
    # New endpoints degrade explicitly while the additive migration awaits approval.
    if not inspect(session.connection()).has_table(LearningPathTaskSource.__tablename__):
        return None, "migration_pending"
    source = session.get(LearningPathTaskSource, task.id)
    if source is None:
        return None, "not_linked"
    if source.material_id is None:
        raise NotFound("LEARNING_PATH_SOURCE_REMOVED")
    path_material(session, repo, path.id, version.id, source.material_id, user)
    reading = read_material(source.material_id, response, user, repo)
    if reading["fingerprint"] != source.fingerprint:
        raise Conflict("LEARNING_PATH_SOURCE_CHANGED")
    pages = [p for p in reading["pages"] if source.page_start <= p["number"] <= source.page_end]
    if len(pages) != source.page_end - source.page_start + 1:
        raise Unprocessable("LEARNING_PATH_PAGE_RANGE_INVALID")
    return {**reading, "pages": pages, "page_start": source.page_start, "page_end": source.page_end}, "linked"


@router.get("/learning-paths/{path_id}/tasks/{task_id}/study")
def study_task(path_id: str, task_id: str, response: Response,
               user=Depends(require_student), session: Session = Depends(get_session), repo=Depends(get_repo)):
    path, task, version = task_context(session, path_id, task_id, user)
    reading, source_status = linked_reading(session, repo, path, task, version, user, response)
    response.headers["Cache-Control"] = "private, no-store"
    return {"id": task.id, "title": task.title, "stage": task.stage, "instructions": task.instructions,
            "minutes": task.minutes, "done": task.done, "version_id": version.id,
            "read_only": version.id != path.current_version_id or version.status != "ready",
            "source_status": source_status, "reading": reading}


@router.get("/learning-paths/{path_id}/tasks/{task_id}/study/url")
def study_url(path_id: str, task_id: str, response: Response,
              user=Depends(require_student), session: Session = Depends(get_session), repo=Depends(get_repo)):
    path, task, version = task_context(session, path_id, task_id, user)
    reading, status = linked_reading(session, repo, path, task, version, user, response)
    if status != "linked":
        raise NotFound("LEARNING_PATH_RESOURCE_NOT_FOUND")
    from .routers.courses import material_url
    response.headers["Cache-Control"] = "private, no-store"
    return material_url(reading["material_id"], user, repo)
