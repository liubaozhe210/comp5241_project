from uuid import uuid4

from sqlalchemy import event
from sqlalchemy.orm import Session

from test_learning_paths import path_db, path_materials, linked_task
from test_learning_assessments import quiz_db, quiz_generator, questions
from app.models import Enrollment, LearningPathAssessment
from app.learning_schema import assessments_available, has_learning_table
from app.learning_assessments import stage_context, assessment_context


def test_bundled_results_validate_each_pdf_once_and_recheck_access_next_request(
        quiz_db, path_materials, linked_task, quiz_generator, monkeypatch, login):
    student, path = linked_task
    with Session(quiz_db) as session:
        session.add(Enrollment(id='e_read', course_id='c1', student_id='u_s1', status='approved', source='self_apply'))
        session.commit()
    quiz_generator.result = questions({'material_id': 'pm1', 'page_start': 2, 'page_end': 3})
    base = f'/learning-paths/{path["id"]}'
    quiz = student.post(base + '/stages/task1/assessment').json()
    attempt_url = base + '/assessments/' + quiz['id'] + '/attempts'
    attempt = student.post(attempt_url, json={'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0]}).json()
    counts = {}
    def track(name):
        original = getattr(path_materials, name)
        def counted(*args):
            counts[name] = counts.get(name, 0) + 1
            return original(*args)
        monkeypatch.setattr(path_materials, name, counted)
    for name in ('get_material', 'get_course', 'get_enrollment', 'download_object'):
        track(name)
    url = base + '/stages/task1/assessment?include_attempts=true'
    loaded = student.get(url)
    assert loaded.status_code == 200
    assert loaded.json()['attempts'] == [attempt]
    assert counts == {name: 1 for name in ('get_material', 'get_course', 'get_enrollment', 'download_object')}
    assert 'correct_index' not in str(loaded.json()['questions'])
    counts.clear()
    assert login('u_s2').get(url).status_code == 404 and counts == {}
    path_materials.enrollments['e_read']['status'] = 'dropped'
    assert student.get(url).status_code == 403
    assert counts.get('download_object', 0) == 0


def test_unsubmitted_bundled_quiz_never_reveals_answer_keys(quiz_db, quiz_generator, login):
    from test_learning_assessments import make_quiz
    student, _, base, quiz = make_quiz(quiz_db, login)
    plain = student.get(base + '/stages/task1/assessment').json()
    assert 'attempts' not in plain
    bundled = student.get(base + '/stages/task1/assessment?include_attempts=true').json()
    assert bundled['attempts'] == []
    assert 'correct_index' not in str(bundled) and 'explanation' not in str(bundled)


def test_schema_metadata_is_reused_within_session_but_not_across_requests(quiz_db):
    queries = []
    def count_sql(connection, cursor, statement, parameters, context, executemany):
        queries.append(statement)
    event.listen(quiz_db, 'before_cursor_execute', count_sql)
    try:
        with Session(quiz_db) as session:
            assert assessments_available(session)
            assert has_learning_table(session, 'learning_path_assessments')
            assert assessments_available(session)
            assert len(queries) == 1
        with quiz_db.begin() as connection:
            LearningPathAssessment.__table__.drop(connection)
        with Session(quiz_db) as session:
            assert assessments_available(session) is False
    finally:
        event.remove(quiz_db, 'before_cursor_execute', count_sql)


def test_context_queries_resolve_owner_and_version_with_bounded_round_trips(quiz_db, quiz_generator, login):
    from test_learning_assessments import make_quiz
    from app.errors import NotFound
    import pytest
    student, path, base, quiz = make_quiz(quiz_db, login)
    queries = []
    def count_sql(connection, cursor, statement, parameters, context, executemany):
        queries.append(statement)
    event.listen(quiz_db, 'before_cursor_execute', count_sql)
    try:
        with Session(quiz_db) as session:
            owner, version, group = stage_context(session, path['id'], 'task1', {'id': 'u_s1'})
            assert owner.id == path['id'] and version.id == path['version_id']
            assert group[0].id == 'task1'
            assert len(queries) == 2  # Joined ownership/context + stage task ordering.
        queries.clear()
        with Session(quiz_db) as session:
            owner, version, assessment = assessment_context(session, path['id'], quiz['id'], {'id': 'u_s1'})
            assert assessment.id == quiz['id'] and version.id == path['version_id']
            assert len(queries) == 2  # Request-local schema check + joined context.
        with Session(quiz_db) as session:
            with pytest.raises(NotFound):
                assessment_context(session, path['id'], quiz['id'], {'id': 'u_s2'})
            with pytest.raises(NotFound):
                stage_context(session, path['id'], 'task1', {'id': 'u_s2'})
    finally:
        event.remove(quiz_db, 'before_cursor_execute', count_sql)
