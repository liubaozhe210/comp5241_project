"""Real SQLAlchemy round trips against disposable SQLite, never shared MySQL."""
from datetime import datetime

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import get_session
from app.main import app
from app.models import Base, Course, LearningPathTask, LearningPathTaskSource, LearningPathVersion, Material, Profile


@pytest.fixture
def path_db(repo, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, 'ai_generation_enabled', False)
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def setup(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")
    # Only the tables under test; legacy MySQL defaults need not compile on SQLite.
    from app.models import Enrollment
    tables = [Profile.__table__, Course.__table__, Material.__table__, Enrollment.__table__]
    from app.models import LearningPath
    tables += [LearningPath.__table__, LearningPathVersion.__table__, LearningPathTask.__table__, LearningPathTaskSource.__table__]
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


@pytest.fixture
def path_materials(repo, monkeypatch):
    repo.materials['pm1'] = {'id': 'pm1', 'course_id': 'c1', 'title': 'Requirements PDF',
                              'pages': 2, 'size_bytes': 100, 'storage_path': 'c1/read.pdf', 'original_name': 'read.pdf'}
    repo.materials['pm2'] = {'id': 'pm2', 'course_id': 'c_full', 'title': 'Other course PDF',
                              'size_bytes': 100, 'storage_path': 'other.pdf'}
    monkeypatch.setattr(repo, 'download_object', lambda _: b'%PDF-test', raising=False)
    from app import material_reading
    monkeypatch.setattr(material_reading, 'extract_pdf', lambda _: {
        'fingerprint': 'test-hash', 'status': 'ready', 'page_count': 1,
        'pages': [{'number': 1, 'text': 'Requirements', 'truncated': False}]})
    return repo


def approve_reading(repo):
    repo.enrollments['e_read'] = {'course_id': 'c1', 'student_id': 'u_s1', 'status': 'approved'}


def test_path_resources_list_read_and_url_without_progress_changes(path_db, path_materials, login):
    repo = path_materials
    approve_reading(repo)
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    base = f'/learning-paths/{path["id"]}/resources'
    listed = student.get(base)
    assert listed.status_code == 200 and listed.json()['status'] == 'available'
    assert listed.headers['cache-control'] == 'private, no-store'
    assert [m['id'] for m in listed.json()['materials']] == ['pm1']
    assert 'storage_path' not in listed.text
    text = student.get(base + '/pm1/text')
    assert text.status_code == 200 and text.json()['pages'][0]['text'] == 'Requirements'
    url = student.get(base + '/pm1/url')
    assert url.status_code == 200 and url.json()['url'].startswith('http://testserver/materials/')
    after = student.get(f'/learning-paths/{path["id"]}').json()
    assert after['status'] == 'draft' and after['tasks'] == [] and after['progress'] == 0


@pytest.mark.parametrize('status', [None, 'pending', 'rejected', 'withdrawn', 'dropped'])
def test_path_resources_locked_without_leaking_metadata(path_db, path_materials, login, monkeypatch, status):
    if status:
        path_materials.enrollments['e_read'] = {'course_id': 'c1', 'student_id': 'u_s1', 'status': status}
    def unexpected(_):
        pytest.fail('Unauthorized request reached materials or storage')
    monkeypatch.setattr(path_materials, 'download_object', unexpected)
    monkeypatch.setattr(path_materials, 'list_materials', unexpected)
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    base = f'/learning-paths/{path["id"]}/resources'
    result = student.get(base).json()
    assert result['status'] == 'locked' and result['materials'] == []
    assert student.get(base + '/pm1/text').status_code == 403
    assert student.get(base + '/pm1/url').status_code == 403


def test_path_resources_scope_version_and_ownership(path_db, path_materials, login):
    approve_reading(path_materials)
    student = login('u_s1')
    one = student.post('/learning-paths', json=goal()).json()
    other = student.post('/learning-paths', json=goal(course_id=None)).json()
    base = f'/learning-paths/{one["id"]}/resources'
    assert student.get(base + '/pm2/text').status_code == 404
    assert student.get(base + '/pm2/url').status_code == 404
    assert student.get(base + '?version_id=' + other['version_id']).status_code == 404
    assert student.get(base + '/pm1/text?version_id=' + other['version_id']).status_code == 404
    assert login('u_s2').get(base).status_code == 404
    assert login('u_s2').get(base + '/pm1/text').status_code == 404
    assert login('u_t1').get(base).status_code == 403
    assert student.get(f'/learning-paths/{other["id"]}/resources').json()['status'] == 'no_course'


def test_resources_follow_selected_version_and_recheck_permissions(path_db, path_materials, login):
    approve_reading(path_materials)
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    base = f'/learning-paths/{path["id"]}/resources'
    new = student.post(f'/learning-paths/{path["id"]}/versions', json=goal(course_id=None)).json()
    assert student.get(base).json()['status'] == 'no_course'
    assert student.get(base + '?version_id=' + path['version_id']).json()['status'] == 'available'
    assert student.get(base + '/pm1/text?version_id=' + new['version_id']).status_code == 404
    path_materials.enrollments['e_read']['status'] = 'dropped'
    assert student.get(base + '?version_id=' + path['version_id']).json()['status'] == 'locked'
    assert student.get(base + '/pm1/url?version_id=' + path['version_id']).status_code == 403


def test_path_resources_empty_and_course_unavailable(path_db, path_materials, login):
    approve_reading(path_materials)
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    base = f'/learning-paths/{path["id"]}/resources'
    path_materials.materials.pop('pm1')
    assert student.get(base).json()['materials'] == []
    assert student.get(base + '/pm1/text').status_code == 404
    path_materials.courses['c1']['status'] = 'archived'
    assert student.get(base).json()['status'] == 'unavailable'


@pytest.fixture
def linked_task(path_db, path_materials, login, monkeypatch):
    approve_reading(path_materials)
    student = login('u_s1')
    path = ready_plan(path_db, student)
    from app import material_reading
    monkeypatch.setattr(material_reading, 'extract_pdf', lambda _: {
        'fingerprint': 'a' * 64, 'status': 'ready', 'page_count': 3,
        'pages': [{'number': n, 'text': f'Knowledge page {n}', 'truncated': False} for n in range(1, 4)]})
    with Session(path_db) as session:
        session.add(Material(id='pm1', course_id='c1', title='Requirements PDF', description='',
                             storage_path='c1/read.pdf', original_name='read.pdf', size_bytes=100,
                             uploader_id='u_t1', sort_order=0, created_at=datetime(2026, 10, 1)))
        session.flush()
        session.add(LearningPathTaskSource(task_id='task1', material_id='pm1', fingerprint='a' * 64,
                                           page_start=2, page_end=3))
        session.commit()
    return student, path


def test_task_study_targets_pages_and_manual_completion(path_db, linked_task):
    student, path = linked_task
    base = f'/learning-paths/{path["id"]}/tasks/task1'
    response = student.get(base + '/study')
    assert response.status_code == 200
    study = response.json()
    assert [p['number'] for p in study['reading']['pages']] == [2, 3]
    assert study['source_status'] == 'linked' and study['read_only'] is False and study['done'] is False
    assert student.get(base + '/study/url').status_code == 200
    assert student.get(f'/learning-paths/{path["id"]}').json()['progress'] == 0
    assert student.patch(base, json={'done': True}).json()['progress'] == 100
    assert student.get(base + '/study').json()['done'] is True
    assert student.patch(base, json={'done': False}).json()['progress'] == 0


def test_task_study_denies_cross_student_plan_and_revoked_access(path_db, linked_task, path_materials, login):
    student, path = linked_task
    base = f'/learning-paths/{path["id"]}/tasks/task1/study'
    assert login('u_s2').get(base).status_code == 404
    other = student.post('/learning-paths', json=goal()).json()
    assert student.get(f'/learning-paths/{other["id"]}/tasks/task1/study').status_code == 404
    path_materials.enrollments['e_read']['status'] = 'dropped'
    assert student.get(base).status_code == 403
    assert student.get(base + '/url').status_code == 403


def test_changed_source_and_deleted_material_do_not_silently_retarget(path_db, linked_task, path_materials, monkeypatch):
    student, path = linked_task
    base = f'/learning-paths/{path["id"]}/tasks/task1/study'
    from app import material_reading
    monkeypatch.setattr(material_reading, 'extract_pdf', lambda _: {'fingerprint': 'b' * 64})
    response = student.get(base)
    assert response.status_code == 409 and response.json()['code'] == 'LEARNING_PATH_SOURCE_CHANGED'
    assert student.get(base + '/url').status_code == 409
    with Session(path_db) as session:
        session.delete(session.get(Material, 'pm1'))
        session.commit()
        assert session.get(LearningPathTaskSource, 'task1').material_id is None
        assert session.get(LearningPathTask, 'task1') is not None
    assert student.get(base).json()['code'] == 'LEARNING_PATH_SOURCE_REMOVED'


def test_unlinked_tasks_and_pending_migration_remain_readable(path_db, login):
    student = login('u_s1')
    path = ready_plan(path_db, student)
    base = f'/learning-paths/{path["id"]}/tasks/task1/study'
    result = student.get(base).json()
    assert result['source_status'] == 'not_linked' and result['reading'] is None
    assert result['instructions'] == 'Read requirements'
    with path_db.begin() as connection:
        LearningPathTaskSource.__table__.drop(connection)
    assert student.get(base).json()['source_status'] == 'migration_pending'
    assert student.get(base + '/url').status_code == 404
    assert student.get(f'/learning-paths/{path["id"]}').status_code == 200


def test_old_task_study_is_read_only(path_db, linked_task):
    student, path = linked_task
    revision = student.post(f'/learning-paths/{path["id"]}/versions', json=goal()).json()
    with Session(path_db) as session:
        from app.models import LearningPath
        session.get(LearningPath, path['id']).current_version_id = revision['version_id']
        session.commit()
    assert student.get(f'/learning-paths/{path["id"]}/tasks/task1/study').json()['read_only'] is True


@pytest.mark.parametrize('change,code', [
    ({'fingerprint': 'b' * 64}, 'LEARNING_PATH_SOURCE_CHANGED'),
    ({'material_id': 'other'}, 'LEARNING_PATH_SOURCE_CHANGED'),
    ({'page_end': 4}, 'LEARNING_PATH_PAGE_RANGE_INVALID'),
])
def test_generation_source_binding_rejects_wrong_sources(path_db, linked_task, change, code):
    from app.learning_task_reading import TaskSourceInput, bind_task_source
    from app.errors import AppError
    student, path = linked_task
    reading = student.get(f'/learning-paths/{path["id"]}/tasks/task1/study').json()['reading']
    source = TaskSourceInput(material_id='pm1', fingerprint='a' * 64, page_start=2, page_end=3)
    source = source.model_copy(update=change)
    with Session(path_db) as session:
        with pytest.raises(AppError) as error:
            bind_task_source(session, session.get(LearningPathTask, 'task1'), source, reading)
        assert error.value.code == code


def test_generation_source_contract_and_complete_text_required(path_db, linked_task):
    from app.learning_task_reading import TaskSourceInput, bind_task_source
    from app.errors import Unprocessable
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        TaskSourceInput(material_id='pm1', fingerprint='a' * 64, page_start=3, page_end=2)
    student, path = linked_task
    reading = student.get(f'/learning-paths/{path["id"]}/tasks/task1/study').json()['reading']
    source = TaskSourceInput(material_id='pm1', fingerprint='a' * 64, page_start=2, page_end=3)
    with Session(path_db) as session:
        reading['pages'][0]['truncated'] = True
        with pytest.raises(Unprocessable):
            bind_task_source(session, session.get(LearningPathTask, 'task1'), source, reading)
        reading['pages'][0]['truncated'] = False
        session.delete(session.get(LearningPathTaskSource, 'task1'))
        session.flush()
        bind_task_source(session, session.get(LearningPathTask, 'task1'), source, reading)
        session.commit()
        assert session.get(LearningPathTaskSource, 'task1').page_start == 2
