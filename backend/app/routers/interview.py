"""Interview Mastery API. All records are isolated by the authenticated student owner."""
from __future__ import annotations

import json
import re
import zipfile
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Literal
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_session
from ..config import settings
from ..deps import require_student
from ..errors import AppError, Conflict, NotFound, Unprocessable
from ..interview_ai import (
    InterviewAI,
    InterviewAIError,
    InterviewReportOutput,
    NextQuestionOutput,
    REPORT_SYSTEM,
    RESUME_SYSTEM,
    ResumeAssessmentOutput,
    REVIEW_SYSTEM,
    ReviewOutput,
    NEXT_QUESTION_SYSTEM,
    TurnReviewOutput,
    get_interview_ai,
)
from ..models import IMAssessment, IMResume, IMReviewItem, IMSession, IMTurn, utc_now


router = APIRouter(prefix="/interview", tags=["interview-mastery"])
POLICY_VERSION = "v1"
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TEXT_LENGTH = 30_000
DIMENSIONS = ("communication", "technical_depth", "problem_solving", "job_fit")


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ResumeCreate(StrictInput):
    title: str = Field(min_length=1, max_length=80)
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    source_filename: str | None = Field(default=None, max_length=255)
    source_mime: str | None = Field(default=None, max_length=100)
    source_size_bytes: int | None = Field(default=None, ge=0, le=MAX_FILE_BYTES)
    job_title: str = Field(default="", max_length=120)
    seniority: Literal["intern", "junior", "mid", "senior", "unspecified"] = "unspecified"
    job_description: str = Field(default="", max_length=5000)

    @field_validator("title", "text", "job_title", "job_description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("text")
    @classmethod
    def validate_resume_text(cls, value: str) -> str:
        if len(value) < 100:
            raise ValueError("Resume text must contain at least 100 characters")
        return value


class ResumeUpdate(ResumeCreate):
    pass


class AssessmentCreate(StrictInput):
    privacy_consent: Literal[True]
    locale: Literal["en", "zh"] = "en"
    job_title: str = Field(default="", max_length=120)
    seniority: Literal["intern", "junior", "mid", "senior", "unspecified"] | None = None


class InterviewCreate(StrictInput):
    job_title: str = Field(min_length=1, max_length=120)
    seniority: Literal["intern", "junior", "mid", "senior", "unspecified"] = "junior"
    interview_type: Literal["technical", "mixed"] = "mixed"
    question_limit: int = Field(default=8, ge=4, le=12)
    resume_id: str | None = Field(default=None, max_length=36)
    privacy_consent: Literal[True]
    locale: Literal["en", "zh"] = "en"

    @field_validator("job_title")
    @classmethod
    def strip_job_title(cls, value: str) -> str:
        return value.strip()


class StartTurn(StrictInput):
    pass


class AnswerSubmit(StrictInput):
    turn_id: str = Field(min_length=1, max_length=36)
    answer: str | None = Field(default=None, max_length=8000)
    finish_reason: Literal["manual", "timeout"] = "manual"
    client_request_id: str = Field(min_length=1, max_length=36)
    locale: Literal["en", "zh"] = "en"

    @field_validator("answer")
    @classmethod
    def strip_answer(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class EndSession(StrictInput):
    client_request_id: str = Field(min_length=1, max_length=36)
    locale: Literal["en", "zh"] = "en"


class ReviewCreate(StrictInput):
    question: str = Field(min_length=1, max_length=2000)
    category: Literal["self_intro", "behavioral", "project_deep_dive", "technical", "pressure"] = "behavioral"
    tags: list[str] = Field(default_factory=list, max_length=12)
    answer_framework: str = Field(default="", max_length=4000)

    @field_validator("question", "answer_framework")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("tags")
    @classmethod
    def clean_tags(cls, value: list[str]) -> list[str]:
        return [tag.strip()[:40] for tag in value if tag.strip()][:12]


class ReviewUpdate(StrictInput):
    mastery_status: Literal["pending", "mastered"]


class ReviewRetry(StrictInput):
    answer: str = Field(min_length=1, max_length=8000)
    locale: Literal["en", "zh"] = "en"

    @field_validator("answer")
    @classmethod
    def strip_answer(cls, value: str) -> str:
        return value.strip()


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat()


def _owned_resume(session: Session, resume_id: str, owner_id: str, *, lock: bool = False) -> IMResume:
    query = select(IMResume).where(IMResume.id == resume_id, IMResume.owner_id == owner_id)
    if lock:
        query = query.with_for_update()
    row = session.scalar(query)
    if row is None:
        raise NotFound("INTERVIEW_RESOURCE_NOT_FOUND")
    return row


def _owned_session(session: Session, session_id: str, owner_id: str, *, lock: bool = False) -> IMSession:
    query = select(IMSession).where(IMSession.id == session_id, IMSession.owner_id == owner_id)
    if lock:
        query = query.with_for_update()
    row = session.scalar(query)
    if row is None:
        raise NotFound("INTERVIEW_RESOURCE_NOT_FOUND")
    return row


def _owned_assessment(session: Session, assessment_id: str, owner_id: str) -> IMAssessment:
    row = session.scalar(select(IMAssessment).where(
        IMAssessment.id == assessment_id, IMAssessment.owner_id == owner_id))
    if row is None:
        raise NotFound("INTERVIEW_RESOURCE_NOT_FOUND")
    return row


def _owned_review(session: Session, review_id: str, owner_id: str, *, lock: bool = False) -> IMReviewItem:
    query = select(IMReviewItem).where(IMReviewItem.id == review_id, IMReviewItem.owner_id == owner_id)
    if lock:
        query = query.with_for_update()
    row = session.scalar(query)
    if row is None:
        raise NotFound("INTERVIEW_RESOURCE_NOT_FOUND")
    return row


def _resume_dict(row: IMResume, *, include_text: bool = False) -> dict:
    result = {
        "id": row.id, "title": row.title, "source_filename": row.source_filename,
        "source_mime": row.source_mime, "source_size_bytes": row.source_size_bytes,
        "job_title": row.job_title, "seniority": row.seniority,
        "job_description": row.job_description, "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }
    if include_text:
        result["text"] = row.text
    return result


def _assessment_dict(row: IMAssessment) -> dict:
    return {
        "id": row.id, "resume_id": row.resume_id, "job_title": row.job_title,
        "seniority": row.seniority, "report": row.report_json,
        "created_at": _iso(row.created_at),
    }


def _review_dict(row: IMReviewItem) -> dict:
    return {
        "id": row.id, "source": row.source_type, "source_id": row.source_id,
        "question": row.question, "category": row.category, "tags": row.tags or [],
        "answer_framework": row.answer_framework, "last_answer": row.last_answer,
        "last_score": row.last_score, "last_feedback": row.last_feedback or {},
        "last_practiced_at": _iso(row.last_practiced_at),
        "mastery_status": row.mastery_status, "created_at": _iso(row.created_at),
        "updated_at": _iso(row.updated_at),
    }


def _turn_dict(row: IMTurn) -> dict:
    turns = [{
        "id": row.id, "role": "assistant", "phase": row.phase, "text": row.question,
        "created_at": _iso(row.created_at), "feedback": row.feedback,
    }]
    if row.answer_status:
        turns.append({
            "id": f"{row.id}:answer", "role": "user", "phase": row.phase,
            "text": row.answer or "", "created_at": _iso(row.updated_at),
            "answer_status": row.answer_status, "score": row.score,
            "strengths": row.strengths or [], "improvements": row.improvements or [],
        })
    return turns


def _session_dict(session: Session, row: IMSession) -> dict:
    rows = session.scalars(select(IMTurn).where(
        IMTurn.session_id == row.id, IMTurn.owner_id == row.owner_id
    ).order_by(IMTurn.question_index)).all()
    turns = [item for turn in rows for item in _turn_dict(turn)]
    current_turn = next((turn for turn in rows if turn.id == row.current_turn_id), None)
    last_feedback = ""
    if current_turn and current_turn.question_index > 1:
        previous = next((turn for turn in rows if turn.question_index == current_turn.question_index - 1), None)
        if previous:
            last_feedback = previous.feedback
    return {
        "id": row.id, "job_title": row.job_title, "seniority": row.seniority,
        "interview_type": row.interview_type, "question_limit": row.question_limit,
        "asked_count": row.asked_count, "resume_id": row.resume_id, "status": row.status,
        "phase": row.phase, "turns": turns,
        "current_question": (
            {"text": current_turn.question, "phase": current_turn.phase,
             "index": current_turn.question_index} if current_turn and row.status == "in_progress" else None
        ),
        "current_turn_id": row.current_turn_id if current_turn and row.status == "in_progress" else None,
        "latest_feedback": last_feedback,
        "question_deadline_at": _iso(row.question_deadline_at),
        "report_error_code": row.report_error_code, "report": row.report_json,
        "created_at": _iso(row.created_at), "updated_at": _iso(row.updated_at),
    }


def _phase_for_question(index: int, question_limit: int) -> str:
    if index == 1:
        return "introduction"
    foundation_quota = (question_limit - 1 + 1) // 2
    return "foundation" if index <= 1 + foundation_quota else "deep_dive"


def _transcript(session: Session, row: IMSession) -> list[dict]:
    turns = session.scalars(select(IMTurn).where(
        IMTurn.session_id == row.id, IMTurn.owner_id == row.owner_id
    ).order_by(IMTurn.question_index)).all()
    return [{
        "question_index": turn.question_index,
        "phase": turn.phase,
        "question": turn.question,
        "answer": turn.answer,
        "answer_status": turn.answer_status,
    } for turn in turns]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _sse_error(error: AppError) -> StreamingResponse:
    response = StreamingResponse(
        iter([_sse("error", {"code": error.code})]),
        media_type="text/event-stream",
    )
    response.headers["Cache-Control"] = "no-cache, no-store"
    response.headers["X-Accel-Buffering"] = "no"
    return response


def _sse_complete(session: Session, row: IMSession, message: str = "") -> StreamingResponse:
    payload = {"session": _session_dict(session, row), "status": row.status, "report": row.report_json}
    frames = []
    if message:
        frames.append(_sse("delta", {"text": message}))
    frames.append(_sse("complete", payload))
    response = StreamingResponse(iter(frames), media_type="text/event-stream")
    response.headers["Cache-Control"] = "no-cache, no-store"
    response.headers["X-Accel-Buffering"] = "no"
    return response


def _extract_resume(data: bytes, filename: str) -> tuple[str, str]:
    if len(data) > MAX_FILE_BYTES:
        raise Unprocessable("INTERVIEW_FILE_TOO_LARGE")
    lower = filename.lower()
    try:
        if lower.endswith(".pdf") and data.startswith(b"%PDF-"):
            from pypdf import PdfReader

            reader = PdfReader(BytesIO(data), strict=True)
            if reader.is_encrypted:
                raise ValueError("encrypted")
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            mime = "application/pdf"
        elif lower.endswith(".docx") and data.startswith(b"PK"):
            with zipfile.ZipFile(BytesIO(data)) as archive:
                if "word/document.xml" not in archive.namelist():
                    raise ValueError("missing document")
                document = ElementTree.fromstring(archive.read("word/document.xml"))
            namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
            text = "\n".join(
                "".join(node.text or "" for node in paragraph.iter(f"{namespace}t"))
                for paragraph in document.iter(f"{namespace}p")
            )
            mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        else:
            raise ValueError("unsupported")
    except Unprocessable:
        raise
    except Exception as exc:
        raise Unprocessable("INTERVIEW_INVALID_FILE") from exc
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        raise Unprocessable("INTERVIEW_INVALID_FILE")
    if len(text) > MAX_TEXT_LENGTH:
        raise Unprocessable("INTERVIEW_TEXT_TOO_LONG")
    return text, mime


@router.get("/capabilities")
def capabilities(user=Depends(require_student)):
    from ..interview_ai import interview_ai_configured
    return {"ai_available": interview_ai_configured()}


@router.get("/overview")
def overview(
    user=Depends(require_student),
    session: Session = Depends(get_session),
    limit: int = Query(default=50, ge=1, le=50),
):
    owner_id = user["id"]
    resumes = session.scalars(select(IMResume).where(
        IMResume.owner_id == owner_id).order_by(IMResume.created_at.desc()).limit(limit)).all()
    assessments = session.scalars(select(IMAssessment).where(
        IMAssessment.owner_id == owner_id).order_by(IMAssessment.created_at.desc()).limit(limit)).all()
    sessions = session.scalars(select(IMSession).where(
        IMSession.owner_id == owner_id).order_by(IMSession.created_at.desc()).limit(limit)).all()
    reviews = session.scalars(select(IMReviewItem).where(
        IMReviewItem.owner_id == owner_id).order_by(IMReviewItem.created_at.desc()).limit(limit)).all()
    return {
        "resumes": [_resume_dict(row) for row in resumes],
        "assessments": [_assessment_dict(row) for row in assessments],
        "sessions": [_session_dict(session, row) for row in sessions],
        "reviews": [_review_dict(row) for row in reviews],
    }


@router.get("/resumes")
def list_resumes(
    user=Depends(require_student),
    session: Session = Depends(get_session),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    rows = session.scalars(select(IMResume).where(
        IMResume.owner_id == user["id"]).order_by(IMResume.created_at.desc()).offset(offset).limit(limit)).all()
    return [_resume_dict(row) for row in rows]


@router.post("/resumes", status_code=201)
def create_resume(payload: ResumeCreate, user=Depends(require_student), session: Session = Depends(get_session)):
    row = IMResume(id=str(uuid4()), owner_id=user["id"], **payload.model_dump())
    session.add(row)
    session.commit()
    session.refresh(row)
    return _resume_dict(row, include_text=True)


@router.post("/resumes/parse")
async def parse_resume(file: UploadFile = File(...), user=Depends(require_student)):
    del user
    data = await file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise Unprocessable("INTERVIEW_FILE_TOO_LARGE")
    text, mime = _extract_resume(data, file.filename or "")
    return {"text": text, "source_filename": file.filename, "source_mime": mime, "source_size_bytes": len(data)}


@router.get("/resumes/{resume_id}")
def get_resume(resume_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    return _resume_dict(_owned_resume(session, resume_id, user["id"]), include_text=True)


@router.put("/resumes/{resume_id}")
def update_resume(
    resume_id: str,
    payload: ResumeUpdate,
    user=Depends(require_student),
    session: Session = Depends(get_session),
):
    row = _owned_resume(session, resume_id, user["id"], lock=True)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    row.updated_at = utc_now()
    session.commit()
    session.refresh(row)
    return _resume_dict(row, include_text=True)


@router.delete("/resumes/{resume_id}", status_code=204)
def delete_resume(resume_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    row = _owned_resume(session, resume_id, user["id"], lock=True)
    session.execute(delete(IMAssessment).where(
        IMAssessment.resume_id == row.id, IMAssessment.owner_id == user["id"]))
    session.execute(
        IMSession.__table__.update().where(
            IMSession.resume_id == row.id, IMSession.owner_id == user["id"]
        ).values(resume_id=None)
    )
    session.delete(row)
    session.commit()
    return None


@router.get("/assessments")
def list_assessments(
    user=Depends(require_student),
    session: Session = Depends(get_session),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    rows = session.scalars(select(IMAssessment).where(
        IMAssessment.owner_id == user["id"]).order_by(IMAssessment.created_at.desc()).offset(offset).limit(limit)).all()
    return [_assessment_dict(row) for row in rows]


@router.get("/assessments/{assessment_id}")
def get_assessment(assessment_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    return _assessment_dict(_owned_assessment(session, assessment_id, user["id"]))


@router.delete("/assessments/{assessment_id}", status_code=204)
def delete_assessment(assessment_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    row = _owned_assessment(session, assessment_id, user["id"])
    session.delete(row)
    session.commit()
    return None


@router.post("/resumes/{resume_id}/assessments", status_code=201)
def create_assessment(
    resume_id: str,
    payload: AssessmentCreate,
    user=Depends(require_student),
    session: Session = Depends(get_session),
    ai: InterviewAI = Depends(get_interview_ai),
):
    resume = _owned_resume(session, resume_id, user["id"])
    job_title = payload.job_title.strip() or resume.job_title
    seniority = payload.seniority or resume.seniority
    try:
        report = ai.generate(ResumeAssessmentOutput, RESUME_SYSTEM, {
            "locale": payload.locale,
            "job_title": job_title,
            "seniority": seniority,
            "job_description": resume.job_description[:5000],
            "resume_text": resume.text[:MAX_TEXT_LENGTH],
        })
    except InterviewAIError:
        session.rollback()
        raise
    for recommendation in report.recommendations:
        if recommendation.priority not in {"high", "medium", "low"}:
            raise Unprocessable("INTERVIEW_AI_INVALID_RESPONSE")
    row = IMAssessment(
        id=str(uuid4()), owner_id=user["id"], resume_id=resume.id,
        job_title=job_title, seniority=seniority,
        report_json=report.model_dump(mode="json"),
        model=settings.openrouter_model,
        consent_at=utc_now(),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _assessment_dict(row)


@router.get("/sessions")
def list_sessions(
    user=Depends(require_student),
    session: Session = Depends(get_session),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    rows = session.scalars(select(IMSession).where(
        IMSession.owner_id == user["id"]).order_by(IMSession.created_at.desc()).offset(offset).limit(limit)).all()
    return [_session_dict(session, row) for row in rows]


@router.post("/sessions", status_code=201)
def create_session(payload: InterviewCreate, user=Depends(require_student), session: Session = Depends(get_session)):
    if payload.resume_id:
        _owned_resume(session, payload.resume_id, user["id"])
    now = utc_now()
    row = IMSession(
        id=str(uuid4()), owner_id=user["id"], job_title=payload.job_title,
        seniority=payload.seniority, interview_type=payload.interview_type,
        status="in_progress", phase="introduction", question_limit=payload.question_limit,
        asked_count=0, resume_id=payload.resume_id, privacy_consent_at=now,
        privacy_policy_version=POLICY_VERSION, created_at=now, updated_at=now,
    )
    turn = IMTurn(
        id=str(uuid4()), owner_id=user["id"], session_id=row.id,
        question_index=1, phase="introduction",
        question="Please give a brief self-introduction." if payload.locale == "en" else "请做一段简短的自我介绍。",
        strengths=[], improvements=[], evidence=[], created_at=now, updated_at=now,
    )
    row.current_turn_id = turn.id
    session.add_all([row, turn])
    session.commit()
    session.refresh(row)
    return _session_dict(session, row)


@router.get("/sessions/{session_id}")
def get_session_record(session_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    return _session_dict(session, _owned_session(session, session_id, user["id"]))


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session_record(session_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    row = _owned_session(session, session_id, user["id"], lock=True)
    turn_ids = session.scalars(select(IMTurn.id).where(
        IMTurn.session_id == row.id, IMTurn.owner_id == user["id"])).all()
    if turn_ids:
        session.execute(delete(IMReviewItem).where(
            IMReviewItem.owner_id == user["id"],
            IMReviewItem.source_type == "mock_interview",
            IMReviewItem.source_id.in_(turn_ids),
        ))
    session.delete(row)
    session.commit()
    return None


@router.post("/sessions/{session_id}/turns/{turn_id}/start")
def start_turn(
    session_id: str,
    turn_id: str,
    user=Depends(require_student),
    session: Session = Depends(get_session),
):
    row = _owned_session(session, session_id, user["id"], lock=True)
    if row.status != "in_progress" or row.current_turn_id != turn_id:
        raise Conflict("INTERVIEW_SESSION_STATE_INVALID")
    turn = session.scalar(select(IMTurn).where(
        IMTurn.id == turn_id, IMTurn.session_id == row.id,
        IMTurn.owner_id == user["id"]).with_for_update())
    if turn is None:
        raise NotFound("INTERVIEW_RESOURCE_NOT_FOUND")
    if turn.question_confirmed_at is None:
        turn.question_confirmed_at = utc_now()
        row.asked_count += 1
        row.question_deadline_at = turn.question_confirmed_at + timedelta(seconds=300)
        row.updated_at = utc_now()
        session.commit()
    return {
        "turn_id": turn.id, "status": row.status,
        "question_deadline_at": _iso(row.question_deadline_at),
    }


def _build_report_context(session: Session, row: IMSession, locale: str) -> dict:
    resume = session.get(IMResume, row.resume_id) if row.resume_id else None
    return {
        "locale": locale,
        "job_title": row.job_title,
        "seniority": row.seniority,
        "interview_type": row.interview_type,
        "resume_text": resume.text[:8000] if resume else None,
        "turns": _transcript(session, row),
    }


def _save_report(
    session: Session,
    row: IMSession,
    owner_id: str,
    report: InterviewReportOutput,
    model: str,
) -> None:
    turns = session.scalars(select(IMTurn).where(
        IMTurn.session_id == row.id, IMTurn.owner_id == owner_id
    ).order_by(IMTurn.question_index)).all()
    answered = {turn.question_index: turn for turn in turns if turn.answer_status == "answered"}
    reviews = {item.question_index: item for item in report.turn_reviews}
    if set(reviews) != set(answered):
        raise InterviewAIError("INTERVIEW_AI_INVALID_RESPONSE")
    for index, result in reviews.items():
        turn = answered[index]
        turn.score = result.score
        turn.strengths = result.strengths
        turn.improvements = result.improvements
        turn.evidence = result.evidence
        turn.review_recommended = result.review_recommended
        if turn.phase != "introduction" and (result.score < 60 or result.review_recommended):
            existing = session.scalar(select(IMReviewItem).where(
                IMReviewItem.owner_id == owner_id,
                IMReviewItem.source_type == "mock_interview",
                IMReviewItem.source_id == turn.id,
            ).with_for_update())
            framework = "\n".join(result.improvements)
            if existing:
                existing.question = turn.question
                existing.last_answer = turn.answer or ""
                existing.last_score = result.score
                existing.last_feedback = {
                    "strengths": result.strengths, "improvements": result.improvements,
                }
                existing.answer_framework = framework
                existing.updated_at = utc_now()
            else:
                session.add(IMReviewItem(
                    id=str(uuid4()), owner_id=owner_id,
                    source_type="mock_interview", source_id=turn.id,
                    question=turn.question, category=(
                        "project_deep_dive" if turn.phase == "deep_dive" else "technical"
                    ), tags=[], answer_framework=framework,
                    last_answer=turn.answer or "", last_score=result.score,
                    last_feedback={"strengths": result.strengths, "improvements": result.improvements},
                    mastery_status="pending", created_at=utc_now(), updated_at=utc_now(),
                ))
    available = [dimension.score for dimension in report.dimensions.values() if dimension.score is not None]
    overall = round(sum(available) / len(available)) if available else None
    report_json = report.model_dump(mode="json")
    report_json["overall_score"] = overall
    report_json["created_at"] = _iso(utc_now())
    row.report_json = report_json
    row.status = "completed"
    row.phase = "completed"
    row.model = model
    row.report_error_code = None
    row.generation_request_id = None
    row.question_deadline_at = None
    row.current_turn_id = None
    row.updated_at = utc_now()


def _make_next_question(
    session: Session,
    row: IMSession,
    owner_id: str,
    current: IMTurn,
    feedback: str,
    question: str,
    model: str,
) -> IMSession:
    current.feedback = feedback
    next_index = current.question_index + 1
    phase = _phase_for_question(next_index, row.question_limit)
    next_turn = IMTurn(
        id=str(uuid4()), owner_id=owner_id, session_id=row.id,
        question_index=next_index, phase=phase, question=question,
        strengths=[], improvements=[], evidence=[], created_at=utc_now(), updated_at=utc_now(),
    )
    session.add(next_turn)
    row.phase = phase
    row.current_turn_id = next_turn.id
    row.question_deadline_at = None
    row.generation_request_id = None
    row.model = model
    row.updated_at = utc_now()
    return row


def _record_generation_failure(session: Session, row_id: str, owner_id: str, request_id: str, code: str, final: bool) -> None:
    locked = session.scalar(select(IMSession).where(
        IMSession.id == row_id, IMSession.owner_id == owner_id).with_for_update())
    if locked and locked.generation_request_id == request_id:
        locked.generation_request_id = None
        locked.updated_at = utc_now()
        if final:
            locked.status = "abandoned"
            locked.report_error_code = code
            locked.current_turn_id = None
            locked.question_deadline_at = None
        session.commit()
    else:
        session.rollback()


@router.post("/sessions/{session_id}/turns")
def submit_turn(
    session_id: str,
    payload: AnswerSubmit,
    user=Depends(require_student),
    session: Session = Depends(get_session),
    ai: InterviewAI = Depends(get_interview_ai),
):
    owner_id = user["id"]
    row = _owned_session(session, session_id, owner_id, lock=True)
    if row.status != "in_progress" or row.current_turn_id != payload.turn_id:
        raise Conflict("INTERVIEW_SESSION_STATE_INVALID")
    if row.generation_request_id:
        if row.generation_request_id == payload.client_request_id:
            raise Conflict("INTERVIEW_GENERATION_IN_PROGRESS")
        raise Conflict("INTERVIEW_GENERATION_IN_PROGRESS")
    current = session.scalar(select(IMTurn).where(
        IMTurn.id == payload.turn_id, IMTurn.session_id == row.id,
        IMTurn.owner_id == owner_id).with_for_update())
    if current is None or current.question_confirmed_at is None:
        raise Conflict("INTERVIEW_SESSION_STATE_INVALID")
    duplicate = session.scalar(select(IMTurn).where(
        IMTurn.session_id == row.id, IMTurn.request_id == payload.client_request_id))
    if duplicate and duplicate.answer_status:
        return _sse_complete(session, row)
    if current.answer_status:
        if payload.answer and current.answer and payload.answer != current.answer:
            raise Conflict("INTERVIEW_SESSION_STATE_INVALID")
        if current.answer_status == "answered" and payload.answer and not current.answer:
            raise Conflict("INTERVIEW_SESSION_STATE_INVALID")
    else:
        now = utc_now()
        expired = row.question_deadline_at is None or now >= row.question_deadline_at
        answer = payload.answer if not expired or payload.finish_reason == "timeout" else None
        current.answer = answer
        current.answer_status = "answered" if answer else "skipped"
        current.request_id = payload.client_request_id
        current.updated_at = now
    current.request_id = payload.client_request_id
    row.generation_request_id = payload.client_request_id
    row.updated_at = utc_now()
    final = row.asked_count >= row.question_limit
    session.commit()

    locale = payload.locale
    try:
        if final:
            generated = ai.generate(
                InterviewReportOutput, REPORT_SYSTEM,
                _build_report_context(session, row, locale),
            )
            _save_report(session, row, owner_id, generated, settings.openrouter_model)
            session.commit()
            session.refresh(row)
            return _sse_complete(session, row, "Interview review generated.")
        next_index = current.question_index + 1
        desired_phase = _phase_for_question(next_index, row.question_limit)
        context = _build_report_context(session, row, locale)
        context.update({"next_phase": desired_phase, "current_question_index": current.question_index})
        generated_question = ai.generate(NextQuestionOutput, NEXT_QUESTION_SYSTEM, context)
        row = _owned_session(session, session_id, owner_id, lock=True)
        if row.generation_request_id != payload.client_request_id:
            raise Conflict("INTERVIEW_SESSION_STATE_INVALID")
        current = session.get(IMTurn, payload.turn_id)
        if current is None:
            raise NotFound("INTERVIEW_RESOURCE_NOT_FOUND")
        _make_next_question(
            session, row, owner_id, current, generated_question.feedback,
            generated_question.question, settings.openrouter_model,
        )
        session.commit()
        session.refresh(row)
        return _sse_complete(session, row, generated_question.question)
    except AppError as exc:
        _record_generation_failure(session, row.id, owner_id, payload.client_request_id, exc.code, final)
        if final:
            session.refresh(row)
        return _sse_error(exc)


@router.post("/sessions/{session_id}/end")
def end_session(
    session_id: str,
    payload: EndSession,
    user=Depends(require_student),
    session: Session = Depends(get_session),
    ai: InterviewAI = Depends(get_interview_ai),
):
    owner_id = user["id"]
    row = _owned_session(session, session_id, owner_id, lock=True)
    if row.status == "completed":
        return _session_dict(session, row)
    if row.status == "abandoned":
        if row.report_error_code:
            raise Conflict(row.report_error_code)
        return _session_dict(session, row)
    if row.generation_request_id:
        raise Conflict("INTERVIEW_GENERATION_IN_PROGRESS")
    if row.end_request_id == payload.client_request_id:
        return _session_dict(session, row)
    row.end_request_id = payload.client_request_id
    row.generation_request_id = payload.client_request_id
    row.updated_at = utc_now()
    valid_answer = session.scalar(select(IMTurn.id).where(
        IMTurn.session_id == row.id, IMTurn.owner_id == owner_id,
        IMTurn.answer_status == "answered").limit(1)) is not None
    if not valid_answer:
        row.status = "abandoned"
        row.current_turn_id = None
        row.question_deadline_at = None
        row.generation_request_id = None
        session.commit()
        return _session_dict(session, row)
    session.commit()
    locale = payload.locale
    try:
        generated = ai.generate(
            InterviewReportOutput, REPORT_SYSTEM,
            _build_report_context(session, row, locale),
        )
        _save_report(session, row, owner_id, generated, settings.openrouter_model)
        session.commit()
        session.refresh(row)
        return _session_dict(session, row)
    except AppError as exc:
        _record_generation_failure(session, row.id, owner_id, payload.client_request_id, exc.code, True)
        raise


@router.get("/review-items")
def list_review_items(
    user=Depends(require_student),
    session: Session = Depends(get_session),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    rows = session.scalars(select(IMReviewItem).where(
        IMReviewItem.owner_id == user["id"]).order_by(
            IMReviewItem.created_at.desc()).offset(offset).limit(limit)).all()
    return [_review_dict(row) for row in rows]


@router.post("/review-items", status_code=201)
def create_review_item(payload: ReviewCreate, user=Depends(require_student), session: Session = Depends(get_session)):
    row = IMReviewItem(
        id=str(uuid4()), owner_id=user["id"], source_type="manual", source_id=None,
        question=payload.question, category=payload.category, tags=payload.tags,
        answer_framework=payload.answer_framework, last_answer="", last_feedback={},
        mastery_status="pending", created_at=utc_now(), updated_at=utc_now(),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _review_dict(row)


@router.patch("/review-items/{review_id}")
def update_review_item(
    review_id: str,
    payload: ReviewUpdate,
    user=Depends(require_student),
    session: Session = Depends(get_session),
):
    row = _owned_review(session, review_id, user["id"], lock=True)
    row.mastery_status = payload.mastery_status
    row.updated_at = utc_now()
    session.commit()
    session.refresh(row)
    return _review_dict(row)


@router.delete("/review-items/{review_id}", status_code=204)
def delete_review_item(review_id: str, user=Depends(require_student), session: Session = Depends(get_session)):
    row = _owned_review(session, review_id, user["id"])
    session.delete(row)
    session.commit()
    return None


@router.post("/review-items/{review_id}/retry")
def retry_review_item(
    review_id: str,
    payload: ReviewRetry,
    user=Depends(require_student),
    session: Session = Depends(get_session),
    ai: InterviewAI = Depends(get_interview_ai),
):
    row = _owned_review(session, review_id, user["id"], lock=True)
    result = ai.generate(ReviewOutput, REVIEW_SYSTEM, {
        "locale": payload.locale, "question": row.question,
        "answer_framework": row.answer_framework, "answer": payload.answer,
    })
    row.last_answer = payload.answer
    row.last_score = result.score
    row.last_feedback = {
        "strengths": result.strengths,
        "improvements": result.improvements,
        "mastery_suggested": result.mastery_suggested,
    }
    row.last_practiced_at = utc_now()
    row.updated_at = utc_now()
    session.commit()
    session.refresh(row)
    return _review_dict(row)


@router.delete("/data", status_code=204)
def clear_all_data(user=Depends(require_student), session: Session = Depends(get_session)):
    owner_id = user["id"]
    session.execute(delete(IMReviewItem).where(IMReviewItem.owner_id == owner_id))
    session.execute(delete(IMSession).where(IMSession.owner_id == owner_id))
    session.execute(delete(IMAssessment).where(IMAssessment.owner_id == owner_id))
    session.execute(delete(IMResume).where(IMResume.owner_id == owner_id))
    session.commit()
    return None
