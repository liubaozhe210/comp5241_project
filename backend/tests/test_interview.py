import json
import re
import zipfile
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.deps import get_repo
from app.interview_ai import (
    DimensionOutput,
    InterviewAIError,
    InterviewReportOutput,
    NextQuestionOutput,
    Recommendation,
    ResumeAssessmentOutput,
    ReviewOutput,
    RiskFlag,
    TurnReviewOutput,
    get_interview_ai,
)
from app.main import app
from app.models import Base


class FakeInterviewAI:
    def generate(self, output_model, system, context):
        if output_model is ResumeAssessmentOutput:
            return ResumeAssessmentOutput(
                recommendations=[Recommendation(
                    section="Experience",
                    source_excerpt="Led project work",
                    issue="Add a specific contribution.",
                    rewrite_example="Describe your contribution and outcome.",
                    reason="Specific details make the work clear.",
                    priority="medium",
                )],
                risk_flags=[RiskFlag(
                    category="Evidence",
                    evidence="The impact is not quantified.",
                    suggestion="Add a verifiable result if available.",
                )],
            )
        if output_model is NextQuestionOutput:
            return NextQuestionOutput(feedback="Thanks for the context.", question="How did you validate the result?")
        if output_model is InterviewReportOutput:
            answered = [turn for turn in context["turns"] if turn["answer_status"] == "answered"]
            return InterviewReportOutput(
                overall_score=50,
                dimensions={
                    "communication": DimensionOutput(score=60, summary="Clear enough."),
                    "technical_depth": DimensionOutput(score=50, summary="Some detail."),
                    "problem_solving": DimensionOutput(score=40, summary="Needs more evidence."),
                    "job_fit": DimensionOutput(score=None, summary="Insufficient evidence."),
                },
                strengths=["Relevant experience."],
                improvements=["Explain your decision process."],
                unanswered_count=sum(turn["answer_status"] != "answered" for turn in context["turns"]),
                turn_reviews=[
                    TurnReviewOutput(
                        question_index=turn["question_index"],
                        score=50,
                        strengths=["Answered the question."],
                        improvements=["Add concrete evidence."],
                        evidence=["The submitted answer describes the approach."],
                        review_recommended=True,
                    )
                    for turn in answered
                ],
            )
        if output_model is ReviewOutput:
            return ReviewOutput(score=82, strengths=["Good structure."], improvements=["Add evidence."], mastery_suggested=True)
        raise AssertionError(f"Unexpected AI output model: {output_model}")


@pytest.fixture
def interview_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    @event.listens_for(engine, "before_cursor_execute", retval=True)
    def sqlite_mysql_timestamp_compatibility(connection, cursor, statement, parameters, context, executemany):
        del connection, cursor, context, executemany
        return statement.replace("CURRENT_TIMESTAMP(6)", "CURRENT_TIMESTAMP"), parameters

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)

    def override_session():
        db = factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_interview_ai] = FakeInterviewAI
    yield factory
    engine.dispose()


def _create_interview(client, login, owner="u_s1", limit=4):
    response = login(owner).post("/interview/sessions", json={
        "job_title": "Frontend Engineer",
        "seniority": "junior",
        "interview_type": "mixed",
        "question_limit": limit,
        "privacy_consent": True,
    })
    assert response.status_code == 201
    return response.json()


def _start_current(client, login, owner, session_data):
    turn_id = session_data["current_turn_id"]
    response = login(owner).post(
        f"/interview/sessions/{session_data['id']}/turns/{turn_id}/start",
        json={},
    )
    assert response.status_code == 200
    return turn_id, response.json()


def _submit(client, login, owner, session_data, turn_id, request_id):
    return login(owner).post(
        f"/interview/sessions/{session_data['id']}/turns",
        json={
            "turn_id": turn_id,
            "answer": "I measured the result and reviewed it with the team.",
            "finish_reason": "manual",
            "client_request_id": request_id,
        },
    )


def _complete_event(response):
    match = re.search(r"event: complete\ndata: (.+?)\n\n", response.text)
    assert match, response.text
    return json.loads(match.group(1))


def test_student_only_and_resume_assessment_is_persisted(client, login, interview_db):
    assert login("u_t1").get("/interview/overview").status_code == 403
    text = "Frontend engineer with five years of React experience. Built accessible products, mentored peers, and improved a production workflow."
    created = login("u_s1").post("/interview/resumes", json={
        "title": "Frontend resume",
        "text": text,
        "job_title": "Frontend Engineer",
        "seniority": "mid",
    })
    assert created.status_code == 201
    resume_id = created.json()["id"]

    assessment = login("u_s1").post(
        f"/interview/resumes/{resume_id}/assessments",
        json={"privacy_consent": True},
    )
    assert assessment.status_code == 201
    assert assessment.json()["report"]["recommendations"][0]["priority"] == "medium"
    assert "overall_score" not in assessment.json()["report"]

    listed = login("u_s1").get("/interview/resumes").json()
    assert len(listed) == 1
    assert "text" not in listed[0]
    assert login("u_s2").get(f"/interview/resumes/{resume_id}").status_code == 404


