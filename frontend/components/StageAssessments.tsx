'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, errorText } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';

type Stages = {
  assessment_available: boolean; read_only: boolean;
  stages: { anchor_task_id: string; title: string; completed_tasks: number; total_tasks: number;
    attempt_count: number; latest_score: number | null; first_score: number | null;
    status: string; assessment_id: string | null }[];
};

export function StageAssessments({ locale, pathId, versionId, completed }: {
  locale: AppLocale; pathId: string; versionId: string; completed: number;
}) {
  const t = useTranslations();
  const [data, setData] = useState<Stages | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    apiFetch<Stages>(`/learning-paths/${pathId}/stages?version_id=${encodeURIComponent(versionId)}`)
      .then((value) => { if (active) setData(value); })
      .catch((err) => { if (active) setError(errorText(err, t)); });
    return () => { active = false; };
  }, [pathId, versionId, completed, retry, t]);
  return <section className="card mb-8 space-y-4 p-5">
    <h2 className="text-xl font-semibold">{t('quiz.title')}</h2><p className="text-sm text-ink-500">{t('quiz.note')}</p>
    {error && <div role="alert"><p>{error}</p><button className="btn-ghost" onClick={() => setRetry((n) => n + 1)}>{t('reading.retry')}</button></div>}
    {!data && !error && <p>{t('common.loading')}</p>}
    {data && !data.assessment_available && <p>{t('quiz.migration')}</p>}
    {data?.stages.map((stage) => <article key={stage.anchor_task_id} className="rounded-xl border border-black/10 p-4">
      <h3 className="font-semibold">{stage.title}</h3>
      <p className="my-2 text-sm text-ink-500">{t('quiz.tasks')} {stage.completed_tasks}/{stage.total_tasks} · {t(`quiz.status_${stage.status}`)}</p>
      {stage.attempt_count > 0 && <p className="mb-3 text-sm">{t('quiz.first')} {stage.first_score}/5 · {t('quiz.latest')} {stage.latest_score}/5 · {stage.attempt_count} {t('quiz.attempts')}</p>}
      {data.assessment_available && (!data.read_only || stage.assessment_id) && <Link className="btn-ghost" href={`/${locale}/learning-path/${pathId}/stages/${stage.anchor_task_id}`}>{t(stage.assessment_id ? 'quiz.open' : 'quiz.start')}</Link>}
    </article>)}
  </section>;
}
