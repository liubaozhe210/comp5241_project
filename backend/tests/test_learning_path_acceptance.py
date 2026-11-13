"""Full workflow acceptance with real SQL persistence and stubbed AI/storage only."""
from uuid import uuid4

from test_learning_paths import path_db, path_materials, goal
from test_plan_generation import generator, source_context
from test_learning_assessments import quiz_db, quiz_generator, questions
from test_learning_adjustments import adjustment_db
from app.plan_generation import AIUnavailable


def test_complete_learning_workflow_and_historical_protection(
        adjustment_db, source_context, generator, quiz_generator, login):
    student = login('u_s1')
    source = {'material_id': 'pm1', 'page_start': 1, 'page_end': 1}
    generator.result = {'stages': [
        {'title': title, 'tasks': [{'title': 'Study ' + title, 'instructions': 'Explain requirements with examples.',
                                  'minutes': 300, 'source': source}]}
        for title in ('Foundations', 'Application')]}

    draft = student.post('/learning-paths', json=goal()).json()
    base = f'/learning-paths/{draft["id"]}'
    assert draft['status'] == 'draft' and draft['tasks'] == []
    plan = student.post(base + '/generate', json={'locale': 'zh'}).json()
    assert plan['status'] == 'ready' and plan['total_stages'] == 2
    first, second = plan['tasks']
    study = student.get(base + '/tasks/' + first['id'] + '/study').json()
    assert study['reading']['pages'][0]['number'] == 1 and study['done'] is False
    assert student.get(base).json()['progress'] == 0  # Opening text never checks off work.
    student.patch(base + '/tasks/' + first['id'], json={'done': True})

    quiz_generator.result = questions(source)
    quiz_base = base + '/stages/' + first['id'] + '/assessment'
    quiz = student.post(quiz_base, json={'locale': 'zh'}).json()
    assert 'correct_index' not in str(quiz)
    request = {'request_id': str(uuid4()), 'answers': [0, 1, 3, 0, 1]}
    attempt_url = base + '/assessments/' + quiz['id'] + '/attempts'
    failed = student.post(attempt_url, json=request).json()
    assert failed['score'] == 2
    assert student.post(attempt_url, json=request).json()['id'] == failed['id']

    preview = student.post(base + '/attempts/' + failed['id'] + '/adjustment').json()
    assert preview['kind'] == 'review' and len(preview['new_tasks']) == 3
    assert preview['after_minutes'] == 600 and preview['extra_minutes'] == 0
    apply_url = base + '/adjustments/' + preview['id'] + '/apply'
    assert student.post(apply_url, json={}).json()['applied'] is True
    assert student.post(apply_url, json={}).json()['applied'] is True
    adjusted = student.get(base).json()
    assert adjusted['total_tasks'] == 5 and adjusted['completed_tasks'] == 1
    assert adjusted['tasks'][0]['id'] == first['id'] and adjusted['tasks'][0]['done'] is True
    assert adjusted['tasks'][-1]['id'] == second['id']
    for task in adjusted['tasks'][1:-1]:
        assert student.get(base + '/tasks/' + task['id'] + '/study').json()['reading'] is not None
        student.patch(base + '/tasks/' + task['id'], json={'done': True})

    quiz_generator.result = questions(source)
    for question in quiz_generator.result['questions']:
        question['prompt'] = 'Fresh application: ' + question['prompt']
    fresh = student.post(quiz_base + '/rounds', json={'previous_assessment_id': quiz['id'], 'locale': 'zh'}).json()
    assert fresh['round'] == 2 and fresh['id'] != quiz['id']
    assert student.get(quiz_base + '?assessment_id=' + quiz['id']).json()['read_only'] is True
    assert student.get(attempt_url).json()[0]['score'] == 2
    passed_request = {'request_id': str(uuid4()), 'answers': [0, 1, 2, 3, 0]}
    assert student.post(base + '/assessments/' + fresh['id'] + '/attempts', json=passed_request).json()['score'] == 5

    before_quiz = student.patch(base + '/tasks/' + second['id'], json={'done': True}).json()
    assert before_quiz['progress'] == 100 and before_quiz['plan_completed'] is False
    assert before_quiz['completion_status'] == 'awaiting_assessment'
    final_quiz = student.post(base + '/stages/' + second['id'] + '/assessment', json={'locale': 'zh'}).json()
    assert student.post(base + '/assessments/' + final_quiz['id'] + '/attempts', json={
        **passed_request, 'request_id': str(uuid4())}).json()['score'] == 5
    for saved in (student.get(base).json(), student.get(base + '/versions').json()[0],
                  student.get('/me/learning-paths').json()[0], student.get(base + '/stages').json()):
        assert saved['plan_completed'] is True and saved['completed_stages'] == saved['total_stages'] == 2
    assert len(quiz_generator.calls) == 3  # Reads, grading and adjustments never called AI.

    replacement = student.post(base + '/versions', json=goal(goal='Revised learning goal')).json()
    generator.failure = AIUnavailable('AI_TIMEOUT')
    assert student.post(base + '/generate', json={'version_id': replacement['version_id']}).json()['code'] == 'AI_TIMEOUT'
    assert student.get(base).json()['plan_completed'] is True  # Failed replacement cannot erase progress.
    generator.failure = None
    assert student.post(base + '/generate', json={'version_id': replacement['version_id']}).json()['progress'] == 0
    old = student.get(base + '?version_id=' + plan['version_id']).json()
    assert old['plan_completed'] is True and old['progress'] == 100
    assert student.patch(base + '/tasks/' + first['id'], json={'done': False}).status_code == 409
    assert student.post(base + '/assessments/' + fresh['id'] + '/attempts',
                        json={**passed_request, 'request_id': str(uuid4())}).status_code == 409
    assert login('u_s2').get(base).status_code == 404
    assert login('u_t1').get(base).status_code == 403
