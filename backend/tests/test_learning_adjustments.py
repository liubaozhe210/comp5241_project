from datetime import datetime
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_learning_paths import path_db, ready_plan, goal, path_materials, linked_task
from test_learning_assessments import quiz_db, quiz_generator, make_quiz, questions
from app.models import LearningPathAdjustment, LearningPathTask, LearningPath, LearningPathVersion


@pytest.fixture
def adjustment_db(quiz_db):
    with quiz_db.begin() as connection:
        LearningPathAdjustment.__table__.create(connection)
    return quiz_db


def setup(engine, login, score=0, future=True, done=True):
    student, path, base, quiz = make_quiz(engine, login)
    with Session(engine) as session:
        task = session.get(LearningPathTask, 'task1')
        task.minutes = 200 if future else 600
        task.done = done
        task.completed_at = datetime(2026, 11, 13) if done else None
        if future:
            session.add(LearningPathTask(id='future', version_id=path['version_id'], position=1,
                                         stage='Next stage', title='Future study', instructions='Study next topic',
                                         minutes=400, done=False))
        session.commit()
    answers = [i % 4 if i < score else (i + 1) % 4 for i in range(5)]
    attempt = student.post(base + '/assessments/' + quiz['id'] + '/attempts',
                            json={'request_id': str(uuid4()), 'answers': answers}).json()
    assert attempt['score'] == score
    return student, path, base, quiz, attempt


def test_preview_is_read_only_and_apply_preserves_progress_and_budget(adjustment_db, quiz_generator, login):
    student, path, base, quiz, attempt = setup(adjustment_db, login)
    url = base + '/attempts/' + attempt['id'] + '/adjustment'
    assert student.get(url).json()['adjustment'] is None
    preview = student.post(url).json()
    assert preview['kind'] == 'review' and len(preview['new_tasks']) == 5
    assert preview['before_minutes'] == preview['after_minutes'] == 600
    assert preview['extra_minutes'] == 0
    assert preview['changes'][0]['before'] == 400 and preview['changes'][0]['after'] == 325
    assert student.get(base).json()['total_tasks'] == 2
    applied = student.post(base + '/adjustments/' + preview['id'] + '/apply', json={}).json()
    assert applied['applied'] is True
    plan = student.get(base).json()
    assert plan['total_tasks'] == 7 and plan['completed_tasks'] == 1
    assert plan['estimated_minutes'] == 600 and plan['extra_minutes'] == 0
    original = next(t for t in plan['tasks'] if t['id'] == 'task1')
    assert original['done'] is True and original['minutes'] == 200
    assert original['completed_at'].startswith('2026-11-13')
    assert next(t for t in plan['tasks'] if t['id'] == 'future')['minutes'] == 325
    assert plan['tasks'][0]['id'] == 'task1' and plan['tasks'][-1]['id'] == 'future'
    assert len(student.get(base + '/stages').json()['stages']) == 2
    assert student.post(base + '/adjustments/' + preview['id'] + '/apply', json={}).json()['applied'] is True
    assert student.get(base).json()['total_tasks'] == 7
    assert len(quiz_generator.calls) == 1  # Adjustments do not invoke AI.


def test_extra_time_requires_explicit_confirmation(adjustment_db, quiz_generator, login):
    student, _, base, _, attempt = setup(adjustment_db, login, future=False)
    preview = student.post(base + '/attempts/' + attempt['id'] + '/adjustment').json()
    assert preview['extra_minutes'] == 75 and preview['after_minutes'] == 675
    url = base + '/adjustments/' + preview['id'] + '/apply'
    assert student.post(url, json={}).json()['code'] == 'ADJUSTMENT_EXTRA_TIME_REQUIRED'
    assert student.get(base).json()['total_tasks'] == 1
    assert student.post(url, json={'allow_extra_time': True}).json()['applied'] is True
    plan = student.get(base).json()
    assert plan['budget_minutes'] == 600 and plan['estimated_minutes'] == 675 and plan['extra_minutes'] == 75


@pytest.mark.parametrize('score,done,kind,count', [(3, True, 'practice', 2), (5, True, 'challenge', 1), (4, False, 'continue', 0)])
def test_score_rules(adjustment_db, quiz_generator, login, score, done, kind, count):
    student, _, base, _, attempt = setup(adjustment_db, login, score=score, done=done)
    preview = student.post(base + '/attempts/' + attempt['id'] + '/adjustment').json()
    assert preview['kind'] == kind and len(preview['new_tasks']) == count
    if kind == 'continue':
        assert student.post(base + '/adjustments/' + preview['id'] + '/apply', json={}).status_code == 409
        student.patch(base + '/tasks/task1', json={'done': True})
        assert student.post(base + '/attempts/' + attempt['id'] + '/adjustment').json()['kind'] == 'challenge'


