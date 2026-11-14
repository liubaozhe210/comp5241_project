'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../../_components/InterviewProvider';
import { useInterviewToast } from '../../../_components/Toast';
import { ConfirmButton, EmptyState, formatDate, InlineError, LoadingState, PageHeading } from '../../../_components/InterviewUI';
import { addInterviewTurnToReview, deleteInterviewSession } from '@/lib/interview/api';
import { formatInterviewError } from '@/lib/interview/utils';
import type { AppLocale } from '@/lib/i18n-config';
import type { InterviewLocale } from '@/lib/interview/types';

type RouteParams = { locale: AppLocale; id: string };

export default function InterviewReportPage() {
  const t = useTranslations('interview');
  const params = useParams<RouteParams>();
  const locale = params.locale as InterviewLocale;
  const router = useRouter();
  const { data, loading, loadError, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [error, setError] = useState('');
  const [addingTurnId, setAddingTurnId] = useState<string | null>(null);
  const session = useMemo(() => data?.sessions.find((item) => item.id === params.id) ?? null, [data, params.id]);

  async function addToReview(turnId: string) {
    if (!session) return;
    setAddingTurnId(turnId);
    try {
      await run(() => addInterviewTurnToReview(session.id, turnId));
      setError('');
      showToast(t('report.reviewAdded'), 'success');
    } catch (actionError) {
      const message = formatInterviewError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setAddingTurnId(null);
    }
  }

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
  const reviewSourceIds = new Set(
    data.reviews
      .filter((item) => item.source === 'mock_interview' && item.sourceId)
      .map((item) => item.sourceId),
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
      {error ? <InlineError>{error}</InlineError> : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
        <section className="card space-y-3 p-5 sm:p-6">
          {validAnswers.length ? validAnswers.map((turn, index) => {
            const turnId = turn.id.endsWith(':answer') ? turn.id.slice(0, -7) : turn.id;
            const addedToReview = reviewSourceIds.has(turnId);
            return (
              <article key={turn.id} className="rounded-xl border border-black/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{t('conversation.question', { count: index + 1, total: session.questionLimit })}</h2>
                  <button
                    className="btn-ghost text-xs"
                    type="button"
                    disabled={addedToReview || addingTurnId !== null}
                    onClick={() => void addToReview(turnId)}
                  >
                    {addedToReview ? t('report.alreadyAdded') : addingTurnId === turnId ? t('report.addingToReview') : t('report.addToReview')}
                  </button>
                </div>
                {questionByAnswerId.has(turn.id) ? (
                  <p className="mt-3 rounded-lg bg-ivory-100 p-3 text-xs leading-5"><b>{t('report.questionLabel')}:</b> {questionByAnswerId.get(turn.id)}</p>
                ) : null}
                <p className="mt-2 rounded-lg bg-ivory-100 p-3 text-xs leading-5"><b>{t('conversation.answer')}:</b> {turn.text}</p>
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
            );
          }) : <EmptyState title={t('report.noAnswers')} body={t('report.description')} />}
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="label">{t('conversation.eyebrow')}</p>
            <h2 className="mt-2 font-serif text-xl font-semibold">{session.jobTitle}</h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between gap-3"><dt>{t('config.interviewType')}</dt><dd className="font-semibold">{session.interviewType === 'mixed' ? t('config.mixed') : t('config.technicalOnly')}</dd></div>
              <div className="flex justify-between gap-3"><dt>{t('config.questionLimit')}</dt><dd className="font-semibold">{session.askedCount} / {session.questionLimit}</dd></div>
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
