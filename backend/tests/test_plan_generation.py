import copy
import json

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from test_learning_paths import path_db, path_materials, goal, approve_reading
from app.main import app
from app.config import settings
from app.models import Enrollment, LearningPathTask, LearningPathTaskSource, Material, Profile
from app.plan_generation import (AIUnavailable, ChatPlanGenerator, GeneratedPlan,
                                 get_plan_generator, provider_configured)


def output(source=None, minutes=600):
    return {'stages': [{'title': 'Requirements foundations', 'tasks': [
        {'title': 'Functional requirements', 'instructions': 'Study and classify requirements.',
         'minutes': minutes, 'source': source}]}]}


class FakeGenerator:
    def __init__(self):
        self.calls = []
        self.result = output()
        self.failure = None
        self.on_generate = None

    def ensure_available(self):
        pass

    def generate(self, context):
        self.calls.append(copy.deepcopy(context))
        if self.on_generate:
            self.on_generate()
        if self.failure:
            raise self.failure
        return self.result


@pytest.fixture
def generator():
    value = FakeGenerator()
    app.dependency_overrides[get_plan_generator] = lambda: value
    yield value
    app.dependency_overrides.pop(get_plan_generator, None)


def test_real_generation_flow_atomic_idempotent_and_progress(path_db, generator, login):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    url = f'/learning-paths/{path["id"]}/generate'
    response = student.post(url, json={'version_id': path['version_id'], 'locale': 'zh'})
    assert response.status_code == 200, response.text
    ready = response.json()
    assert ready['status'] == 'ready' and len(ready['tasks']) == 1
    assert ready['tasks'][0]['done'] is False
    assert generator.calls[0]['materials'] == []  # Pending enrollment reveals no PDFs.
    assert 'id' not in generator.calls[0] and 'email' not in json.dumps(generator.calls[0])
    again = student.post(url).json()
    assert again['tasks'][0]['id'] == ready['tasks'][0]['id'] and len(generator.calls) == 1
    task_url = f'/learning-paths/{path["id"]}/tasks/{ready["tasks"][0]["id"]}'
    assert student.patch(task_url, json={'done': True}).json()['progress'] == 100
    assert student.get(task_url + '/study').status_code == 200


@pytest.mark.parametrize('result,code', [
    (output(minutes=599), 'AI_BUDGET_INVALID'),
    ({'stages': []}, 'AI_RESPONSE_INVALID'),
    (output(source={'material_id': 'invented', 'page_start': 1, 'page_end': 1}), 'AI_RESPONSE_INVALID'),
])
def test_invalid_plan_leaves_no_partial_tasks(path_db, generator, login, result, code):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    generator.result = result
    response = student.post(f'/learning-paths/{path["id"]}/generate')
    assert response.json()['code'] == code
    reloaded = student.get(f'/learning-paths/{path["id"]}').json()
    assert reloaded['status'] == 'draft' and reloaded['tasks'] == []
    generator.result = output()
    assert student.post(f'/learning-paths/{path["id"]}/generate').json()['status'] == 'ready'


def test_failures_preserve_active_plan_and_historical_progress(path_db, generator, login):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    base = f'/learning-paths/{path["id"]}'
    first = student.post(base + '/generate').json()
    student.patch(base + '/tasks/' + first['tasks'][0]['id'], json={'done': True})
    revision = student.post(base + '/versions', json=goal()).json()
    generator.failure = AIUnavailable('AI_TIMEOUT')
    assert student.post(base + '/generate', json={'version_id': revision['version_id']}).json()['code'] == 'AI_TIMEOUT'
    assert student.get(base).json()['progress'] == 100
    generator.failure = None
    second = student.post(base + '/generate', json={'version_id': revision['version_id']}).json()
    assert second['current_version_id'] == revision['version_id'] and second['progress'] == 0
    old = student.get(base + '?version_id=' + first['version_id']).json()
    assert old['progress'] == 100


def test_generation_owner_latest_and_no_course(path_db, generator, login):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal(course_id=None)).json()
    base = f'/learning-paths/{path["id"]}'
    student.post(base + '/versions', json=goal(course_id=None))
    assert student.post(base + '/generate', json={'version_id': path['version_id']}).status_code == 409
    assert login('u_s2').post(base + '/generate').status_code == 404
    assert generator.calls == []
    assert student.post(base + '/generate').status_code == 200
    assert generator.calls[0]['course'] is None


@pytest.fixture
def source_context(path_db, path_materials, monkeypatch):
    from app import material_reading
    approve_reading(path_materials)
    with Session(path_db) as session:
        session.add(Enrollment(id='e_read', course_id='c1', student_id='u_s1', status='approved', source='self_apply'))
        session.add(Material(id='pm1', course_id='c1', title='Requirements', description='', storage_path='c1/read.pdf',
                             original_name='read.pdf', size_bytes=100, uploader_id='u_t1', sort_order=0))
        session.commit()
    monkeypatch.setattr(material_reading, 'extract_pdf', lambda _: {
        'fingerprint': 'a' * 64, 'status': 'ready', 'page_count': 3,
        'pages': [{'number': 1, 'text': 'Requirements analysis', 'truncated': False},
                  {'number': 2, 'text': '', 'truncated': False},
                  {'number': 3, 'text': 'Incomplete', 'truncated': True}]})


