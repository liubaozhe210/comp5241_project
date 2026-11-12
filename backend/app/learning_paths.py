"""Learning-path persistence foundation. Generation is deliberately unavailable until wired."""
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_session
from .deps import require_student
from .errors import Conflict, NotFound, Unprocessable
from .models import Course, LearningPath, LearningPathTask, LearningPathVersion

router = APIRouter(tags=["learning-paths"])


class GoalInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str = Field(min_length=1, max_length=120)
    goal: str = Field(min_length=1, max_length=1000)
    level: Literal["beginner", "intermediate", "advanced"] = "beginner"
    budget_minutes: int = Field(ge=60, le=12000, multiple_of=30)
    course_id: str | None = Field(default=None, max_length=36)

    @field_validator("topic", "goal", mode="before")
    @classmethod
    def strip_text(cls, value):
        return value.strip() if isinstance(value, str) else value


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    done: bool


def owned(session, path_id, student_id, lock=False):
    query = select(LearningPath).where(
        LearningPath.id == path_id, LearningPath.student_id == student_id)
    if lock:
        query = query.with_for_update()
    path = session.scalar(query.execution_options(populate_existing=True))
    if path is None:
        raise NotFound("LEARNING_PATH_NOT_FOUND")
    return path


def validate_course(session, course_id):
    if course_id:
        course = session.get(Course, course_id)
        if course is None or course.status != "published":
            raise Unprocessable("LEARNING_PATH_COURSE_UNAVAILABLE")


def serialize(session, path, version=None):
    version = version or session.get(LearningPathVersion, path.current_version_id)
    tasks = session.scalars(select(LearningPathTask).where(
        LearningPathTask.version_id == version.id).order_by(LearningPathTask.position)).all()
    completed = sum(task.done for task in tasks)
    return {
        "id": path.id, "current_version_id": path.current_version_id,
        "version_id": version.id, "version": version.number,
        "topic": version.topic, "goal": version.goal, "level": version.level,
        "budget_minutes": version.budget_minutes, "course_id": version.course_id,
        "status": version.status, "created_at": version.created_at.replace(tzinfo=timezone.utc).isoformat(),
        "completed_tasks": completed, "total_tasks": len(tasks),
        "progress": round(completed * 100 / len(tasks)) if tasks else 0,
        "next_task_id": next((task.id for task in tasks if not task.done), None),
        "tasks": [{"id": task.id, "stage": task.stage, "title": task.title,
                   "instructions": task.instructions, "minutes": task.minutes,
                   "done": task.done, "completed_at": task.completed_at.replace(tzinfo=timezone.utc).isoformat()
                   if task.completed_at else None} for task in tasks],
    }


@router.get("/learning-paths/capabilities")
def capabilities(user=Depends(require_student)):
    return {"generation_available": False, "reason": "AI_NOT_CONFIGURED"}


@router.get("/me/learning-paths")
def list_paths(user=Depends(require_student), session: Session = Depends(get_session)):
    paths = session.scalars(select(LearningPath).where(
        LearningPath.student_id == user["id"]).order_by(LearningPath.created_at.desc())).all()
    return [serialize(session, path) for path in paths]


@router.post("/learning-paths", status_code=201)
def create_path(payload: GoalInput, user=Depends(require_student), session: Session = Depends(get_session)):
    validate_course(session, payload.course_id)
    path_id, version_id = str(uuid4()), str(uuid4())
    path = LearningPath(id=path_id, student_id=user["id"], current_version_id=version_id)
    session.add(path)
    session.flush()
    version = LearningPathVersion(id=version_id, path_id=path_id, number=1,
                                  status="draft", **payload.model_dump())
    session.add(version)
    session.commit()
    return serialize(session, path, version)


@router.get("/learning-paths/{path_id}")
def get_path(path_id: str, version_id: str | None = None,
             user=Depends(require_student), session: Session = Depends(get_session)):
    path = owned(session, path_id, user["id"])
    version = None
    if version_id:
        version = session.get(LearningPathVersion, version_id)
        if version is None or version.path_id != path.id:
            raise NotFound("LEARNING_PATH_NOT_FOUND")
    return serialize(session, path, version)


@router.get("/learning-paths/{path_id}/versions")
def versions(path_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    path = owned(session, path_id, user["id"])
    rows = session.scalars(select(LearningPathVersion).where(
        LearningPathVersion.path_id == path.id).order_by(LearningPathVersion.number.desc())).all()
    return [serialize(session, path, version) for version in rows]


@router.post("/learning-paths/{path_id}/versions", status_code=201)
def revise(path_id: str, payload: GoalInput, user=Depends(require_student), session: Session = Depends(get_session)):
    path = owned(session, path_id, user["id"], lock=True)
    validate_course(session, payload.course_id)
    latest = session.scalar(select(LearningPathVersion).where(
        LearningPathVersion.path_id == path.id).order_by(LearningPathVersion.number.desc()).limit(1).with_for_update())
    current = session.get(LearningPathVersion, path.current_version_id)
    version = LearningPathVersion(id=str(uuid4()), path_id=path.id, number=latest.number + 1,
                                  status="draft", **payload.model_dump())
    session.add(version)
    # A working plan stays current until its replacement has generated successfully.
    if current.status == "draft":
        path.current_version_id = version.id
    session.commit()
    return serialize(session, path, version)


@router.post("/learning-paths/{path_id}/generate")
def generate(path_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    owned(session, path_id, user["id"])
    raise Conflict("AI_NOT_CONFIGURED")


@router.patch("/learning-paths/{path_id}/tasks/{task_id}")
def update_task(path_id: str, task_id: str, payload: TaskUpdate,
                user=Depends(require_student), session: Session = Depends(get_session)):
    path = owned(session, path_id, user["id"], lock=True)
    task = session.get(LearningPathTask, task_id)
    if task is None:
        raise NotFound("LEARNING_PATH_TASK_NOT_FOUND")
    version = session.get(LearningPathVersion, task.version_id)
    if version.path_id != path.id:
        raise NotFound("LEARNING_PATH_TASK_NOT_FOUND")
    if version.id != path.current_version_id or version.status != "ready":
        raise Conflict("LEARNING_PATH_READ_ONLY")
    if task.done != payload.done:
        task.done = payload.done
        task.completed_at = datetime.now(timezone.utc).replace(tzinfo=None) if payload.done else None
    session.commit()
    return serialize(session, path)
