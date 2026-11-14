from uuid import uuid4

from sqlalchemy.orm import Session

from test_learning_paths import path_db, ready_plan, goal
from test_learning_assessments import quiz_db, quiz_generator, make_quiz
from app.models import LearningPathTask, LearningPathVersion


def attempt(student, base, quiz, passed=True):
    response = student.post(base + '/assessments/' + quiz['id'] + '/attempts',
        json={'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0] if passed else [1, 2, 3, 0, 1]})
    assert response.status_code == 200


def test_tasks_at_100_percent_still_require_quizzes(quiz_db, quiz_generator, login):
    student, path, base, quiz = make_quiz(quiz_db, login)
    plan = student.patch(base + '/tasks/task1', json={'done': True}).json()
    assert plan['progress'] == 100 and plan['plan_completed'] is False
    assert plan['completion_status'] == 'awaiting_assessment'
    assert plan['passed_stages'] == 0 and plan['next_assessment_anchor'] == 'task1'
    attempt(student, base, quiz)
    for plan in (student.get(base).json(), student.get('/me/learning-paths').json()[0],
                 student.get(base + '/versions').json()[0], student.get(base + '/stages').json()):
        assert plan['plan_completed'] is True
        assert plan['completion_status'] == 'completed'
        assert plan['passed_stages'] == plan['completed_stages'] == plan['total_stages'] == 1
        assert plan['next_assessment_anchor'] is None
    assert len(quiz_generator.calls) == 1


def test_latest_failed_attempt_and_undo_reopen_completion(quiz_db, quiz_generator, login):
    student, _, base, quiz = make_quiz(quiz_db, login)
    attempt(student, base, quiz)
    plan = student.get(base).json()
    assert plan['passed_stages'] == 1 and plan['completed_stages'] == 0
    assert plan['plan_completed'] is False and plan['completion_status'] == 'in_progress'
    assert student.patch(base + '/tasks/task1', json={'done': True}).json()['plan_completed'] is True
    attempt(student, base, quiz, passed=False)
    plan = student.get(base).json()
    assert plan['progress'] == 100 and plan['plan_completed'] is False
    assert plan['passed_stages'] == 0 and plan['completion_status'] == 'awaiting_assessment'
    attempt(student, base, quiz)
    undone = student.patch(base + '/tasks/task1', json={'done': False}).json()
    assert undone['passed_stages'] == 1 and undone['completed_stages'] == 0
    assert undone['plan_completed'] is False


def test_all_stages_required_and_added_review_reopens_completed_stage(quiz_db, quiz_generator, login):
    student, path, base, quiz = make_quiz(quiz_db, login)
    with Session(quiz_db) as session:
        session.add(LearningPathTask(id='second', version_id=path['version_id'], position=1,
            stage='Second', title='Study more', instructions='Read more', minutes=30, done=True))
        session.commit()
    student.patch(base + '/tasks/task1', json={'done': True})
    attempt(student, base, quiz)
    plan = student.get(base).json()
    assert plan['total_stages'] == 2 and plan['completed_stages'] == 1
    assert plan['next_assessment_anchor'] == 'second' and plan['plan_completed'] is False
    second = student.post(base + '/stages/second/assessment').json()
    attempt(student, base, second)
    assert student.get(base).json()['plan_completed'] is True
    with Session(quiz_db) as session:
        session.add(LearningPathTask(id='review', version_id=path['version_id'], position=2,
            stage='Second', title='Review', instructions='Review concept', minutes=15, done=False))
        session.commit()
    plan = student.get(base).json()
    assert plan['total_stages'] == plan['passed_stages'] == 2
    assert plan['completed_stages'] == 1 and plan['plan_completed'] is False


def test_missing_assessment_tables_never_marks_plan_complete(path_db, login):
    student = login('u_s1')
    path = ready_plan(path_db, student)
    plan = student.patch(f'/learning-paths/{path["id"]}/tasks/task1', json={'done': True}).json()
    assert plan['progress'] == 100 and plan['assessment_available'] is False
    assert plan['plan_completed'] is False and plan['completion_status'] == 'assessment_unavailable'


def test_empty_ready_plan_and_draft_are_not_completed(quiz_db, login):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    assert path['completion_status'] == 'not_started' and path['plan_completed'] is False
    with Session(quiz_db) as session:
        session.get(LearningPathVersion, path['version_id']).status = 'ready'
        session.commit()
    plan = student.get(f'/learning-paths/{path["id"]}').json()
    assert plan['total_stages'] == 0 and plan['plan_completed'] is False