def test_stale_progress_requires_new_preview(adjustment_db, quiz_generator, login):
    student, _, base, _, attempt = setup(adjustment_db, login)
    url = base + '/attempts/' + attempt['id'] + '/adjustment'
    preview = student.post(url).json()
    student.patch(base + '/tasks/task1', json={'done': False})
    assert student.get(url).json()['adjustment']['stale'] is True
    apply_url = base + '/adjustments/' + preview['id'] + '/apply'
    assert student.post(apply_url, json={}).json()['code'] == 'ADJUSTMENT_STALE'
    assert student.post(url).json()['stale'] is False
    assert student.post(apply_url, json={}).json()['applied'] is True


def test_newer_attempt_and_pending_same_type_are_rejected(adjustment_db, quiz_generator, login):
    student, _, base, quiz, attempt = setup(adjustment_db, login)
    first = student.post(base + '/attempts/' + attempt['id'] + '/adjustment').json()
    second = student.post(base + '/assessments/' + quiz['id'] + '/attempts',
                          json={'request_id': str(uuid4()), 'answers': [1, 2, 3, 0, 1]}).json()
    assert student.post(base + '/adjustments/' + first['id'] + '/apply', json={}).json()['code'] == 'ADJUSTMENT_NEWER_ATTEMPT'
    current_url = base + '/attempts/' + second['id'] + '/adjustment'
    preview = student.post(current_url).json()
    student.post(base + '/adjustments/' + preview['id'] + '/apply', json={})
    third = student.post(base + '/assessments/' + quiz['id'] + '/attempts',
                         json={'request_id': str(uuid4()), 'answers': [1, 2, 3, 0, 1]}).json()
    assert student.post(base + '/attempts/' + third['id'] + '/adjustment').json()['code'] == 'ADJUSTMENT_PENDING_TASKS'


def test_owner_history_and_missing_table_guards(adjustment_db, quiz_generator, login):
    student, _, base, _, attempt = setup(adjustment_db, login)
    url = base + '/attempts/' + attempt['id'] + '/adjustment'
    preview = student.post(url).json()
    assert login('u_s2').get(url).status_code == 404
    assert login('u_s2').post(base + '/adjustments/' + preview['id'] + '/apply', json={}).status_code == 404
    other = student.post('/learning-paths', json=goal()).json()
    assert student.get(f'/learning-paths/{other["id"]}/attempts/{attempt["id"]}/adjustment').status_code == 404
    with adjustment_db.begin() as connection:
        LearningPathAdjustment.__table__.drop(connection)
    assert student.get(url).json()['code'] == 'ADJUSTMENT_MIGRATION_REQUIRED'
    assert student.get(base).status_code == 200


def test_failed_apply_rolls_back_time_positions_and_insertions(adjustment_db, quiz_generator, login, monkeypatch):
    student, _, base, _, attempt = setup(adjustment_db, login)
    preview = student.post(base + '/attempts/' + attempt['id'] + '/adjustment').json()
    from app import learning_adjustments
    def fail():
        raise RuntimeError('test failure before commit')
    monkeypatch.setattr(learning_adjustments, 'utc_now', fail)
    with pytest.raises(RuntimeError):
        student.post(base + '/adjustments/' + preview['id'] + '/apply', json={})
    plan = student.get(base).json()
    assert plan['total_tasks'] == 2 and plan['estimated_minutes'] == 600
    assert plan['tasks'][-1]['id'] == 'future' and plan['tasks'][-1]['minutes'] == 400
    with Session(adjustment_db) as session:
        assert session.get(LearningPathAdjustment, preview['id']).applied_at is None


def test_historical_version_cannot_preview_or_apply(adjustment_db, quiz_generator, login):
    student, path, base, _, attempt = setup(adjustment_db, login)
    url = base + '/attempts/' + attempt['id'] + '/adjustment'
    preview = student.post(url).json()
    with Session(adjustment_db) as session:
        original = session.get(LearningPathVersion, path['version_id'])
        replacement = LearningPathVersion(id=str(uuid4()), path_id=path['id'], number=2,
            topic=original.topic, goal=original.goal, level=original.level,
            budget_minutes=original.budget_minutes, course_id=original.course_id, status='ready')
        session.add(replacement)
        session.flush()
        session.get(LearningPath, path['id']).current_version_id = replacement.id
        session.commit()
    assert student.get(url).json()['read_only'] is True
    assert student.post(url).json()['code'] == 'LEARNING_PATH_READ_ONLY'
    assert student.post(base + '/adjustments/' + preview['id'] + '/apply', json={}).json()['code'] == 'LEARNING_PATH_READ_ONLY'


def test_completed_future_tasks_are_not_shortened(adjustment_db, quiz_generator, login):
    student, _, base, _, attempt = setup(adjustment_db, login)
    student.patch(base + '/tasks/future', json={'done': True})
    preview = student.post(base + '/attempts/' + attempt['id'] + '/adjustment').json()
    assert preview['changes'] == [] and preview['extra_minutes'] == 75
    applied = student.post(base + '/adjustments/' + preview['id'] + '/apply',
                           json={'allow_extra_time': True})
    assert applied.status_code == 200
    future = next(t for t in student.get(base).json()['tasks'] if t['id'] == 'future')
    assert future['done'] is True and future['minutes'] == 400