def test_session_timer_quota_sync_report_and_auto_review(client, login, interview_db):
    current = _create_interview(client, login)
    assert current["asked_count"] == 0
    assert current["current_question"]["phase"] == "introduction"

    intro_id, first_start = _start_current(client, login, "u_s1", current)
    repeated_start = login("u_s1").post(
        f"/interview/sessions/{current['id']}/turns/{intro_id}/start",
        json={},
    )
    assert repeated_start.json()["question_deadline_at"] == first_start["question_deadline_at"]

    intro_answer = _submit(client, login, "u_s1", current, intro_id, "request-1")
    assert intro_answer.status_code == 200
    first_complete = _complete_event(intro_answer)
    next_session = first_complete["session"]
    assert next_session["asked_count"] == 1
    assert next_session["current_question"]["phase"] == "foundation"
    assert next_session["latest_feedback"] == "Thanks for the context."

    foundation_id, _ = _start_current(client, login, "u_s1", next_session)
    second_answer = _submit(client, login, "u_s1", next_session, foundation_id, "request-2")
    assert second_answer.status_code == 200

    ended = login("u_s1").post(
        f"/interview/sessions/{current['id']}/end",
        json={"client_request_id": "end-1"},
    )
    assert ended.status_code == 200
    report = ended.json()
    assert report["status"] == "completed"
    assert report["report"]["overall_score"] == 50
    assert report["phase"] == "completed"
    assert len(login("u_s1").get("/interview/review-items").json()) == 1


def test_active_end_without_answer_abandons_without_saving_draft(client, login, interview_db):
    current = _create_interview(client, login)
    result = login("u_s1").post(
        f"/interview/sessions/{current['id']}/end",
        json={"client_request_id": "end-empty"},
    )
    assert result.status_code == 200
    assert result.json()["status"] == "abandoned"
    assert result.json()["report"] is None


def test_timeout_submission_preserves_answer_text(client, login, interview_db):
    current = _create_interview(client, login)
    turn_id, _ = _start_current(client, login, "u_s1", current)
    response = login("u_s1").post(
        f"/interview/sessions/{current['id']}/turns",
        json={
            "turn_id": turn_id,
            "answer": "The timer expired after I described the implementation.",
            "finish_reason": "timeout",
            "client_request_id": "timeout-answer",
        },
    )
    assert response.status_code == 200
    updated = _complete_event(response)["session"]
    submitted = [turn for turn in updated["turns"] if turn["role"] == "user"]
    assert submitted[0]["text"] == "The timer expired after I described the implementation."


def test_question_generation_failure_keeps_answer_retryable(client, login, interview_db):
    class FailOnceAI(FakeInterviewAI):
        should_fail = True

        def generate(self, output_model, system, context):
            if output_model is NextQuestionOutput and self.should_fail:
                self.should_fail = False
                raise InterviewAIError("INTERVIEW_AI_UNAVAILABLE")
            return super().generate(output_model, system, context)

    ai = FailOnceAI()
    app.dependency_overrides[get_interview_ai] = lambda: ai
    current = _create_interview(client, login)
    turn_id, _ = _start_current(client, login, "u_s1", current)
    first = _submit(client, login, "u_s1", current, turn_id, "failed-generation")
    assert first.status_code == 200
    assert "INTERVIEW_AI_UNAVAILABLE" in first.text

    saved = login("u_s1").get(f"/interview/sessions/{current['id']}").json()
    assert saved["current_turn_id"] == turn_id
    assert saved["current_question"]["text"] == current["current_question"]["text"]
    assert any(turn["role"] == "user" for turn in saved["turns"])

    retried = login("u_s1").post(
        f"/interview/sessions/{current['id']}/turns",
        json={
            "turn_id": turn_id,
            "answer": "I measured the result and reviewed it with the team.",
            "finish_reason": "manual",
            "client_request_id": "retry-generation",
        },
    )
    assert retried.status_code == 200
    next_session = _complete_event(retried)["session"]
    assert next_session["current_question"]["index"] == 2
    assert len([turn for turn in next_session["turns"] if turn["role"] == "user"]) == 1


def test_resume_parser_rejects_mismatched_files_and_extracts_docx(client, login, interview_db):
    xml = (
        b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        b'<w:body><w:p><w:r><w:t>Frontend engineer experience</w:t></w:r></w:p></w:body></w:document>'
    )
    document = BytesIO()
    with zipfile.ZipFile(document, "w") as archive:
        archive.writestr("word/document.xml", xml)
    parsed = login("u_s1").post(
        "/interview/resumes/parse",
        files={"file": ("resume.docx", document.getvalue(), "application/octet-stream")},
    )
    assert parsed.status_code == 200
    assert parsed.json()["text"] == "Frontend engineer experience"

    invalid = login("u_s1").post(
        "/interview/resumes/parse",
        files={"file": ("resume.pdf", b"not a PDF", "application/pdf")},
    )
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INTERVIEW_INVALID_FILE"
