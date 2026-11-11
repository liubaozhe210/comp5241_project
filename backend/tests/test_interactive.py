import copy
import io
import json

import httpx
import pytest
from pypdf import PdfWriter
from reportlab.pdfgen import canvas
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import settings
from app.errors import AppError
from app.interactive_schema import Content
from app.interactive_store import TABLES, InteractiveCourse, InteractiveProgress, InteractiveStore, get_interactive_store
from app.main import app
from app.pdf_generation import extract_pdf, generate_content


CONTENT = {
    "title": "Requirements workshop", "language": "en", "level": "beginner",
    "objectives": ["Write a measurable requirement"],
    "lessons": [{"title": "Requirements", "explanation": "A requirement states an observable outcome.",
                 "example": "The service responds within two seconds.", "source_pages": [1],
                 "quiz": {"question": "Which requirement can be tested?", "options": ["Fast", "Within two seconds"],
                          "answer": 1, "explanation": "Two seconds is measurable."}}],
    "scenario": {"prompt": "Write an acceptance criterion for a search service.",
                 "example_answer": "A search returns results within two seconds under normal load.",
                 "rubric": [{"label": "Measurable time", "keywords": ["seconds", "秒"]}]},
}


def pdf_bytes():
    stream = io.BytesIO()
    pdf = canvas.Canvas(stream)
    pdf.drawString(40, 750, "Software requirements define observable outcomes that stakeholders can test.")
    pdf.drawString(40, 720, "Acceptance criteria include measurable response times, such as two seconds.")
    pdf.save()
    return stream.getvalue()


@pytest.fixture
def database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'interactive.db'}", connect_args={"check_same_thread": False})
    for table in TABLES:
        table.create(engine)
    def store():
        with Session(engine, expire_on_commit=False) as session:
            yield InteractiveStore(session)
    app.dependency_overrides[get_interactive_store] = store
    yield engine
    engine.dispose()


@pytest.fixture
def setup_course(database, repo, monkeypatch, login):
    from app.routers import interactive
    monkeypatch.setattr(interactive, "generate_content", lambda *args: Content.model_validate(CONTENT))
    repo.enrollments["approved"] = {"id": "approved", "course_id": "c1", "student_id": "u_s1", "status": "approved"}
    teacher = login("u_t1")
    response = teacher.post("/courses/c1/interactive", files={"file": ("lesson.pdf", pdf_bytes(), "application/pdf")})
    assert response.status_code == 201, response.text
    return teacher, response.json(), login("u_s1")


def publish(teacher, course):
    r = teacher.post(f"/interactive/{course['id']}/publish", json={"version": course["version"]})
    assert r.status_code == 200, r.text
    return r.json()


def test_pdf_extracts_actual_text_and_pages():
    pages = extract_pdf(pdf_bytes())
    assert pages[0]["page"] == 1
    assert "stakeholders" in pages[0]["text"]


@pytest.mark.parametrize("kind,code", [("bad", "NOT_A_PDF"), ("broken", "PDF_INVALID"), ("blank", "PDF_NO_TEXT"), ("encrypted", "PDF_ENCRYPTED"), ("pages", "PDF_TOO_MANY_PAGES")])
def test_reject_pdf(kind, code):
    writer = PdfWriter()
    for _ in range(101 if kind == "pages" else 1):
        writer.add_blank_page(width=100, height=100)
    if kind == "encrypted": writer.encrypt("password")
    stream = io.BytesIO(); writer.write(stream)
    data = b"wrong" if kind == "bad" else b"%PDF-broken" if kind == "broken" else stream.getvalue()
    with pytest.raises(AppError) as exc: extract_pdf(data)
    assert exc.value.code == code


def test_size_limit(monkeypatch):
    monkeypatch.setattr(settings, "max_pdf_bytes", 5)
    with pytest.raises(AppError, match="FILE_TOO_LARGE"): extract_pdf(pdf_bytes())


def test_draft_hidden_and_source_requires_membership(setup_course, login):
    teacher, course, student = setup_course
    url = f"/interactive/{course['id']}"
    assert student.get(url).status_code == 404
    assert student.get(url + "/source").status_code == 404
    assert teacher.get(url + "/source").content.startswith(b"%PDF-")
    publish(teacher, course)
    assert login("u_s2").get(url).status_code == 403
    assert login("u_s2").get(url + "/source").status_code == 403
    assert student.get(url + "/source").status_code == 200
    visible = student.get(url).json()["content"]
    assert "answer" not in visible["lessons"][0]["quiz"]
    assert "example_answer" not in visible["scenario"]
    assert "keywords" not in visible["scenario"]["rubric"][0]


def test_owner_student_and_archived_authorization(setup_course, login, repo):
    teacher, course, student = setup_course
    url = f"/interactive/{course['id']}"
    payload = {"version": course["version"], "content": CONTENT}
    assert login("u_t2").put(url, json=payload).status_code == 403
    assert student.put(url, json=payload).status_code == 403
    assert student.post("/courses/c1/interactive", files={"file": ("a.pdf", pdf_bytes())}).status_code == 403
    repo.courses["c1"]["status"] = "archived"
    assert teacher.put(url, json=payload).status_code == 422
    assert teacher.post(url + "/publish", json={"version": 1}).status_code == 422


