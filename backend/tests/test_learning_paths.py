"""Real SQLAlchemy round trips against disposable SQLite, never shared MySQL."""
from datetime import datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Base, Course, LearningPathTask, LearningPathVersion, Profile


@pytest.fixture
def path_db(repo):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def setup(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")
    # Only the tables under test; legacy MySQL defaults need not compile on SQLite.
    tables = [Profile.__table__, Course.__table__]
    from app.models import LearningPath
    tables += [LearningPath.__table__, LearningPathVersion.__table__, LearningPathTask.__table__]
    # Existing tables have MySQL CURRENT_TIMESTAMP(6) defaults.
    from sqlalchemy.schema import CreateTable
    with engine.begin() as connection:
        for table in tables:
            sql = str(CreateTable(table).compile(engine)).replace("CURRENT_TIMESTAMP(6)", "CURRENT_TIMESTAMP")
            connection.exec_driver_sql(sql)
    with Session(engine) as session:
        for row in repo.profiles.values():
            session.add(Profile(**{**row, "created_at": datetime(2026, 10, 1)}))
        session.commit()
        for row in repo.courses.values():
            session.add(Course(**row, created_at=datetime(2026, 10, 1)))
        session.commit()
    def sessions():
        with Session(engine) as session:
            yield session
    app.dependency_overrides[get_session] = sessions
    yield engine
    app.dependency_overrides.pop(get_session, None)
    engine.dispose()


def goal(**extra):
    return {"topic": "Software engineering", "goal": "Write requirements", "level": "beginner",
            "budget_minutes": 600, "course_id": "c1", **extra}


def test_create_reload_isolation_and_roles(path_db, login, client):
    student = login("u_s1")
    created = student.post("/learning-paths", json=goal())
    assert created.status_code == 201
    row = created.json()
    assert row["status"] == "draft" and row["tasks"] == []
    assert student.get(f'/learning-paths/{row["id"]}').json()["goal"] == "Write requirements"
    assert len(student.get("/me/learning-paths").json()) == 1
    assert login("u_s2").get("/me/learning-paths").json() == []
    assert login("u_s2").get(f'/learning-paths/{row["id"]}').status_code == 404
    assert login("u_t1").post("/learning-paths", json=goal()).status_code == 403
    assert client.get("/me/learning-paths").status_code == 401


@pytest.mark.parametrize("patch", [{"topic": "  "}, {"budget_minutes": 61}, {"level": "expert"},
                                    {"student_id": "u_s2"}, {"course_id": "missing"}])
def test_invalid_input(path_db, login, patch):
    assert login("u_s1").post("/learning-paths", json=goal(**patch)).status_code == 422


def ready_plan(engine, student):
    row = student.post("/learning-paths", json=goal()).json()
    with Session(engine) as session:
        version = session.get(LearningPathVersion, row["version_id"])
        version.status = "ready"
        session.add(LearningPathTask(id="task1", version_id=version.id, position=0,
                                    stage="Foundation", title="Read", instructions="Read requirements",
                                    minutes=30, done=False))
        session.commit()
    return row


def test_task_idempotency_undo_and_ownership(path_db, login):
    student = login("u_s1")
    row = ready_plan(path_db, student)
    url = f'/learning-paths/{row["id"]}/tasks/task1'
    first = student.patch(url, json={"done": True}).json()
    assert first["progress"] == 100 and first["next_task_id"] is None
    second = student.patch(url, json={"done": True}).json()
    assert first["tasks"][0]["completed_at"] == second["tasks"][0]["completed_at"]
    assert login("u_s2").patch(url, json={"done": False}).status_code == 404
    undone = student.patch(url, json={"done": False}).json()
    assert undone["progress"] == 0 and undone["next_task_id"] == "task1"
    assert undone["tasks"][0]["completed_at"] is None
    other = student.post("/learning-paths", json=goal()).json()
    assert student.patch(f'/learning-paths/{other["id"]}/tasks/task1', json={"done": True}).status_code == 404


def test_revisions_keep_ready_current_and_history_read_only(path_db, login):
    student = login("u_s1")
    row = ready_plan(path_db, student)
    revision = student.post(f'/learning-paths/{row["id"]}/versions', json=goal(goal="New goal")).json()
    assert revision["version"] == 2
    assert revision["current_version_id"] == row["version_id"]
    assert student.get(f'/learning-paths/{row["id"]}').json()["goal"] == "Write requirements"
    assert len(student.get(f'/learning-paths/{row["id"]}/versions').json()) == 2
    with Session(path_db) as session:
        from app.models import LearningPath
        session.get(LearningPath, row["id"]).current_version_id = revision["version_id"]
        session.get(LearningPathVersion, revision["version_id"]).status = "ready"
        session.commit()
    assert student.patch(f'/learning-paths/{row["id"]}/tasks/task1', json={"done": True}).status_code == 409


def test_missing_ai_is_explicit_and_does_not_fake_generation(path_db, login):
    student = login("u_s1")
    row = student.post("/learning-paths", json=goal()).json()
    assert student.get("/learning-paths/capabilities").json()["generation_available"] is False
    response = student.post(f'/learning-paths/{row["id"]}/generate')
    assert response.status_code == 409 and response.json()["code"] == "AI_NOT_CONFIGURED"
    assert student.get(f'/learning-paths/{row["id"]}').json()["status"] == "draft"


def test_history_query_cannot_cross_plans_and_disabled_user_denied(path_db, login, repo):
    student = login("u_s1")
    one = student.post("/learning-paths", json=goal()).json()
    two = student.post("/learning-paths", json=goal(topic="Other")).json()
    assert student.get(f'/learning-paths/{one["id"]}?version_id={two["version_id"]}').status_code == 404
    repo.profiles["u_s1"]["status"] = "disabled"
    assert student.get("/me/learning-paths").status_code == 403


def test_draft_revisions_advance_and_course_must_be_published(path_db, login):
    student = login("u_s1")
    one = student.post("/learning-paths", json=goal()).json()
    revision = student.post(f'/learning-paths/{one["id"]}/versions', json=goal(topic="Revised")).json()
    assert revision["current_version_id"] == revision["version_id"]
    assert student.get(f'/learning-paths/{one["id"]}').json()["topic"] == "Revised"
    with Session(path_db) as session:
        session.get(Course, "c1").status = "draft"
        session.commit()
    assert student.post("/learning-paths", json=goal()).status_code == 422
