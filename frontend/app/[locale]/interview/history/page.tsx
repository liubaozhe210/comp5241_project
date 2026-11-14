'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { useInterview } from '../_components/InterviewProvider';
import { EmptyState, formatDate, InlineError, LoadingState, PageHeading } from '../_components/InterviewUI';
import { formatInterviewError, interviewStatusLabel } from '@/lib/interview/utils';
import type { InterviewLocale } from '@/lib/interview/types';

type Props = { params: { locale: InterviewLocale } };

export default function InterviewHistoryPage({ params: { locale } }: Props) {
  const t = useTranslations('interview');
  const { data, loading, loadError } = useInterview();
  const sessions = useMemo(
    () => [...(data?.sessions ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data?.sessions],
  );

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{formatInterviewError(new Error(loadError), locale)}</InlineError>;

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('history.eyebrow')}
        title={t('history.title')}
        description={t('history.description')}
        actions={<Link href={`/${locale}/interview`} className="btn-ghost">{t('backHome')}</Link>}
      />

      {sessions.length ? (
        <section className="space-y-3">
          {sessions.map((session) => {
            const resume = data.resumes.find((item) => item.id === session.resumeId);
            const destination = session.status === 'completed' && session.report
              ? `/${locale}/interview/interview/${session.id}/report`
              : `/${locale}/interview/interview/${session.id}`;
            const actionLabel = session.status === 'in_progress'
              ? t('history.continueInterview')
              : session.report
                ? t('history.viewReport')
                : t('history.viewRecord');

            return (
              <article className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" key={session.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">{session.jobTitle}</h2>
                    <span className={`badge ${session.status === 'completed' ? 'badge-ok' : session.status === 'abandoned' ? 'badge-grey' : 'badge-accent'}`}>
                      {interviewStatusLabel(session.status, locale)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{formatDate(session.createdAt, locale)}</p>
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-700">
                    <span>{t('history.progress', { asked: session.askedCount, total: session.questionLimit })}</span>
                    <span>
                      {t('history.resume')}: {resume?.title ?? (session.resumeId ? t('history.resumeUnavailable') : t('history.noResume'))}
                    </span>
                  </div>
                </div>
                <Link href={destination} className="btn-ghost shrink-0 self-start sm:self-center">{actionLabel}</Link>
              </article>
            );
          })}
        </section>
      ) : (
        <EmptyState
          title={t('history.empty')}
          body={t('history.emptyBody')}
          action={<Link className="btn" href={`/${locale}/interview/interview/config`}>{t('dashboard.mockInterview')}</Link>}
        />
      )}
    </div>
  );
}
