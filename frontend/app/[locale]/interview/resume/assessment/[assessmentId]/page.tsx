'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../../_components/InterviewProvider';
import { useInterviewToast } from '../../../_components/Toast';
import {
  ConfirmButton,
  EmptyState,
  formatDate,
  InlineError,
  LoadingState,
  PageHeading,
} from '../../../_components/InterviewUI';
import { deleteAssessment } from '@/lib/interview/api';
import { formatInterviewError } from '@/lib/interview/utils';
import type { InterviewLocale } from '@/lib/interview/types';

type RouteParams = { locale: InterviewLocale; assessmentId: string };

export default function ResumeAssessmentReportPage() {
  const t = useTranslations('interview');
  const params = useParams<RouteParams>();
  const { data, loading, loadError, run } = useInterview();
  const { showToast } = useInterviewToast();
  const router = useRouter();
  const [error, setError] = useState('');
  const assessment = useMemo(
    () => data?.assessments.find((item) => item.id === params.assessmentId) ?? null,
    [data, params.assessmentId],
  );

  async function removeReport() {
    if (!assessment) return;
    try {
      await run(() => deleteAssessment(assessment.id));
      showToast(t('resume.reportDeleted'), 'success');
      router.push(`/${params.locale}/interview/resume/assessment`);
    } catch (actionError) {
      const message = formatInterviewError(actionError, params.locale);
      setError(message);
      showToast(message, 'error');
      throw actionError;
    }
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{formatInterviewError(new Error(loadError), params.locale)}</InlineError>;
  if (!assessment) {
    return (
      <EmptyState
        title={t('resume.reportNotFound')}
        body={t('resume.emptyReport')}
        action={<Link className="btn" href={`/${params.locale}/interview/resume/assessment`}>{t('resume.assessmentTitle')}</Link>}
      />
    );
  }
  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('resume.report')}
        title={assessment.jobTitle || t('resume.unspecified')}
        description={`${t('resume.generatedAt')}: ${formatDate(assessment.createdAt, params.locale)}`}
        actions={
          <>
            <Link href={`/${params.locale}/interview/resume/assessment`} className="btn-ghost">{t('resume.assessmentTitle')}</Link>
          </>
        }
      />

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(250px,.6fr)]">
        <section className="card p-5 sm:p-6">
          <h2 className="text-lg font-semibold">{t('resume.recommendations')}</h2>
          {assessment.recommendations.length ? (
            <div className="mt-4 space-y-3">
              {assessment.recommendations.map((item, index) => (
                <article key={`${item.section}-${index}`} className="rounded-xl border border-black/10 p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <h3 className="text-sm font-semibold">{item.section}</h3>
                    <span className={`badge ${item.priority === 'high' ? 'badge-err' : item.priority === 'medium' ? 'badge-warn' : 'badge-grey'}`}>
                      {t(`resume.priority${item.priority[0].toUpperCase()}${item.priority.slice(1)}`)}
                    </span>
                  </div>
                  {item.sourceExcerpt ? <p className="mt-3 rounded-lg bg-ivory-100 p-3 text-xs leading-5">{item.sourceExcerpt}</p> : null}
                  <p className="mt-3 text-xs leading-5 text-ink-700"><b>{t('resume.issue')}:</b> {item.issue}</p>
                  <p className="mt-3 rounded-lg bg-ivory-100 p-3 text-xs leading-5"><b>{t('resume.rewrite')}:</b> {item.rewriteExample}</p>
                  <p className="mt-3 text-xs leading-5 text-ink-500"><b>{t('resume.reason')}:</b> {item.reason}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4"><EmptyState title={t('resume.noRecommendations')} body={t('resume.noRecommendationsBody')} /></div>
          )}
        </section>

        <aside className="space-y-4">
          <section className="card p-5">
            <p className="label">{t('resume.savedResumes')}</p>
            <p className="mt-2 text-sm font-semibold">{data.resumes.find((item) => item.id === assessment.resumeId)?.title ?? t('resume.unspecified')}</p>
            <p className="mt-1 text-xs text-ink-500">{assessment.jobTitle || t('resume.unspecified')}</p>
          </section>
          {assessment.riskFlags.length ? (
            <section className="rounded-2xl border border-amber-700/20 bg-amber-50 p-5">
              <h2 className="text-sm font-semibold">{t('resume.riskFlags')}</h2>
              <div className="mt-3 space-y-3">
                {assessment.riskFlags.map((risk, index) => (
                  <div key={`${risk.category}-${index}`} className="text-xs leading-5">
                    <p className="font-semibold">{risk.category}</p>
                    <p className="mt-1">{risk.evidence}</p>
                    <p className="mt-1 text-ink-700">{risk.suggestion}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <ConfirmButton
            danger
            title={t('resume.deleteAssessment')}
            message={t('resume.deleteReportBody')}
            confirmLabel={t('resume.deleteAssessment')}
            cancelLabel={t('cancel')}
            failureLabel={t('errors.UNKNOWN')}
            onConfirm={removeReport}
          />
        </aside>
      </div>
    </div>
  );
}
