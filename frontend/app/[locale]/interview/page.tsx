'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';

import { useInterview } from './_components/InterviewProvider';
import { useInterviewToast } from './_components/Toast';
import { ConfirmButton, InlineError, LoadingState, PageHeading } from './_components/InterviewUI';
import { formatInterviewError } from '@/lib/interview/utils';
import type { AppLocale } from '@/lib/i18n-config';
import type { InterviewLocale } from '@/lib/interview/types';

export default function InterviewHomePage() {
  const t = useTranslations('interview');
  const params = useParams<{ locale: AppLocale }>();
  const locale = params.locale as InterviewLocale;
  const { data, aiAvailable, loading, loadError, refresh, clearAll } = useInterview();
  const { showToast } = useInterviewToast();
  const [busy, setBusy] = useState(false);

  async function clearData() {
    setBusy(true);
    try {
      await clearAll();
      showToast(t('clearAll'), 'success');
    } catch (error) {
      showToast(formatInterviewError(error, locale), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) {
    return (
      <div className="space-y-4">
        <InlineError>{formatInterviewError(new Error(loadError), locale)}</InlineError>
        <button type="button" className="btn" onClick={() => void refresh()}>
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {!aiAvailable ? (
        <div className="rounded-2xl border border-amber-700/20 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          {t('aiNotConfigured')}
        </div>
      ) : null}
      <div className="flex justify-end">
        <ConfirmButton
          danger
          disabled={busy}
          title={t('clearAllTitle')}
          message={t('clearAllMessage')}
          confirmLabel={busy ? t('working') : t('clearAll')}
          cancelLabel={t('cancel')}
          failureLabel={t('errors.UNKNOWN')}
          onConfirm={clearData}
        />
      </div>

      <PageHeading
        eyebrow={t('dashboard.eyebrow')}
        title={t('dashboard.title')}
        description={t('dashboard.description')}
      />

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
              href: `/${locale}/interview/interview/config`,
              title: t('dashboard.mockInterview'),
              body: t('dashboard.mockInterviewBody'),
              number: '02',
            },
            {
              href: `/${locale}/interview/review`,
              title: t('dashboard.wrongAnswerReview'),
              body: t('dashboard.wrongAnswerReviewBody'),
              number: '03',
            },
            {
              href: `/${locale}/interview/history`,
              title: t('dashboard.interviewHistory'),
              body: t('dashboard.interviewHistoryBody'),
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

    </div>
  );
}
