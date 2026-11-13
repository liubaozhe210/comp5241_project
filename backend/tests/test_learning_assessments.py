from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_learning_paths import path_db, ready_plan, goal, path_materials, linked_task
from app.main import app
from app.models import (Enrollment, LearningPath, LearningPathAssessment, LearningPathAttempt,
                        LearningPathTask, Material)
from app.learning_assessments import get_quiz_generator
from app.plan_generation import AIUnavailable


def questions(source=None):
    return {'questions': [{'prompt': f'Question about requirements {i}', 'options': [f'Option {j}' for j in range(4)],
                           'correct_index': i % 4, 'explanation': f'Explanation {i}', 'concept': f'Concept {i}',
                           'source': source} for i in range(5)]}


class Generator:
    def __init__(self):
        self.calls = []
        self.result = questions()
        self.error = None
        self.on_generate = None

    def generate(self, context):
        self.calls.append(context)
        if self.on_generate:
            self.on_generate()
        if self.error:
            raise self.error
        return self.result


@pytest.fixture
def quiz_db(path_db):
    with path_db.begin() as connection:
        LearningPathAssessment.__table__.create(connection)
        LearningPathAttempt.__table__.create(connection)
    return path_db


@pytest.fixture
def quiz_generator():
    generator = Generator()
    app.dependency_overrides[get_quiz_generator] = lambda: generator
    yield generator
    app.dependency_overrides.pop(get_quiz_generator, None)


def make_quiz(engine, login):
    student = login('u_s1')
    path = ready_plan(engine, student)
    base = f'/learning-paths/{path["id"]}'
    quiz = student.post(base + '/stages/task1/assessment').json()
    return student, path, base, quiz


def test_get_never_generates_answers_hidden_until_submit(quiz_db, quiz_generator, login):
    student = login('u_s1')
    path = ready_plan(quiz_db, student)
    base = f'/learning-paths/{path["id"]}'
    assert student.get(base + '/stages/task1/assessment').json()['id'] is None
    assert quiz_generator.calls == []
    public = student.post(base + '/stages/task1/assessment')
    assert public.status_code == 200
    quiz = public.json()
    assert len(quiz['questions']) == 5
    assert all(set(q) == {'prompt', 'options'} for q in quiz['questions'])
    assert quiz['basis'] == 'task_instructions'
    assert public.headers['cache-control'] == 'private, no-store'
    assert student.get(base + '/assessments/' + quiz['id'] + '/attempts').json() == []
    assert student.post(base + '/stages/task1/assessment').json()['id'] == quiz['id']
    assert len(quiz_generator.calls) == 1
    assert student.get(base).json()['progress'] == 0


