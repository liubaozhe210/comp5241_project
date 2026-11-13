'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { LearningPath } from '@/lib/learning-path';
import type { AppLocale } from '@/lib/i18n-config';

export function LearningPathCompletion({ plan, locale, compact = false }: { plan: LearningPath; locale: AppLocale; compact?: boolean }) {
  const t = useTranslations();
  if (plan.status !== 'ready') return null;
  return <div className="space-y-2 text-sm">
    <p className={plan.plan_completed ? 'font-semibold text-accent' : 'text-ink-500'} role="status">{t(`learningPath.completion_${plan.completion_status}`)}</p>
    <p>{t('learningPath.stagesPassed')} {plan.passed_stages}/{plan.total_stages}</p>
    {!compact && <>
      <p className="text-ink-500">{t('learningPath.completionRule')}</p>
      {plan.next_assessment_anchor && <Link className="btn-ghost inline-block" href={`/${locale}/learning-path/${plan.id}?version=${encodeURIComponent(plan.version_id)}#stage-quiz-${plan.next_assessment_anchor}`}>{t('learningPath.continueQuiz')}</Link>}
    </>}
  </div>;
}