def test_only_complete_supplied_pages_can_be_bound(path_db, source_context, generator, login):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    base = f'/learning-paths/{path["id"]}'
    generator.result = output(source={'material_id': 'pm1', 'page_start': 1, 'page_end': 3})
    failed = student.post(base + '/generate')
    assert failed.status_code == 422
    assert student.get(base).json()['tasks'] == []
    sent = generator.calls[0]['materials'][0]['pages']
    assert [p['number'] for p in sent] == [1]
    generator.result = output(source={'material_id': 'pm1', 'page_start': 1, 'page_end': 1})
    ready = student.post(base + '/generate').json()
    assert ready['status'] == 'ready'
    study = student.get(base + '/tasks/' + ready['tasks'][0]['id'] + '/study').json()
    assert [p['number'] for p in study['reading']['pages']] == [1]


def test_revocation_during_generation_aborts_save(path_db, source_context, generator, login):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    generator.result = output(source={'material_id': 'pm1', 'page_start': 1, 'page_end': 1})
    def revoke():
        with Session(path_db) as session:
            session.get(Enrollment, 'e_read').status = 'dropped'
            session.commit()
    generator.on_generate = revoke
    response = student.post(f'/learning-paths/{path["id"]}/generate')
    assert response.status_code == 403
    assert student.get(f'/learning-paths/{path["id"]}').json()['tasks'] == []


@pytest.fixture
def ai_settings(monkeypatch):
    for key, value in {'ai_generation_enabled': True, 'ai_api_key': 'test-only-key',
                       'ai_model': 'test-model', 'ai_chat_completions_url': 'https://example.test/v1/chat/completions'}.items():
        monkeypatch.setattr(settings, key, value)


def mock_transport(monkeypatch, handler):
    original = httpx.Client
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))


def test_provider_request_and_json_response(ai_settings, monkeypatch):
    def handler(request):
        body = json.loads(request.content)
        assert request.headers['authorization'] == 'Bearer test-only-key'
        assert body['model'] == 'test-model' and body['response_format']['type'] == 'json_object'
        assert 'untrusted' in body['messages'][0]['content']
        return httpx.Response(200, json={'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(output())}}]})
    mock_transport(monkeypatch, handler)
    assert isinstance(ChatPlanGenerator().generate({'goal': 'test'}), GeneratedPlan)


@pytest.mark.parametrize('status,code', [(401, 'AI_AUTH_FAILED'), (429, 'AI_RATE_LIMITED'), (500, 'AI_REQUEST_FAILED')])
def test_provider_errors_hide_raw_body(ai_settings, monkeypatch, status, code):
    mock_transport(monkeypatch, lambda _: httpx.Response(status, text='private-upstream-debug'))
    with pytest.raises(AIUnavailable) as error:
        ChatPlanGenerator().generate({})
    assert error.value.code == code and 'private-upstream-debug' not in str(error.value)


def test_provider_timeout_and_invalid_output(ai_settings, monkeypatch):
    def timeout(_):
        raise httpx.ReadTimeout('private-url-and-key')
    mock_transport(monkeypatch, timeout)
    with pytest.raises(AIUnavailable) as error:
        ChatPlanGenerator().generate({})
    assert error.value.code == 'AI_TIMEOUT'


def test_config_requires_explicit_enabled_secure_endpoint(ai_settings, monkeypatch):
    assert provider_configured() is True
    monkeypatch.setattr(settings, 'ai_chat_completions_url', 'http://remote.example/v1/chat/completions')
    assert provider_configured() is False
    monkeypatch.setattr(settings, 'ai_chat_completions_url', 'https://user:password@example.test/v1/chat/completions')
    assert provider_configured() is False


def test_late_invalid_task_rolls_back_already_flushed_tasks_and_sources(path_db, source_context, generator, login):
    student = login('u_s1')
    path = student.post('/learning-paths', json=goal()).json()
    first = output(source={'material_id': 'pm1', 'page_start': 1, 'page_end': 1}, minutes=300)['stages'][0]['tasks'][0]
    second = copy.deepcopy(first)
    second['source']['page_end'] = 3
    generator.result = {'stages': [{'title': 'Stage', 'tasks': [first, second]}]}
    response = student.post(f'/learning-paths/{path["id"]}/generate')
    assert response.status_code == 422
    with Session(path_db) as session:
        assert session.scalars(select(LearningPathTask)).all() == []
        assert session.scalars(select(LearningPathTaskSource)).all() == []


def test_invalid_provider_json_and_refusal(ai_settings, monkeypatch):
    original = httpx.Client
    responses = iter([
        {'choices': [{'finish_reason': 'stop', 'message': {'content': 'not-json'}}]},
        {'choices': [{'finish_reason': 'stop', 'message': {'content': None, 'refusal': 'refused'}}]},
    ])
    monkeypatch.setattr(httpx, 'Client', lambda **kwargs: original(transport=httpx.MockTransport(lambda _: httpx.Response(200, json=next(responses))), **kwargs))
    with pytest.raises(AIUnavailable) as error:
        ChatPlanGenerator().generate({})
    assert error.value.code == 'AI_RESPONSE_INVALID'
    with pytest.raises(AIUnavailable) as error:
        ChatPlanGenerator().generate({})
    assert error.value.code == 'AI_RESPONSE_INVALID'
