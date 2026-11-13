"""Score-driven adjustment previews. Deterministic rules; no additional AI calls."""
from datetime import timezone
from hashlib import sha256
import json
from itertools import groupby
from uuid import uuid4

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from .db import get_session
from .deps import get_repo, require_student
from .errors import Conflict, NotFound
from .learning_paths import owned
from .learning_assessments import assessment_context, check_sources, check_live_access, read_only, is_latest_quiz
from .learning_task_reading import bind_task_source, TaskSourceInput
from .material_reading import read_material
from .models import LearningPathAdjustment, LearningPathAttempt, LearningPathTask, LearningPathAssessment, utc_now

router = APIRouter(tags=['learning-path-adjustments'])


class ApplyRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    allow_extra_time: bool = False


def context(session, repo, path_id, attempt_id, user, lock=False):
    owned(session, path_id, user['id'], lock=lock)
    attempt = session.get(LearningPathAttempt, attempt_id)
    if attempt is None:
        raise NotFound('QUIZ_NOT_FOUND')
    path, version, quiz = assessment_context(session, path_id, attempt.assessment_id, user)
    if lock:
        path = owned(session, path_id, user['id'], lock=True)
    if not inspect(session.connection()).has_table('learning_path_adjustments'):
        raise Conflict('ADJUSTMENT_MIGRATION_REQUIRED')
    if lock:
        check_live_access(session, version, user, quiz.sources)
    check_sources(session, repo, path, version, user, quiz.sources)
    statement = select(LearningPathTask).where(LearningPathTask.version_id == version.id).order_by(LearningPathTask.position)
    if lock:
        statement = statement.with_for_update().execution_options(populate_existing=True)
    tasks = session.scalars(statement).all()
    groups = [list(items) for _, items in groupby(tasks, key=lambda task: task.stage)]
    group = next((items for items in groups if items[0].id == quiz.anchor_task_id), None)
    if group is None:
        raise NotFound('QUIZ_STAGE_NOT_FOUND')
    return path, version, quiz, attempt, group, tasks


def snapshot(tasks):
    values = [{'id': task.id, 'done': task.done, 'minutes': task.minutes, 'position': task.position} for task in tasks]
    return sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def latest_attempt(session, quiz):
    return session.scalar(select(LearningPathAttempt).where(LearningPathAttempt.assessment_id == quiz.id)
                          .order_by(LearningPathAttempt.created_at.desc(), LearningPathAttempt.id.desc()).limit(1).with_for_update())


def is_latest_attempt(session, quiz, attempt):
    return is_latest_quiz(session, quiz) and latest_attempt(session, quiz).id == attempt.id


def assert_mutable(path, version, quiz, attempt, session):
    if read_only(path, version):
        raise Conflict('LEARNING_PATH_READ_ONLY')
    if not is_latest_attempt(session, quiz, attempt):
        raise Conflict('ADJUSTMENT_NEWER_ATTEMPT')


