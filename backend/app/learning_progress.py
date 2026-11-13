"""Derived learning completion; no new stored state or database migrations."""
from itertools import groupby

from sqlalchemy import inspect, select

from .models import LearningPathAssessment, LearningPathAttempt


def completion_summary(session, version, tasks):
    schema = inspect(session.connection())
    available = all(schema.has_table(name) for name in (
        'learning_path_task_sources', 'learning_path_assessments', 'learning_path_attempts'))
    groups = [list(items) for _, items in groupby(tasks, key=lambda task: task.stage)]
    anchors = [group[0].id for group in groups]
    quizzes = session.scalars(select(LearningPathAssessment).where(
        LearningPathAssessment.anchor_task_id.in_(anchors))
        .order_by(LearningPathAssessment.created_at, LearningPathAssessment.id)).all() if available and anchors else []
    by_anchor = {quiz.anchor_task_id: quiz for quiz in quizzes}
    attempts = session.scalars(select(LearningPathAttempt).where(
        LearningPathAttempt.assessment_id.in_([quiz.id for quiz in quizzes]))
        .order_by(LearningPathAttempt.created_at, LearningPathAttempt.id)).all() if quizzes else []
    by_quiz = {}
    for attempt in attempts:
        by_quiz.setdefault(attempt.assessment_id, []).append(attempt)
    stages = []
    for group in groups:
        quiz = by_anchor.get(group[0].id)
        history = by_quiz.get(quiz.id, []) if quiz else []
        latest = history[-1].score if history else None
        done = sum(task.done for task in group)
        passed = latest is not None and latest >= 4
        status = 'completed' if passed and done == len(group) else 'passed' if passed else 'submitted' if history else 'not_started'
        stages.append({'anchor_task_id': group[0].id, 'title': group[0].stage,
            'round_count': sum(item.anchor_task_id == group[0].id for item in quizzes),
            'completed_tasks': done, 'total_tasks': len(group), 'attempt_count': len(history),
            'latest_score': latest, 'first_score': history[0].score if history else None,
            'status': status, 'assessment_id': quiz.id if quiz else None})
    completed = sum(stage['status'] == 'completed' for stage in stages)
    passed = sum(stage['latest_score'] is not None and stage['latest_score'] >= 4 for stage in stages)
    all_tasks_done = bool(tasks) and all(task.done for task in tasks)
    finished = version.status == 'ready' and bool(stages) and completed == len(stages)
    status = ('not_started' if version.status != 'ready' else 'completed' if finished else
              'assessment_unavailable' if not available else 'awaiting_assessment' if all_tasks_done else 'in_progress')
    next_quiz = next((stage['anchor_task_id'] for stage in stages
        if stage['completed_tasks'] == stage['total_tasks'] and stage['status'] != 'completed'), None) if available else None
    return {'assessment_available': available, 'total_stages': len(stages),
            'passed_stages': passed, 'completed_stages': completed,
            'plan_completed': finished, 'completion_status': status,
            'next_assessment_anchor': next_quiz, 'stages': stages}
