'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useInterview } from '../_components/InterviewProvider';
import { useInterviewToast } from '../_components/Toast';
import { ConfirmButton, EmptyState, InlineError, LoadingState, PageHeading, ScoreBadge, Tabs } from '../_components/InterviewUI';
import {
  labelForReviewCategory,
  formatInterviewError,
} from '@/lib/interview/utils';
import {
  deleteReview,
  retryReview,
  updateReviewStatus,
} from '@/lib/interview/api';
import type { InterviewLocale, ReviewItem, ReviewStatus } from '@/lib/interview/types';

type Props = { params: { locale: InterviewLocale } };
type StatusFilter = ReviewStatus;

export default function WrongAnswerReviewPage({ params: { locale } }: Props) {
  const t = useTranslations('interview');
  const { data, loading, loadError, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const [detailsId, setDetailsId] = useState('');
  const [answerById, setAnswerById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.reviews.filter((item) => {
      const matchesStatus = item.masteryStatus === statusFilter;
      const matchesSearch = !needle || `${item.question} ${item.tags.join(' ')}`.toLowerCase().includes(needle);
      return matchesStatus && matchesSearch;
    });
  }, [data, statusFilter, search]);

  async function perform<T>(actionId: string, operation: () => Promise<T>, successMessage: string): Promise<T | null> {
    setError('');
    setBusy(actionId);
    try {
      const result = await run(operation);
      showToast(successMessage, 'success');
      return result;
    } catch (actionError) {
      const message = formatInterviewError(actionError, locale);
      setError(message);
      showToast(message, 'error');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function submitAnswer(item: ReviewItem) {
    const answer = answerById[item.id] ?? '';
    if (!answer.trim() || answer.trim().length > 8000) {
      setError(locale === 'zh' ? '回答需为 1–8,000 个字符。' : 'Answer must contain 1–8,000 characters.');
      return;
    }
    const updated = await perform(`retry-${item.id}`, () => retryReview(item.id, answer, locale), t('review.retryAnswer'));
    setAnswerById((current) => ({ ...current, [item.id]: '' }));
    if (updated?.masterySuggested && updated.lastScore !== null && updated.lastScore >= 80) {
      showToast(t('review.masterySuggested'), 'info');
    }
  }

  async function handleDelete(item: ReviewItem) {
    await perform(`delete-${item.id}`, () => deleteReview(item.id), t('review.delete'));
    setDetailsId('');
  }

  async function handleStatus(item: ReviewItem, status: ReviewStatus) {
    await perform(`status-${item.id}`, () => updateReviewStatus(item.id, status), t('review.updateStatus'));
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{formatInterviewError(new Error(loadError), locale)}</InlineError>;

  const notMastered = data.reviews.filter((item) => item.masteryStatus === 'pending').length;
  const masteredCount = data.reviews.length - notMastered;

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('review.eyebrow')}
        title={t('review.title')}
        description={t('review.description')}
        actions={
          <>
            <Link href={`/${locale}/interview`} className="btn-ghost">{t('backHome')}</Link>
          </>
        }
      />

      <div className="card p-4 sm:max-w-sm">
        <p className="label">{t('review.statsOpen')}</p>
        <p className="mt-2 font-serif text-3xl font-semibold">{notMastered}</p>
      </div>

      {error ? <InlineError>{error}</InlineError> : null}

      <section className="card p-5 sm:p-6">
        <Tabs
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          items={[
            { value: 'pending', label: t('review.pending'), count: notMastered },
            { value: 'mastered', label: t('review.mastered'), count: masteredCount },
          ]}
        />
        <div className="mt-4">
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('review.search')} />
        </div>

        <div className="mt-5 space-y-3">
          {filtered.length ? filtered.map((item) => {
            const expanded = detailsId === item.id;
            return (
              <article className="rounded-2xl border border-black/10 bg-ivory-50 p-4 sm:p-5" key={item.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-accent">{labelForReviewCategory(item.category, locale)}</span>
                  <span className="badge badge-grey">{t(`review.source${item.source === 'mock_interview' ? 'MockInterview' : 'Manual'}`)}</span>
                  <span className={`badge ${item.masteryStatus === 'mastered' ? 'badge-ok' : 'badge-err'}`}>
                    {t(`review.${item.masteryStatus}`)}
                  </span>
                  {item.lastScore !== null ? <ScoreBadge score={item.lastScore} /> : null}
                  {item.lastPracticedAt ? (
                    <time className="ml-auto text-[10px] text-ink-500">
                      {new Intl.DateTimeFormat(locale === 'zh' ? 'zh-Hans' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.lastPracticedAt))}
                    </time>
                  ) : null}
                </div>
                <h2 className="mt-3 text-base font-semibold leading-6">{item.question}</h2>
                {item.tags.length ? <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((tag) => <span className="rounded-full bg-ivory-200 px-2 py-1 text-[10px] text-ink-500" key={tag}>#{tag}</span>)}</div> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setDetailsId(expanded ? '' : item.id)}>
                    {expanded ? t('review.hideAnswer') : t('review.showAnswer')}
                  </button>
                  <select
                    className="input w-auto py-1.5 text-xs"
                    value={item.masteryStatus}
                    aria-label={t('review.updateStatus')}
                    onChange={(event) => void handleStatus(item, event.target.value as ReviewStatus)}
                    disabled={busy === `status-${item.id}`}
                  >
                    <option value="pending">{t('review.pending')}</option>
                    <option value="mastered">{t('review.mastered')}</option>
                  </select>
                  <ConfirmButton
                    danger
                    title={t('review.deleteTitle')}
                    message={t('review.deleteBody')}
                    confirmLabel={t('review.delete')}
                    cancelLabel={t('cancel')}
                    failureLabel={t('errors.UNKNOWN')}
                    onConfirm={() => handleDelete(item)}
                  />
                </div>

                {expanded ? (
                  <div className="mt-4 grid gap-4 border-t border-black/10 pt-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      {item.answerFramework ? (
                        <div className="rounded-xl bg-accent-soft/50 p-3">
                          <p className="label">{t('review.framework')}</p>
                          <p className="mt-1 text-xs leading-5">{item.answerFramework}</p>
                        </div>
                      ) : null}
                      {item.lastAnswer ? (
                        <div className="rounded-xl bg-ivory-100 p-3">
                          <p className="label">{t('review.lastAnswer')}</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{item.lastAnswer}</p>
                        </div>
                      ) : null}
                      {item.lastFeedback ? (
                        <div className="rounded-xl border border-amber-700/15 bg-amber-50 p-3">
                          <p className="label">{t('review.lastFeedback')}</p>
                          <p className="mt-1 text-xs leading-5">{item.lastFeedback}</p>
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <label className="block">
                        <span className="label">{t('review.lastAnswer')}</span>
                        <textarea className="input mt-2 min-h-40 resize-y" maxLength={8000} value={answerById[item.id] ?? ''} onChange={(event) => setAnswerById((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={t('review.answerPlaceholder')} />
                      </label>
                      <button type="button" className="btn mt-3 w-full" disabled={busy === `retry-${item.id}`} onClick={() => void submitAnswer(item)}>
                        {busy === `retry-${item.id}` ? t('review.retrying') : t('review.retryAnswer')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          }) : (
            <EmptyState title={t('review.empty')} body={t('review.emptyBody')} action={
              !data.reviews.length ? <Link className="btn" href={`/${locale}/interview/interview/config`}>{t('dashboard.mockInterview')}</Link> : undefined
            } />
          )}
        </div>
      </section>
    </div>
  );
}