def proposal(session, version, quiz, attempt, group, tasks):
    zh = quiz.locale == 'zh'
    kind = 'review' if attempt.score <= 2 else 'practice' if attempt.score == 3 else 'challenge' if all(t.done for t in group) else 'continue'
    names = {'review': ('复习', 'Review'), 'practice': ('补充练习', 'Practice'), 'challenge': ('挑战练习', 'Challenge')}
    wrong = [q for i, q in enumerate(quiz.questions) if attempt.answers[i] != q['correct_index']]
    targets = list({q['concept']: q for q in wrong}.values()) if kind in ('review', 'practice') else [quiz.questions[0]] if kind == 'challenge' else []
    titles = [task.title for task in group]
    pending_same = session.scalars(select(LearningPathAdjustment).join(LearningPathAttempt,
                  LearningPathAdjustment.attempt_id == LearningPathAttempt.id).where(
                  LearningPathAttempt.assessment_id.in_(select(LearningPathAssessment.id).where(
                      LearningPathAssessment.anchor_task_id == quiz.anchor_task_id)), LearningPathAdjustment.kind == kind,
                  LearningPathAdjustment.applied_at.is_not(None))).all()
    pending_ids = {item['id'] for adj in pending_same for item in adj.preview['new_tasks']}
    if any(t.id in pending_ids and not t.done for t in tasks):
        raise Conflict('ADJUSTMENT_PENDING_TASKS')
    new = []
    minutes = {'review': 15, 'practice': 20, 'challenge': 30}.get(kind, 0)
    manifests = {item['material_id']: item['fingerprint'] for item in quiz.sources}
    for question in targets:
        concept = question['concept'] if kind != 'challenge' else group[0].stage
        prefix = names[kind][0 if zh else 1]
        title = f'{prefix}：{concept}' if zh else f'{prefix}: {concept}'
        if title in titles and any(t.title == title and not t.done for t in group):
            raise Conflict('ADJUSTMENT_PENDING_TASKS')
        instruction = (f'针对知识点“{concept}”，重新阅读相关材料，用自己的话总结，并给出一个新例子。\n测验解析：{question["explanation"]}' if zh else
                       f'Revisit {concept}, summarize it in your own words and give a new example.\nQuiz explanation: {question["explanation"]}')
        if kind == 'practice':
            instruction += '\n再设计一个反例并解释区别。' if zh else '\nCreate a counterexample and explain the difference.'
        if kind == 'challenge':
            instruction = (f'围绕“{concept}”设计一个小型应用案例，说明你的选择与取舍，并自行检查是否符合阶段目标。' if zh else
                           f'Design a small applied case for {concept}, explain your choices and trade-offs, and check it against the stage goals.')
        source = question.get('source')
        if kind == 'challenge':
            source = None  # Self-contained application, not an unsupported claim about one PDF page.
        new.append({'id': str(uuid4()), 'title': title[:200], 'instructions': instruction, 'minutes': minutes,
                    'source': {**source, 'fingerprint': manifests[source['material_id']]} if source else None})
    current = sum(t.minutes for t in tasks)
    added = sum(t['minutes'] for t in new)
    needed = max(0, current + added - version.budget_minutes) if new else 0
    changes = []
    end_position = group[-1].position
    # Only shorten unfinished future tasks, by at most half, keeping >=5 minutes.
    future = [t for t in tasks if t.position > end_position and not t.done]
    for task in sorted(future, key=lambda t: (-t.minutes, t.position)):
        cut = min(needed, max(0, task.minutes - max(5, (task.minutes + 1) // 2)))
        if cut:
            changes.append({'task_id': task.id, 'title': task.title, 'before': task.minutes, 'after': task.minutes - cut})
            needed -= cut
    after = current + added - sum(item['before'] - item['after'] for item in changes)
    reason = (f'本次测验 {attempt.score}/5，按固定学习规则建议{names[kind][0] if kind != "continue" else "继续完成本阶段任务"}。' if zh else
              f'Score {attempt.score}/5: rule-based recommendation to {names[kind][1].lower() if kind != "continue" else "finish the remaining stage tasks"}.')
    return {'snapshot': snapshot(tasks), 'reason': reason, 'stage': group[0].stage,
            'insert_after': end_position, 'new_tasks': new, 'changes': changes,
            'before_minutes': current, 'after_minutes': after, 'original_budget': version.budget_minutes,
            'extra_minutes': max(0, after - version.budget_minutes), 'kind': kind}


def public(adjustment, tasks, read_only_value, latest):
    preview = adjustment.preview
    return {'id': adjustment.id, 'kind': adjustment.kind, 'reason': preview['reason'],
            'new_tasks': [{'title': task['title'], 'instructions': task['instructions'], 'minutes': task['minutes']} for task in preview['new_tasks']],
            'changes': preview['changes'], 'before_minutes': preview['before_minutes'], 'after_minutes': preview['after_minutes'],
            'original_budget': preview['original_budget'], 'extra_minutes': preview['extra_minutes'],
            'applied': adjustment.applied_at is not None,
            'applied_at': adjustment.applied_at.replace(tzinfo=timezone.utc).isoformat() if adjustment.applied_at else None,
            'stale': adjustment.applied_at is None and (preview['snapshot'] != snapshot(tasks) or not latest),
            'read_only': read_only_value}


@router.get('/learning-paths/{path_id}/attempts/{attempt_id}/adjustment')
def get_adjustment(path_id: str, attempt_id: str, response: Response,
                    user=Depends(require_student), session: Session = Depends(get_session), repo=Depends(get_repo)):
    path, version, quiz, attempt, _, tasks = context(session, repo, path_id, attempt_id, user)
    response.headers['Cache-Control'] = 'private, no-store'
    adjustment = session.scalar(select(LearningPathAdjustment).where(LearningPathAdjustment.attempt_id == attempt.id))
    latest = is_latest_attempt(session, quiz, attempt)
    return {'adjustment': public(adjustment, tasks, read_only(path, version), latest) if adjustment else None,
            'read_only': read_only(path, version), 'latest': latest}


@router.post('/learning-paths/{path_id}/attempts/{attempt_id}/adjustment')
def preview_adjustment(path_id: str, attempt_id: str, response: Response,
                       user=Depends(require_student), session: Session = Depends(get_session), repo=Depends(get_repo)):
    try:
        path, version, quiz, attempt, group, tasks = context(session, repo, path_id, attempt_id, user, lock=True)
        adjustment = session.scalar(select(LearningPathAdjustment).where(LearningPathAdjustment.attempt_id == attempt.id).with_for_update())
        if not adjustment or not adjustment.applied_at:
            assert_mutable(path, version, quiz, attempt, session)
            value = proposal(session, version, quiz, attempt, group, tasks)
            if adjustment:
                adjustment.kind = value['kind']; adjustment.preview = value
            else:
                adjustment = LearningPathAdjustment(id=str(uuid4()), attempt_id=attempt.id, kind=value['kind'], preview=value)
                session.add(adjustment)
            session.commit()
        response.headers['Cache-Control'] = 'private, no-store'
        return public(adjustment, tasks, read_only(path, version), True)
    except Exception:
        session.rollback(); raise


@router.post('/learning-paths/{path_id}/adjustments/{adjustment_id}/apply')
def apply_adjustment(path_id: str, adjustment_id: str, payload: ApplyRequest, response: Response,
                     user=Depends(require_student), session: Session = Depends(get_session), repo=Depends(get_repo)):
    try:
        owned(session, path_id, user['id'], lock=True)
        if not inspect(session.connection()).has_table('learning_path_adjustments'):
            raise Conflict('ADJUSTMENT_MIGRATION_REQUIRED')
        adjustment = session.get(LearningPathAdjustment, adjustment_id)
        if not adjustment:
            raise NotFound('ADJUSTMENT_NOT_FOUND')
        path, version, quiz, attempt, group, tasks = context(session, repo, path_id, adjustment.attempt_id, user, lock=True)
        response.headers['Cache-Control'] = 'private, no-store'
        if adjustment.applied_at:
            return public(adjustment, tasks, read_only(path, version), True)
        assert_mutable(path, version, quiz, attempt, session)
        value = adjustment.preview
        if value['snapshot'] != snapshot(tasks):
            raise Conflict('ADJUSTMENT_STALE')
        if not value['new_tasks']:
            raise Conflict('ADJUSTMENT_NOT_NEEDED')
        if value['extra_minutes'] and not payload.allow_extra_time:
            raise Conflict('ADJUSTMENT_EXTRA_TIME_REQUIRED')
        # Recheck anti-stacking even if another preview was applied after this preview.
        proposal(session, version, quiz, attempt, group, tasks)
        for change in value['changes']:
            task = next(t for t in tasks if t.id == change['task_id'])
            if task.done:
                raise Conflict('ADJUSTMENT_STALE')
            task.minutes = change['after']
        count = len(value['new_tasks'])
        for task in sorted(tasks, key=lambda t: -t.position):
            if task.position > value['insert_after']:
                task.position += count
                session.flush()
        readings = {}
        for index, item in enumerate(value['new_tasks']):
            task = LearningPathTask(id=item['id'], version_id=version.id, position=value['insert_after'] + index + 1,
                                    stage=value['stage'], title=item['title'], instructions=item['instructions'],
                                    minutes=item['minutes'], done=False)
            session.add(task); session.flush()
            if item['source']:
                source = TaskSourceInput(**item['source'])
                if source.material_id not in readings:
                    readings[source.material_id] = read_material(source.material_id, Response(), user, repo)
                bind_task_source(session, task, source, readings[source.material_id])
        adjustment.applied_at = utc_now()
        session.commit()
        return public(adjustment, tasks, read_only(path, version), True)
    except Exception:
        session.rollback(); raise