def test_versioned_snapshot_and_stale_edits(setup_course):
    teacher, course, student = setup_course
    url = f"/interactive/{course['id']}"
    original = publish(teacher, course)
    changed = copy.deepcopy(CONTENT); changed["title"] = "Updated draft"
    saved = teacher.put(url, json={"version": original["version"], "content": changed})
    assert saved.status_code == 200
    assert student.get(url).json()["content"]["title"] == CONTENT["title"]
    assert teacher.put(url, json={"version": original["version"], "content": changed}).status_code == 409
    updated = publish(teacher, saved.json())
    assert updated["revision"] == 2
    assert publish(teacher, updated)["revision"] == 2
    assert student.get(url).json()["content"]["title"] == "Updated draft"
    assert student.get(url + "?revision=1").json()["content"]["title"] == CONTENT["title"]


def test_invalid_draft_source_and_answer(setup_course):
    teacher, course, _ = setup_course
    url = f"/interactive/{course['id']}"
    content = copy.deepcopy(CONTENT); content["lessons"][0]["source_pages"] = [999]
    assert teacher.put(url, json={"version": 1, "content": content}).status_code == 422
    content = copy.deepcopy(CONTENT); content["lessons"][0]["quiz"]["answer"] = 5
    assert teacher.put(url, json={"version": 1, "content": content}).status_code == 422


def test_server_grading_completion_and_persistence(setup_course, database, login, repo):
    teacher, course, student = setup_course
    course = publish(teacher, course); url = f"/interactive/{course['id']}"
    def act(kind, **kwargs): return student.post(url + "/activities", json={"revision": 1, "kind": kind, **kwargs})
    assert act("complete").json()["code"] == "QUIZ_REQUIRED"
    assert act("quiz", answer=0).json()["quizzes"]["0"]["correct"] is False
    assert act("quiz", answer=1).json()["quizzes"]["0"]["correct"] is True
    assert act("complete").json()["code"] == "SCENARIO_REQUIRED"
    assert act("scenario", response="short").status_code == 422
    assert act("scenario", response="Search returns the requested results within two seconds under normal load.").json()["scenario"]["checks"][0]["matched"]
    assert act("complete").json()["completed"] == [0]
    assert act("complete").json()["completed"] == [0]
    assert login("u_s1").get(url + "/progress?revision=1").json()["completed"] == [0]
    repo.enrollments["second"] = {"course_id": "c1", "student_id": "u_s2", "status": "approved"}
    assert login("u_s2").get(url + "/progress").json()["completed"] == []
    assert teacher.post(url + "/activities", json={"revision": 1, "kind": "quiz", "answer": 1}).status_code == 403
    with Session(database) as session:
        records = session.scalars(select(InteractiveProgress)).all()
        assert len(records) == 1 and records[0].user_id == "u_s1"
    changed = copy.deepcopy(CONTENT); changed["title"] += " v2"
    saved = teacher.put(url, json={"version": course["version"], "content": changed}).json()
    publish(teacher, saved)
    assert student.get(url + "/progress").json()["completed"] == []
    assert student.get(url + "/progress?revision=1").json()["completed"] == [0]
    repo.enrollments["approved"]["status"] = "dropped"
    assert student.get(url + "/progress").status_code == 403


def test_draft_parent_cannot_publish(setup_course, repo):
    teacher, course, _ = setup_course
    repo.courses["c1"]["status"] = "draft"
    assert teacher.post(f"/interactive/{course['id']}/publish", json={"version": 1}).json()["code"] == "COURSE_NOT_PUBLISHED"


def test_generation_failure_leaves_no_course(database, monkeypatch, login):
    from app.routers import interactive
    def fail(*args): raise AppError("COURSE_AI_TIMEOUT")
    monkeypatch.setattr(interactive, "generate_content", fail)
    response = login("u_t1").post("/courses/c1/interactive", files={"file": ("a.pdf", pdf_bytes())})
    assert response.json()["code"] == "COURSE_AI_TIMEOUT"
    with Session(database) as session: assert not session.scalars(select(InteractiveCourse)).all()


@pytest.mark.parametrize("mode", ["ok", "badjson", "badpage", "truncated", "http", "timeout"])
def test_provider_contract(monkeypatch, mode):
    monkeypatch.setattr(settings, "course_ai_base_url", "https://provider.example/v1")
    monkeypatch.setattr(settings, "course_ai_api_key", "test-secret")
    monkeypatch.setattr(settings, "course_ai_model", "configured-model")
    real_client = httpx.Client
    def handle(request):
        assert request.url.path == "/v1/chat/completions"
        body = json.loads(request.content)
        assert "stakeholders" in body["messages"][1]["content"]
        assert body["model"] == "configured-model"
        if mode == "http": return httpx.Response(401, text="sensitive upstream body")
        if mode == "timeout": raise httpx.ReadTimeout("timeout")
        content = copy.deepcopy(CONTENT)
        if mode == "badpage": content["lessons"][0]["source_pages"] = [999]
        return httpx.Response(200, json={"choices": [{"finish_reason": "length" if mode == "truncated" else "stop",
             "message": {"content": "invalid" if mode == "badjson" else json.dumps(content)}}]})
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handle), **kwargs))
    if mode == "ok":
        assert generate_content(extract_pdf(pdf_bytes()), "en", "beginner", "test", "both").title == CONTENT["title"]
    else:
        with pytest.raises(AppError) as exc: generate_content(extract_pdf(pdf_bytes()), "en", "beginner", "test", "both")
        assert "sensitive" not in str(exc.value)


