'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, errorText } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';
import type { PathTask } from '@/lib/learning-path';
import { groupLearningTasks } from '@/lib/learning-stages';
import { StageQuiz } from './StageQuiz';

type StageSummary = { anchor_task_id: string; attempt_count: number; latest_score: number | null;
  first_score: number | null; status: string; assessment_id: string | null };
type Stages = { assessment_available: boolean; read_only: boolean; stages: StageSummary[] };

function LearningStage({ locale, pathId, group, index, summary, available, readOnly, busy, onToggle, onSubmitted, onPlanChanged }: {
  locale: AppLocale; pathId: string; group: ReturnType<typeof groupLearningTasks>[number]; index: number;
  summary?: StageSummary; available: boolean | null; readOnly: boolean; busy: boolean;
  onToggle: (id: string, done: boolean) => void; onSubmitted: () => void; onPlanChanged?: () => void | Promise<void>;
}) {
  const t = useTranslations();
  const done = group.tasks.filter((task) => task.done).length;
  const allDone = done === group.tasks.length;
  const [expanded, setExpanded] = useState<boolean | null>(null);
  useEffect(() => {
    const target = `stage-quiz-${group.anchorTaskId}`;
    if (window.location.hash !== `#${target}`) return;
    setExpanded(true);
    const frame = window.requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [group.anchorTaskId]);
  const showQuiz = expanded ?? (allDone && !readOnly && (summary?.latest_score ?? 0) < 4);
  const canOpen = available && (!readOnly || !!summary?.assessment_id);
  return <section id={`stage-${group.anchorTaskId}`} className="card mb-6 overflow-hidden">
    <header className="flex items-start gap-4 border-b border-black/10 bg-ivory-100 px-5 py-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{index + 1}</span>
      <div><h2 className="text-xl font-semibold">{group.title}</h2>
        <p className="mt-1 text-sm text-ink-500">{t('quiz.tasks')} {done}/{group.tasks.length}{summary ? ` · ${t(`quiz.status_${summary.status}`)}` : ''}</p>
      </div>
    </header>
    <div className="space-y-4 p-5">
      {group.tasks.map((task) => <article className="rounded-xl border border-black/10 p-4" key={task.id}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h3 className="font-semibold">{task.title}</h3><p className="mt-1 text-sm text-ink-500">{task.minutes} min</p></div>
          <Link className="btn" href={`/${locale}/learning-path/${pathId}/tasks/${task.id}`}>{t('pathResources.read')}</Link>
        </div>
        <details className="my-3"><summary className="cursor-pointer text-sm text-ink-500">{t('learningPath.study')}</summary><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{task.instructions}</p></details>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={task.done} disabled={busy || readOnly} onChange={(event) => onToggle(task.id, event.target.checked)} />{t('learningPath.done')}</label>
      </article>)}
    </div>
    <div id={`stage-quiz-${group.anchorTaskId}`} className="border-t border-dashed border-black/15 bg-ivory-100/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold text-accent">{t('quiz.title')}</h3><p className="mt-1 text-sm text-ink-500">{t(allDone ? 'quiz.stageReady' : 'quiz.stageSequence')}</p></div>
        {canOpen && <button className={allDone ? 'btn' : 'btn-ghost'} disabled={busy} onClick={() => setExpanded(!showQuiz)} aria-expanded={showQuiz} aria-controls={`stage-quiz-body-${group.anchorTaskId}`}>{t(showQuiz ? 'quiz.collapse' : summary?.assessment_id ? 'quiz.openInline' : 'quiz.startInline')}</button>}
      </div>
      {summary && summary.attempt_count > 0 && <p className="mt-3 text-sm text-ink-500">{t('quiz.first')} {summary.first_score}/5 · {t('quiz.latest')} {summary.latest_score}/5 · {summary.attempt_count} {t('quiz.attempts')}</p>}
      {available === null && <p className="mt-3 text-sm">{t('common.loading')}</p>}
      {available === false && <p className="mt-3 text-sm text-ink-500">{t('quiz.migration')}</p>}
      {canOpen && <div id={`stage-quiz-body-${group.anchorTaskId}`} className="mt-5" hidden={!showQuiz}>
        {(showQuiz || expanded !== null) && <StageQuiz locale={locale} id={pathId} anchor={group.anchorTaskId} embedded onSubmitted={() => { setExpanded(true); onSubmitted(); }} onPlanChanged={onPlanChanged} />}
      </div>}
    </div>
  </section>;
}

export function LearningPathStages({ locale, pathId, versionId, tasks, readOnly, busy, onToggle, onPlanChanged }: {
  locale: AppLocale; pathId: string; versionId: string; tasks: PathTask[]; readOnly: boolean; busy: boolean;
  onToggle: (id: string, done: boolean) => void; onPlanChanged?: () => void | Promise<void>;
}) {
  const t = useTranslations();
  const [data, setData] = useState<Stages | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const completed = tasks.filter((task) => task.done).length;
  useEffect(() => {
    let active = true;
    setError('');
    apiFetch<Stages>(`/learning-paths/${pathId}/stages?version_id=${encodeURIComponent(versionId)}`)
      .then((value) => { if (active) setData(value); })
      .catch((err) => { if (active) setError(errorText(err, t)); });
    return () => { active = false; };
  }, [pathId, versionId, completed, retry, t]);
  return <div>
    {error && <div className="card mb-5 p-4" role="alert"><p>{error}</p><button className="btn-ghost mt-2" onClick={() => setRetry((n) => n + 1)}>{t('reading.retry')}</button></div>}
    {groupLearningTasks(tasks).map((group, index) => <LearningStage key={group.anchorTaskId} locale={locale} pathId={pathId}
      group={group} index={index} summary={data?.stages.find((stage) => stage.anchor_task_id === group.anchorTaskId)}
      available={data?.assessment_available ?? null} readOnly={readOnly} busy={busy} onToggle={onToggle}
      onSubmitted={() => setRetry((n) => n + 1)} onPlanChanged={onPlanChanged} />)}
  </div>;
}
