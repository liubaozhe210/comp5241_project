'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useInterview } from '../_components/InterviewProvider';
import { useInterviewToast } from '../_components/Toast';
import { ConfirmButton, EmptyState, InlineError, LoadingState, Modal, PageHeading, ScoreBadge, Tabs } from '../_components/InterviewUI';
import {
  createManualReview,
  deleteReview,
  formatMockError,
  generateReviewVariants,
  labelForCategory,
  retryReview,
  updateReviewStatus,
} from '@/lib/interview/mock';
import type { InterviewLocale, QuestionCategory, ReviewItem, ReviewStatus } from '@/lib/interview/types';

type Props = { params: { locale: InterviewLocale } };
type StatusFilter = 'all' | ReviewStatus;
type SourceFilter = 'all' | ReviewItem['source'];

export default function WrongAnswerReviewPage({ params: { locale } }: Props) {
  const t = useTranslations('interview');
  const { data, loading, loadError, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | QuestionCategory>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [search, setSearch] = useState('');
  const [detailsId, setDetailsId] = useState('');
  const [answerById, setAnswerById] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState('');
  const [newCategory, setNewCategory] = useState<QuestionCategory>('behavioral');
  const [newTags, setNewTags] = useState('');
  const [newFramework, setNewFramework] = useState('');

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    return data.reviews.filter((item) => {
      const matchesStatus = statusFilter === 'all' || item.masteryStatus === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter;
      const matchesSearch = !needle || `${item.question} ${item.tags.join(' ')}`.toLowerCase().includes(needle);
      return matchesStatus && matchesCategory && matchesSource && matchesSearch;
    });
  }, [data, statusFilter, categoryFilter, sourceFilter, search]);

  async function perform(actionId: string, operation: () => Promise<unknown>, successMessage: string) {
    setError('');
    setBusy(actionId);
    try {
      await run(operation);
      showToast(successMessage, 'success');
    } catch (actionError) {
      const message = formatMockError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function addQuestion() {
    if (!newQuestion.trim()) {
      setError(locale === 'zh' ? '请输入问题内容。' : 'Enter a question first.');
      return;
    }
    setBusy('add');
    setError('');
    try {
      await run(() =>
        createManualReview({
          question: newQuestion,
          category: newCategory,
          tags: newTags.split(',').map((tag) => tag.trim()).filter(Boolean),
          answerFramework: newFramework,
        }),
      );
      setNewQuestion('');
      setNewTags('');
      setNewFramework('');
      setAddOpen(false);
      showToast(t('review.manualAdded'), 'success');
    } catch (actionError) {
      const message = formatMockError(actionError, locale);
      setError(message);
      showToast(message, 'error');
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
    await perform(`retry-${item.id}`, () => retryReview(item.id, answer, locale), t('review.retryAnswer'));
    setAnswerById((current) => ({ ...current, [item.id]: '' }));
  }

  async function handleDelete(item: ReviewItem) {
    await perform(`delete-${item.id}`, () => deleteReview(item.id), t('review.delete'));
    setDetailsId('');
  }

  async function handleStatus(item: ReviewItem, status: ReviewStatus) {
    await perform(`status-${item.id}`, () => updateReviewStatus(item.id, status), t('review.updateStatus'));
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{t('errors.MOCK_DATA_INVALID')}</InlineError>;

  const notMastered = data.reviews.filter((item) => item.masteryStatus !== 'mastered').length;
  const masteredCount = data.reviews.length - notMastered;

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('review.eyebrow')}
        title={t('review.title')}
        description={t('review.description')}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAddOpen(true)}>{t('review.addManual')}</button>
            <Link href={`/${locale}/interview`} className="btn-ghost">{t('backHome')}</Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [t('review.statsTotal'), data.reviews.length],
          [t('review.statsMastered'), masteredCount],
          [t('review.statsOpen'), notMastered],
        ].map(([label, value]) => (
          <div className="card p-4" key={String(label)}>
            <p className="label">{label}</p>
            <p className="mt-2 font-serif text-3xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {error ? <InlineError>{error}</InlineError> : null}

      <section className="card p-5 sm:p-6">
        <Tabs
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          items={[
            { value: 'all', label: t('review.all'), count: data.reviews.length },
            { value: 'not_reviewed', label: t('review.notReviewed'), count: data.reviews.filter((item) => item.masteryStatus === 'not_reviewed').length },
            { value: 'in_progress', label: t('review.inProgress'), count: data.reviews.filter((item) => item.masteryStatus === 'in_progress').length },
            { value: 'mastered', label: t('review.mastered'), count: masteredCount },
          ]}
        />
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(150px,.65fr)_minmax(150px,.65fr)]">
          <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('review.search')} />
          <select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}>
            <option value="all">{t('review.allCategories')}</option>
            {(['self_intro', 'behavioral', 'project_deep_dive', 'technical', 'pressure'] as QuestionCategory[]).map((category) => <option value={category} key={category}>{labelForCategory(category, locale)}</option>)}
          </select>
          <select className="input" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
            <option value="all">{t('review.allSources')}</option>
            <option value="mock_interview">{t('review.sourceMockInterview')}</option>
            <option value="question_set">{t('review.sourceQuestionSet')}</option>
            <option value="manual">{t('review.sourceManual')}</option>
          </select>
        </div>

        <div className="mt-5 space-y-3">
          {filtered.length ? filtered.map((item) => {
            const expanded = detailsId === item.id;
            return (
              <article className="rounded-2xl border border-black/10 bg-ivory-50 p-4 sm:p-5" key={item.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge badge-accent">{labelForCategory(item.category, locale)}</span>
                  <span className="badge badge-grey">{t(`review.source${item.source === 'mock_interview' ? 'MockInterview' : item.source === 'question_set' ? 'QuestionSet' : 'Manual'}`)}</span>
                  <span className={`badge ${item.masteryStatus === 'mastered' ? 'badge-ok' : item.masteryStatus === 'in_progress' ? 'badge-warn' : 'badge-err'}`}>
                    {t(`review.${item.masteryStatus === 'mastered' ? 'mastered' : item.masteryStatus === 'in_progress' ? 'inProgress' : 'notReviewed'}`)}
                  </span>
                  <span className="ml-auto text-[10px] text-ink-500">{item.attempts.length} {t('review.attemptHistory').toLowerCase()}</span>
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
                    <option value="not_reviewed">{t('review.notReviewed')}</option>
                    <option value="in_progress">{t('review.inProgress')}</option>
                    <option value="mastered">{t('review.mastered')}</option>
                  </select>
                  <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === `variants-${item.id}`} onClick={() => void perform(`variants-${item.id}`, () => generateReviewVariants(item.id, locale), t('review.variantsAdded'))}>
                    {t('review.variants')}
                  </button>
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
                          <p className="label">{t('questions.framework')}</p>
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
                      {item.attempts.length ? (
                        <div>
                          <p className="label">{t('review.attemptHistory')}</p>
                          <div className="mt-2 space-y-2">
                            {item.attempts.map((attempt) => (
                              <div className="rounded-lg border border-black/10 p-3" key={attempt.id}>
                                <div className="flex items-center justify-between gap-2"><time className="text-[10px] text-ink-500">{new Intl.DateTimeFormat(locale === 'zh' ? 'zh-Hans' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(attempt.createdAt))}</time><ScoreBadge score={attempt.score} /></div>
                                <p className="mt-2 text-xs leading-5">{attempt.answer}</p>
                                <p className="mt-1 text-xs leading-5 text-ink-500">{attempt.feedback}</p>
                              </div>
                            ))}
                          </div>
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
              !data.reviews.length ? <Link className="btn" href={`/${locale}/interview/resume/questions`}>{t('dashboard.resumeQuestions')}</Link> : undefined
            } />
          )}
        </div>
      </section>

      {addOpen ? (
        <Modal title={t('review.addTitle')} onClose={() => setAddOpen(false)}>
          <div className="space-y-4">
            <label className="block">
              <span className="label">{t('review.question')}</span>
              <textarea className="input mt-2 min-h-28 resize-y" maxLength={2000} value={newQuestion} onChange={(event) => setNewQuestion(event.target.value)} placeholder={t('review.questionPlaceholder')} />
            </label>
            <label className="block">
              <span className="label">{t('review.category')}</span>
              <select className="input mt-2" value={newCategory} onChange={(event) => setNewCategory(event.target.value as QuestionCategory)}>
                {(['self_intro', 'behavioral', 'project_deep_dive', 'technical', 'pressure'] as QuestionCategory[]).map((category) => <option value={category} key={category}>{labelForCategory(category, locale)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">{t('review.tags')}</span>
              <input className="input mt-2" value={newTags} onChange={(event) => setNewTags(event.target.value)} placeholder="STAR, React" />
            </label>
            <label className="block">
              <span className="label">{t('review.framework')}</span>
              <textarea className="input mt-2 min-h-20 resize-y" value={newFramework} onChange={(event) => setNewFramework(event.target.value)} />
            </label>
            {error ? <InlineError>{error}</InlineError> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setAddOpen(false)}>{t('cancel')}</button>
              <button type="button" className="btn" disabled={busy === 'add'} onClick={() => void addQuestion()}>{busy === 'add' ? t('saving') : t('review.saveQuestion')}</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