def test_missing_provider_is_explicit(monkeypatch):
    monkeypatch.setattr(settings, "course_ai_api_key", "")
    with pytest.raises(AppError, match="COURSE_AI_NOT_CONFIGURED"):
        generate_content(extract_pdf(pdf_bytes()), "en", "beginner", "", "both")


def test_concurrent_teacher_and_student_writes_are_not_silently_lost(setup_course, database):
    teacher, course, _ = setup_course
    course = publish(teacher, course)
    from app.errors import Conflict
    with Session(database, expire_on_commit=False) as a, Session(database, expire_on_commit=False) as b:
        sa, sb = InteractiveStore(a), InteractiveStore(b)
        ra, rb = sa.get(course["id"]), sb.get(course["id"])
        stale_version = rb.version
        changed = copy.deepcopy(CONTENT); changed["title"] = "Concurrent edit"
        sa.save(ra, ra.version, changed)
        with pytest.raises(Conflict): sb.save(rb, stale_version, CONTENT)
        _, data = sa.progress(ra, "u_s1", 1)
        sa.save_progress(ra, "u_s1", 1, None, data)
        pa, da = sa.progress(ra, "u_s1", 1)
        pb, db = sb.progress(rb, "u_s1", 1)
        da["completed"] = [0]
        sa.save_progress(ra, "u_s1", 1, pa, da)
        with pytest.raises(Conflict): sb.save_progress(rb, "u_s1", 1, pb, db)


def test_mysql_schema_uses_longblob_for_pdf_and_composite_progress_key():
    from sqlalchemy.schema import CreateTable
    from sqlalchemy.dialects.mysql import dialect
    ddl = str(CreateTable(InteractiveCourse.__table__).compile(dialect=dialect()))
    assert "LONGBLOB" in ddl
    assert [c.name for c in InteractiveProgress.__table__.primary_key] == ["interactive_id", "revision", "user_id"]


@pytest.mark.parametrize("base", ["https://openrouter.ai/api/v1", "https://provider.example/v1"])
def test_openrouter_routes_only_to_json_capable_providers(monkeypatch, base):
    monkeypatch.setattr(settings, "course_ai_base_url", base)
    monkeypatch.setattr(settings, "course_ai_api_key", "test-only-secret")
    monkeypatch.setattr(settings, "course_ai_model", "openai/gpt-4o")
    real_client = httpx.Client
    def handle(request):
        payload = json.loads(request.content)
        assert request.headers["authorization"] == "Bearer test-only-secret"
        assert payload["response_format"] == {"type": "json_object"}
        assert payload["max_tokens"] == 3500
        if "openrouter.ai" in base:
            assert request.url.path == "/api/v1/chat/completions"
            assert payload["provider"] == {"require_parameters": True}
        else:
            assert "provider" not in payload
        return httpx.Response(200, json={"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(CONTENT)}}]})
    monkeypatch.setattr(httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(handle), **kw))
    assert generate_content(extract_pdf(pdf_bytes()), "en", "beginner", "", "both").title == CONTENT["title"]


@pytest.mark.parametrize("status,code", [(401, "COURSE_AI_KEY_INVALID"), (402, "COURSE_AI_CREDIT_LIMIT"), (429, "COURSE_AI_RATE_LIMIT"), (503, "COURSE_AI_UNAVAILABLE")])
def test_provider_errors_are_actionable_without_leaking_secrets(monkeypatch, status, code):
    monkeypatch.setattr(settings, "course_ai_base_url", "https://openrouter.ai/api/v1")
    monkeypatch.setattr(settings, "course_ai_api_key", "test-only-secret")
    monkeypatch.setattr(settings, "course_ai_model", "openai/gpt-4o")
    real_client = httpx.Client
    monkeypatch.setattr(httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(
        lambda request: httpx.Response(status, text="private upstream error test-only-secret")), **kw))
    with pytest.raises(AppError) as exc:
        generate_content(extract_pdf(pdf_bytes()), "en", "beginner", "", "both")
    assert exc.value.code == code
    assert "test-only-secret" not in json.dumps(exc.value.to_body())


def test_ai_smoke_script_reports_failure_without_upstream_body(monkeypatch, capsys):
    from scripts import check_course_ai
    def fail(*args): raise AppError("COURSE_AI_KEY_INVALID", message="private upstream error")
    monkeypatch.setattr(check_course_ai, "generate_content", fail)
    assert check_course_ai.main() == 1
    assert capsys.readouterr().out.strip() == "FAILED: COURSE_AI_KEY_INVALID"
