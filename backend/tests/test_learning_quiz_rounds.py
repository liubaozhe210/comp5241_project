from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_learning_paths import path_db, ready_plan, goal, path_materials, linked_task
from test_learning_assessments import quiz_db, quiz_generator, make_quiz, questions
from test_learning_adjustments import adjustment_db
from app.models import LearningPathAssessment, LearningPathAttempt, LearningPath, Enrollment
from app.plan_generation import AIUnavailable


def submit(student, base, quiz):
    payload = {'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0]}
    response = student.post(base + '/assessments/' + quiz['id'] + '/attempts', json=payload)
    assert response.status_code == 200
    return payload, response.json()


def setup(engine, login, generator):
    student, path, base, first = make_quiz(engine, login)
    student.patch(base + '/tasks/task1', json={'done': True})
    payload, attempt = submit(student, base, first)
    generator.result = questions()
    for question in generator.result['questions']:
        question['prompt'] = 'New scenario: ' + question['prompt']
    return student, path, base, first, payload, attempt


def new_round(student, base, first):
    return student.post(base + '/stages/task1/assessment/rounds',
        json={'previous_assessment_id': first['id'], 'locale': 'zh'})


def test_new_round_preserves_old_questions_attempts_and_uses_new_scores(quiz_db, quiz_generator, login):
    student, _, base, first, payload, attempt = setup(quiz_db, login, quiz_generator)
    assert student.get(base).json()['plan_completed'] is True
    response = new_round(student, base, first)
    assert response.status_code == 200, response.text
    second = response.json()
    assert second['id'] != first['id'] and second['round'] == 2
    assert len(second['rounds']) == 2 and second['read_only'] is False
    assert 'correct_index' not in str(second) and 'explanation' not in str(second)
    assert student.get(base + '/stages/task1/assessment').json()['id'] == second['id']
    old = student.get(base + '/stages/task1/assessment?assessment_id=' + first['id']).json()
    assert old['questions'] == first['questions'] and old['read_only'] is True and old['round'] == 1
    old_url = base + '/assessments/' + first['id'] + '/attempts'
    assert student.get(old_url).json() == [attempt]
    assert student.post(old_url, json=payload).json() == attempt  # Lost-response retry is still safe.
    assert student.post(old_url, json={**payload, 'request_id': str(uuid4())}).json()['code'] == 'QUIZ_ROUND_READ_ONLY'
    plan = student.get(base).json()
    assert plan['progress'] == 100 and plan['plan_completed'] is False and plan['passed_stages'] == 0
    assert student.get(base + '/stages').json()['stages'][0]['round_count'] == 2
    submit(student, base, second)
    assert student.get(base).json()['plan_completed'] is True
    # Repeating the same round-generation action never creates round three or calls AI again.
    assert new_round(student, base, first).json()['id'] == second['id']
    assert len(quiz_generator.calls) == 2
    assert quiz_generator.calls[-1]['previous_prompts'] == [q['prompt'] for q in questions()['questions']]


def test_must_submit_current_round_and_finish_stage_before_generation(quiz_db, quiz_generator, login):
    student, _, base, first = make_quiz(quiz_db, login)
    assert new_round(student, base, first).json()['code'] == 'QUIZ_REVIEW_NOT_FINISHED'
    student.patch(base + '/tasks/task1', json={'done': True})
    assert new_round(student, base, first).json()['code'] == 'QUIZ_CURRENT_ROUND_UNANSWERED'
    assert len(quiz_generator.calls) == 1


@pytest.mark.parametrize('failure', ['duplicate', 'provider', 'invalid_source'])
def test_failed_new_round_preserves_current_quiz_and_completion(quiz_db, quiz_generator, login, failure):
    student, _, base, first, _, _ = setup(quiz_db, login, quiz_generator)
    if failure == 'duplicate':
        quiz_generator.result = questions()
        quiz_generator.result['questions'][0]['prompt'] = '  QUESTION   ABOUT requirements 0  '
    elif failure == 'provider':
        quiz_generator.error = AIUnavailable('AI_RATE_LIMITED')
    else:
        quiz_generator.result['questions'][0]['source'] = {'material_id': 'invented', 'page_start': 1, 'page_end': 1}
    response = new_round(student, base, first)
    assert response.status_code == 502
    assert student.get(base + '/stages/task1/assessment').json()['id'] == first['id']
    assert student.get(base).json()['plan_completed'] is True
    with Session(quiz_db) as session:
        assert len(session.scalars(select(LearningPathAssessment)).all()) == 1
        assert len(session.scalars(select(LearningPathAttempt)).all()) == 1


def test_new_round_checks_owner_stage_and_historical_version(quiz_db, quiz_generator, login):
    student, path, base, first, _, _ = setup(quiz_db, login, quiz_generator)
    assert new_round(login('u_s2'), base, first).status_code == 404
    assert new_round(student, base, {'id': str(uuid4())}).status_code == 404
    revision = student.post(base + '/versions', json=goal()).json()
    with Session(quiz_db) as session:
        session.get(LearningPath, path['id']).current_version_id = revision['version_id']
        session.commit()
    assert new_round(student, base, first).json()['code'] == 'LEARNING_PATH_READ_ONLY'
    assert len(quiz_generator.calls) == 1


def test_old_round_cannot_apply_stale_adjustments(adjustment_db, quiz_generator, login):
    student, _, base, first, _, attempt = setup(adjustment_db, login, quiz_generator)
    url = base + '/attempts/' + attempt['id'] + '/adjustment'
    preview = student.post(url).json()
    assert new_round(student, base, first).status_code == 200
    assert student.get(url).json()['latest'] is False
    assert student.post(url).json()['code'] == 'ADJUSTMENT_NEWER_ATTEMPT'
    assert student.post(base + '/adjustments/' + preview['id'] + '/apply', json={}).json()['code'] == 'ADJUSTMENT_NEWER_ATTEMPT'


def test_unmigrated_unique_index_keeps_existing_quiz_working(quiz_db, quiz_generator, login):
    with quiz_db.begin() as connection:
        connection.exec_driver_sql('CREATE UNIQUE INDEX uk_lp_assessment_anchor ON learning_path_assessments(anchor_task_id)')
    student, _, base, first, _, _ = setup(quiz_db, login, quiz_generator)
    assert student.get(base + '/stages/task1/assessment').json()['rounds_available'] is False
    assert new_round(student, base, first).json()['code'] == 'QUIZ_ROUNDS_MIGRATION_REQUIRED'
    assert student.get(base).json()['plan_completed'] is True
    assert len(quiz_generator.calls) == 1


def test_revoked_source_access_during_generation_keeps_old_round(quiz_db, path_materials, linked_task, quiz_generator):
    student, path = linked_task
    with Session(quiz_db) as session:
        session.add(Enrollment(id='e_read', course_id='c1', student_id='u_s1', status='approved', source='self_apply'))
        session.commit()
    source = {'material_id': 'pm1', 'page_start': 2, 'page_end': 3}
    quiz_generator.result = questions(source)
    base = f'/learning-paths/{path["id"]}'
    first = student.post(base + '/stages/task1/assessment').json()
    student.patch(base + '/tasks/task1', json={'done': True})
    submit(student, base, first)
    quiz_generator.result = questions(source)
    for question in quiz_generator.result['questions']:
        question['prompt'] = 'Fresh example ' + question['prompt']
    def revoke():
        path_materials.enrollments['e_read']['status'] = 'dropped'
    quiz_generator.on_generate = revoke
    assert new_round(student, base, first).status_code == 403
    with Session(quiz_db) as session:
        assert len(session.scalars(select(LearningPathAssessment)).all()) == 1
        assert len(session.scalars(select(LearningPathAttempt)).all()) == 1
