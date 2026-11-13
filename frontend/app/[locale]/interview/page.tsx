'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

import { useInterview } from './_components/InterviewProvider';
import { useInterviewToast } from './_components/Toast';
import { ConfirmButton, EmptyState, formatDate, InlineError, LoadingState, PageHeading, Tabs } from './_components/InterviewUI';
import { formatMockError } from '@/lib/interview/mock';
import type { AppLocale } from '@/lib/i18n-config';
import type { InterviewLocale } from '@/lib/interview/types';

type ActivityFilter = 'all' | 'assessments' | 'questionSets' | 'interviews';

export default function InterviewHomePage() {
  const t = useTranslations('interview');
  const params = useParams<{ locale: AppLocale }>();
  const locale = params.locale as InterviewLocale;
  const { data, loading, loadError, refresh, clearAll, resetDemo, failNextAi } = useInterview();
  const { showToast } = useInterviewToast();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const activities = useMemo(() => {
    if (!data) return [];
    return [
      ...data.assessments.map((item) => ({
        id: item.id,
        kind: 'assessments' as const,
        title: item.jobTitle || t('dashboard.resumeAssessment'),
        detail: `${t('resume.score')}: ${item.overallScore}/100`,
        date: item.createdAt,
        href: `/${locale}/interview/resume/assessment?assessmentId=${item.id}`,
      })),
      ...data.questionSets.map((item) => ({
        id: item.id,
        kind: 'questionSets' as const,
        title: item.title,
        detail: t('questions.questionCount', { count: item.items.length }),
        date: item.createdAt,
        href: `/${locale}/interview/resume/questions?setId=${item.id}`,
      })),
      ...data.sessions.map((item) => ({
        id: item.id,
        kind: 'interviews' as const,
        title: item.jobTitle,
        detail: item.report
          ? `${t('report.overall')}: ${item.report.overallScore}/100`
          : t(`conversation.${item.status === 'paused' ? 'pausedTitle' : 'eyebrow'}`),
        date: item.updatedAt,
        href:
          item.status === 'completed'
            ? `/${locale}/interview/interview/${item.id}/report`
            : `/${locale}/interview/interview/${item.id}`,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }, [data, locale, t]);

  const visibleActivities = activities.filter((item) => filter === 'all' || item.kind === filter);

  async function handleDataAction(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setActionError('');
    try {
      await action();
      showToast(successMessage, 'success');
    } catch (error) {
      setActionError(formatMockError(error, locale));
      showToast(formatMockError(error, locale), 'error');
    } finally {
      setBusy(false);
    }
  }

  function armFailure() {
    try {
      failNextAi();
      showToast(t('mockErrorArmed'), 'info');
    } catch {
      showToast(t('errors.BROWSER_STORAGE_UNAVAILABLE'), 'error');
    }
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) {
    return (
      <div className="space-y-4">
        <InlineError>{t('errors.MOCK_DATA_INVALID')}</InlineError>
        <button type="button" className="btn" onClick={() => void refresh()}>
          {t('retry')}
        </button>
        <button type="button" className="btn-ghost ml-2" onClick={() => void resetDemo()}>
          {t('restoreDemo')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl border border-accent/15 bg-accent-soft/70 px-4 py-3 text-xs leading-5 text-accent">
        {t('mockNotice')}
      </div>

      <PageHeading
        eyebrow={t('dashboard.eyebrow')}
        title={t('dashboard.title')}
        description={t('dashboard.description')}
        actions={
          <>
            <button type="button" className="btn-ghost px-3 py-2 text-xs" onClick={armFailure}>
              {t('mockError')}
            </button>
            <ConfirmButton
              danger
              disabled={busy}
              title={t('clearAllTitle')}
              message={t('clearAllMessage')}
              confirmLabel={busy ? t('working') : t('clearAll')}
              cancelLabel={t('cancel')}
              failureLabel={t('errors.UNKNOWN')}
              onConfirm={() => handleDataAction(clearAll, t('clearAll'))}
            />
            <button
              type="button"
              disabled={busy}
              className="btn-ghost px-3 py-2 text-xs"
              onClick={() => void handleDataAction(resetDemo, t('restoreDemo'))}
            >
              {t('restoreDemo')}
            </button>
          </>
        }
      />

      {actionError ? <InlineError>{actionError}</InlineError> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t('dashboard.resumeCount'), value: data.resumes.length },
          { label: t('dashboard.assessmentCount'), value: data.assessments.length },
          { label: t('dashboard.interviewCount'), value: data.sessions.length },
          { label: t('dashboard.reviewCount'), value: data.reviews.filter((item) => item.masteryStatus !== 'mastered').length },
        ].map((stat) => (
          <div className="card p-4" key={stat.label}>
            <p className="label">{stat.label}</p>
            <p className="mt-2 font-serif text-3xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold">{t('dashboard.modules')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              href: `/${locale}/interview/resume/assessment`,
              title: t('dashboard.resumeAssessment'),
              body: t('dashboard.resumeAssessmentBody'),
              number: '01',
            },
            {
              href: `/${locale}/interview/resume/questions`,
              title: t('dashboard.resumeQuestions'),
              body: t('dashboard.resumeQuestionsBody'),
              number: '02',
            },
            {
              href: `/${locale}/interview/interview/config`,
              title: t('dashboard.mockInterview'),
              body: t('dashboard.mockInterviewBody'),
              number: '03',
            },
            {
              href: `/${locale}/interview/review`,
              title: t('dashboard.wrongAnswerReview'),
              body: t('dashboard.wrongAnswerReviewBody'),
              number: '04',
            },
          ].map((item) => (
            <Link
              href={item.href}
              key={item.href}
              className="card group flex min-h-36 items-start gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="font-mono text-xs tracking-widest text-ink-500">{item.number}</span>
              <div>
                <h3 className="font-serif text-xl font-semibold group-hover:text-accent">{item.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-ink-500">{item.body}</p>
              </div>
              <span className="ml-auto text-accent transition group-hover:translate-x-1" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{t('dashboard.recent')}</h2>
            <p className="mt-1 text-xs text-ink-500">{t('dashboard.clearHint')}</p>
          </div>
        </div>
        <Tabs
          value={filter}
          onChange={(value) => setFilter(value as ActivityFilter)}
          items={[
            { value: 'all', label: t('dashboard.allActivity') },
            { value: 'assessments', label: t('dashboard.assessmentsTab') },
            { value: 'questionSets', label: t('dashboard.questionSetsTab') },
            { value: 'interviews', label: t('dashboard.interviewsTab') },
          ]}
        />
        <div className="mt-4 space-y-2">
          {visibleActivities.length ? (
            visibleActivities.map((item) => (
              <Link
                href={item.href}
                key={`${item.kind}-${item.id}`}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-black/10 bg-ivory-50 p-3 transition hover:border-accent/30"
              >
                <span className="badge badge-grey">{t(`dashboard.${item.kind === 'questionSets' ? 'questionSetsTab' : item.kind === 'assessments' ? 'assessmentsTab' : 'interviewsTab'}`)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
                <span className="text-xs text-ink-500">{item.detail}</span>
                <time className="text-xs text-ink-500">{formatDate(item.date, locale)}</time>
              </Link>
            ))
          ) : (
            <EmptyState
              title={t('dashboard.noActivity')}
              body={t('dashboard.noActivityBody')}
              action={
                <Link href={`/${locale}/interview/resume/assessment`} className="btn">
                  {t('dashboard.resumeAssessment')}
                </Link>
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}