def test_grading_idempotency_history_and_stage_completion(quiz_db, quiz_generator, login):
    student, path, base, quiz = make_quiz(quiz_db, login)
    url = base + '/assessments/' + quiz['id'] + '/attempts'
    payload = {'request_id': str(uuid4()), 'answers': [1, 2, 3, 0, 1]}
    first = student.post(url, json=payload).json()
    assert first['score'] == 0 and first['passed'] is False
    assert len(first['feedback']) == 5 and first['feedback'][0]['correct_index'] == 0
    assert student.post(url, json=payload).json()['id'] == first['id']
    changed = student.post(url, json={**payload, 'answers': [0, 1, 2, 3, 0]})
    assert changed.status_code == 409
    latest = student.post(url, json={'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0]}).json()
    assert latest['score'] == 5 and latest['passed'] is True
    assert len(student.get(url).json()) == 2
    stage = student.get(base + '/stages').json()['stages'][0]
    assert stage['first_score'] == 0 and stage['latest_score'] == 5 and stage['status'] == 'passed'
    assert student.get(base).json()['progress'] == 0
    student.patch(base + '/tasks/task1', json={'done': True})
    assert student.get(base + '/stages').json()['stages'][0]['status'] == 'completed'
    student.patch(base + '/tasks/task1', json={'done': False})
    assert student.get(base + '/stages').json()['stages'][0]['status'] == 'passed'


@pytest.mark.parametrize('extra', [
    {'answers': [0, 1]}, {'answers': [0, 1, 2, 3, 4]}, {'answers': [True, 1, 2, 3, 0]},
    {'answers': [0.0, 1, 2, 3, 0]}, {'score': 5}, {'request_id': 'bad-id'},
])
def test_client_cannot_submit_invalid_answers_or_score(quiz_db, quiz_generator, login, extra):
    student, _, base, quiz = make_quiz(quiz_db, login)
    response = student.post(base + '/assessments/' + quiz['id'] + '/attempts',
                            json={'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0], **extra})
    assert response.status_code == 422
    assert student.get(base + '/assessments/' + quiz['id'] + '/attempts').json() == []


def test_ownership_anchor_and_history_read_only(quiz_db, quiz_generator, login):
    student, path, base, quiz = make_quiz(quiz_db, login)
    assert login('u_s2').get(base + '/stages').status_code == 404
    assert login('u_s2').get(base + '/stages/task1/assessment').status_code == 404
    assert login('u_s2').get(base + '/assessments/' + quiz['id'] + '/attempts').status_code == 404
    assert login('u_t1').post(base + '/stages/task1/assessment').status_code == 403
    other = student.post('/learning-paths', json=goal()).json()
    assert student.get(f'/learning-paths/{other["id"]}/assessments/{quiz["id"]}/attempts').status_code == 404
    url = base + '/assessments/' + quiz['id'] + '/attempts'
    student.post(url, json={'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0]})
    revision = student.post(base + '/versions', json=goal()).json()
    with Session(quiz_db) as session:
        session.get(LearningPath, path['id']).current_version_id = revision['version_id']
        session.commit()
    assert student.get(base + '/stages/task1/assessment').json()['read_only'] is True
    assert len(student.get(url).json()) == 1
    assert student.post(url, json={'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0]}).status_code == 409


def test_group_anchors_and_migration_absence_do_not_break_plans(path_db, quiz_generator, login):
    student = login('u_s1')
    path = ready_plan(path_db, student)
    base = f'/learning-paths/{path["id"]}'
    assert student.get(base + '/stages').json()['assessment_available'] is False
    assert student.get(base + '/stages/task1/assessment').status_code == 409
    assert student.get(base).status_code == 200


@pytest.mark.parametrize('bad', ['count', 'duplicates', 'options', 'answer'])
def test_invalid_ai_quiz_never_saved(quiz_db, quiz_generator, login, bad):
    student = login('u_s1')
    path = ready_plan(quiz_db, student)
    if bad == 'count':
        quiz_generator.result['questions'].pop()
    if bad == 'duplicates':
        quiz_generator.result['questions'][1]['prompt'] = quiz_generator.result['questions'][0]['prompt']
    if bad == 'options':
        quiz_generator.result['questions'][0]['options'] = ['same'] * 4
    if bad == 'answer':
        quiz_generator.result['questions'][0]['correct_index'] = 4
    response = student.post(f'/learning-paths/{path["id"]}/stages/task1/assessment')
    assert response.status_code == 502
    with Session(quiz_db) as session:
        assert session.scalars(select(LearningPathAssessment)).all() == []


def test_ai_failure_leaves_retryable_stage(quiz_db, quiz_generator, login):
    student = login('u_s1')
    path = ready_plan(quiz_db, student)
    quiz_generator.error = AIUnavailable('AI_RATE_LIMITED')
    base = f'/learning-paths/{path["id"]}'
    assert student.post(base + '/stages/task1/assessment').json()['code'] == 'AI_RATE_LIMITED'
    quiz_generator.error = None
    assert student.post(base + '/stages/task1/assessment').status_code == 200


def test_pdf_quiz_sources_rechecked_after_revocation(quiz_db, path_materials, linked_task, quiz_generator, login):
    student, path = linked_task
    with Session(quiz_db) as session:
        session.add(Enrollment(id='e_read', course_id='c1', student_id='u_s1', status='approved', source='self_apply'))
        session.commit()
    quiz_generator.result = questions({'material_id': 'pm1', 'page_start': 2, 'page_end': 3})
    base = f'/learning-paths/{path["id"]}'
    response = student.post(base + '/stages/task1/assessment')
    assert response.status_code == 200, response.text
    quiz = response.json()
    assert quiz['basis'] == 'materials'
    assert [p['number'] for p in quiz_generator.calls[0]['materials'][0]['pages']] == [2, 3]
    assert 'fingerprint' not in str(quiz['questions'])
    path_materials.enrollments['e_read']['status'] = 'dropped'
    assert student.get(base + '/stages/task1/assessment').status_code == 403
    assert student.get(base + '/assessments/' + quiz['id'] + '/attempts').status_code == 403
    assert student.post(base + '/assessments/' + quiz['id'] + '/attempts', json={'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0]}).status_code == 403


def test_interior_task_is_not_a_second_stage(quiz_db, quiz_generator, login):
    student = login('u_s1')
    path = ready_plan(quiz_db, student)
    with Session(quiz_db) as session:
        session.add(LearningPathTask(id='task2', version_id=path['version_id'], position=1, stage='Foundation',
                                     title='Practice', instructions='Practice requirements', minutes=30, done=False))
        session.commit()
    base = f'/learning-paths/{path["id"]}'
    assert len(student.get(base + '/stages').json()['stages']) == 1
    assert student.post(base + '/stages/task2/assessment').status_code == 404
    assert quiz_generator.calls == []


def test_unseen_source_is_rejected_and_questions_not_saved(quiz_db, path_materials, linked_task, quiz_generator):
    student, path = linked_task
    quiz_generator.result = questions({'material_id': 'pm1', 'page_start': 1, 'page_end': 1})
    response = student.post(f'/learning-paths/{path["id"]}/stages/task1/assessment')
    assert response.status_code == 502
    with Session(quiz_db) as session:
        assert session.scalars(select(LearningPathAssessment)).all() == []


def test_course_archived_during_generation_aborts_save(quiz_db, path_materials, linked_task, quiz_generator):
    from app.models import Course
    student, path = linked_task
    with Session(quiz_db) as session:
        session.add(Enrollment(id='e_read', course_id='c1', student_id='u_s1', status='approved', source='self_apply'))
        session.commit()
    quiz_generator.result = questions({'material_id': 'pm1', 'page_start': 2, 'page_end': 3})
    def archive():
        with Session(quiz_db) as session:
            session.get(Course, 'c1').status = 'archived'
            session.commit()
    quiz_generator.on_generate = archive
    response = student.post(f'/learning-paths/{path["id"]}/stages/task1/assessment')
    assert response.status_code == 404
    with Session(quiz_db) as session:
        assert session.scalars(select(LearningPathAssessment)).all() == []
