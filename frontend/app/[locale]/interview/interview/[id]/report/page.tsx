'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../../_components/InterviewProvider';
import { useInterviewToast } from '../../../_components/Toast';
import { ConfirmButton, EmptyState, formatDate, InlineError, LoadingState, PageHeading, ScoreBadge, Tabs } from '../../../_components/InterviewUI';
import { deleteInterviewSession } from '@/lib/interview/api';
import { formatInterviewError } from '@/lib/interview/utils';
import type { AppLocale } from '@/lib/i18n-config';
import type { InterviewDimensionKey, InterviewLocale } from '@/lib/interview/types';

type RouteParams = { locale: AppLocale; id: string };
type ReportTab = 'overview' | 'questions';

const dimensionKeys: InterviewDimensionKey[] = ['communication', 'technical_depth', 'problem_solving', 'job_fit'];
const scoreBreakdownKeys = ['correctness', 'completeness', 'clarity', 'relevance'] as const;

export default function InterviewReportPage() {
  const t = useTranslations('interview');
  const params = useParams<RouteParams>();
  const locale = params.locale as InterviewLocale;
  const router = useRouter();
  const { data, loading, loadError, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [tab, setTab] = useState<ReportTab>('overview');
  const [error, setError] = useState('');
  const session = useMemo(() => data?.sessions.find((item) => item.id === params.id) ?? null, [data, params.id]);

  async function removeSession() {
    if (!session) return;
    try {
      await run(() => deleteInterviewSession(session.id));
      showToast(locale === 'zh' ? '面试记录已删除。' : 'Interview record deleted.', 'success');
      router.push(`/${locale}/interview`);
    } catch (actionError) {
      const message = formatInterviewError(actionError, locale);
      setError(message);
      showToast(message, 'error');
      throw actionError;
    }
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{formatInterviewError(new Error(loadError), locale)}</InlineError>;
  if (!session) {
    return <EmptyState title={t('conversation.notFound')} body={t('conversation.notFoundBody')} action={<Link className="btn" href={`/${locale}/interview`}>{t('backHome')}</Link>} />;
  }
  if (!session.report) {
    return (
      <div className="card p-8 text-center">
        <p className="font-serif text-xl font-semibold">{t('report.empty')}</p>
        <Link className="btn mt-4" href={`/${locale}/interview/interview/${session.id}`}>{t('report.backToInterview')}</Link>
      </div>
    );
  }

  const validAnswers = session.turns.filter(
    (turn) =>
      turn.role === 'user' &&
      !turn.superseded &&
      turn.answerStatus !== 'skipped' &&
      turn.text.trim().length > 0,
  );
  const questionByAnswerId = new Map(
    session.turns
      .filter((turn) => turn.role === 'assistant')
      .map((turn) => [`${turn.id}:answer`, turn.text]),
  );

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('report.eyebrow')}
        title={t('report.title')}
        description={`${session.jobTitle} · ${formatDate(session.report.createdAt, locale)}`}
        actions={
          <>
            <Link href={`/${locale}/interview/history`} className="btn-ghost">{t('report.backToHistory')}</Link>
            <Link href={`/${locale}/interview/interview/config`} className="btn">{t('report.createAnother')}</Link>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <ScoreBadge score={session.report.overallScore} />
      </div>
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
        <section className="card p-5 sm:p-6">
          <Tabs
            value={tab}
            onChange={(value) => setTab(value as ReportTab)}
            items={[
              { value: 'overview', label: t('report.overall') },
              { value: 'questions', label: t('report.turnByTurn'), count: validAnswers.length },
            ]}
          />
          {tab === 'overview' ? (
            <div className="mt-5 space-y-6">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="label">{t('report.overall')}</p>
                    <p className="mt-1 font-serif text-5xl font-semibold">{session.report.overallScore}<span className="ml-1 text-lg text-ink-500">/100</span></p>
                  </div>
                  <div className="h-20 w-20 rounded-full border-[8px] border-accent-soft grid place-items-center text-sm font-bold text-accent">
                    {session.report.overallScore}
                  </div>
                </div>
              </div>
              <div>
                <h2 className="text-lg font-semibold">{t('report.communication')}</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {dimensionKeys.map((key) => {
                    const item = session.report?.dimensions[key];
                    if (!item) return null;
                    const label = key === 'technical_depth' ? 'technicalDepth' : key === 'problem_solving' ? 'problemSolving' : key === 'job_fit' ? 'jobFit' : key;
                    return (
                      <article key={key} className="rounded-xl border border-black/10 bg-ivory-50 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">{t(`report.${label}`)}</h3>
                          <ScoreBadge score={item.score} />
                        </div>
                        <p className="mt-2 text-xs leading-5 text-ink-500">{item.summary}</p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ivory-300">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${item.score ?? 0}%` }} />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-800/15 bg-emerald-50 p-4">
                  <h2 className="text-sm font-semibold">{t('report.strengths')}</h2>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-ink-700">
                    {session.report.strengths.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div className="rounded-xl border border-amber-700/15 bg-amber-50 p-4">
                  <h2 className="text-sm font-semibold">{t('report.improvements')}</h2>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-5 text-ink-700">
                    {session.report.improvements.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
              </div>
              <div className="rounded-xl border border-accent/15 bg-accent-soft/50 p-4 text-xs leading-5 text-ink-700">
                {t('report.reviewAdded')} {t('report.description')}
                <Link className="ml-1 font-semibold text-accent underline" href={`/${locale}/interview/review`}>{t('dashboard.wrongAnswerReview')}</Link>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {validAnswers.length ? validAnswers.map((turn, index) => (
                <article key={turn.id} className="rounded-xl border border-black/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold">{t('conversation.question', { count: index + 1, total: session.questionLimit })}</h2>
                    {turn.score !== undefined ? <ScoreBadge score={turn.score} /> : null}
                  </div>
                  {questionByAnswerId.has(turn.id) ? (
                    <p className="mt-3 rounded-lg bg-ivory-100 p-3 text-xs leading-5"><b>{t('report.questionLabel')}:</b> {questionByAnswerId.get(turn.id)}</p>
                  ) : null}
                  <p className="mt-2 rounded-lg bg-ivory-100 p-3 text-xs leading-5"><b>{t('conversation.answer')}:</b> {turn.text}</p>
                  <div className="mt-3">
                    <h3 className="label">{t('report.questionScoreBreakdown')}</h3>
                    {turn.scoreBreakdown ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {scoreBreakdownKeys.map((key) => (
                          <div key={key} className="rounded-lg bg-ivory-50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold">{t(`report.${key}`)}</span>
                              <span className="text-xs font-semibold tabular-nums">{turn.scoreBreakdown?.[key]}/25</span>
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-ink-500">{t(`report.${key}Description`)}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-ink-500">{t('report.scoreBreakdownUnavailable')}</p>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="label">{t('report.strengths')}</p>
                      <ul className="mt-1 list-inside list-disc text-xs leading-5 text-ink-700">{(turn.strengths ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                    <div>
                      <p className="label">{t('report.improvements')}</p>
                      <ul className="mt-1 list-inside list-disc text-xs leading-5 text-ink-700">{(turn.improvements ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  </div>
                </article>
              )) : <EmptyState title={t('report.noAnswers')} body={t('report.description')} />}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="label">{t('conversation.eyebrow')}</p>
            <h2 className="mt-2 font-serif text-xl font-semibold">{session.jobTitle}</h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between gap-3"><dt>{t('config.interviewType')}</dt><dd className="font-semibold">{session.interviewType === 'mixed' ? t('config.mixed') : t('config.technicalOnly')}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t('config.questionLimit')}</dt><dd className="font-semibold">{session.askedCount} / {session.questionLimit}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t('report.overall')}</dt><dd className="font-semibold">{session.report.overallScore}/100</dd></div>
            </dl>
          </div>
          <ConfirmButton
            danger
            title={t('report.deleteTitle')}
            message={t('report.deleteBody')}
            confirmLabel={t('review.delete')}
            cancelLabel={t('cancel')}
            failureLabel={t('errors.UNKNOWN')}
            onConfirm={removeSession}
          />
        </aside>
      </div>
    </div>
  );
}
