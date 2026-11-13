'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../_components/InterviewProvider';
import { useInterviewToast } from '../../_components/Toast';
import { ConfirmButton, EmptyState, InlineError, LoadingState, PageHeading, Tabs } from '../../_components/InterviewUI';
import {
  addFollowUps,
  deleteQuestionSet,
  formatMockError,
  generateAnotherQuestion,
  generateQuestionSet,
  labelForCategory,
  labelForLevel,
  updateQuestionItem,
} from '@/lib/interview/mock';
import type { InterviewLocale, MasteryStatus, QuestionCategory, ResumeLevel } from '@/lib/interview/types';

type Props = { params: { locale: InterviewLocale }; searchParams: { setId?: string } };
type InputMode = 'saved' | 'excerpt';
type CategoryFilter = 'all' | QuestionCategory;

export default function ResumeQuestionsPage({ params: { locale }, searchParams }: Props) {
  const t = useTranslations('interview');
  const { data, loading, loadError, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [mode, setMode] = useState<InputMode>('saved');
  const [resumeId, setResumeId] = useState('');
  const [experience, setExperience] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [seniority, setSeniority] = useState<ResumeLevel>('junior');
  const [consent, setConsent] = useState(false);
  const [setId, setSetId] = useState(searchParams.setId ?? '');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');

  const selectedResume = data?.resumes.find((item) => item.id === resumeId) ?? null;
  const selectedSet = useMemo(
    () => data?.questionSets.find((item) => item.id === setId) ?? data?.questionSets[0] ?? null,
    [data, setId],
  );
  const filteredItems = selectedSet?.items.filter((item) => category === 'all' || item.category === category) ?? [];

  useEffect(() => {
    if (!data) return;
    if (!resumeId && data.resumes[0]) setResumeId(data.resumes[0].id);
    if (setId && !data.questionSets.some((item) => item.id === setId)) setSetId('');
  }, [data, resumeId, setId]);

  async function handleGenerate() {
    setError('');
    if (!consent) {
      setError(locale === 'zh' ? '请先确认本地模拟说明。' : 'Confirm the local mock notice first.');
      return;
    }
    const text = mode === 'saved' ? selectedResume?.text ?? '' : experience;
    if (!text.trim()) {
      setError(t('questions.noQuestionSetsBody'));
      return;
    }
    setBusyAction('generate');
    try {
      const questionSet = await run(() =>
        generateQuestionSet({
          resumeId: mode === 'saved' ? resumeId || null : null,
          experience: text,
          jobTitle: jobTitle || selectedResume?.jobTitle || '',
          seniority,
          locale,
        }),
      );
      setSetId(questionSet.id);
      setCategory('all');
      setConsent(false);
      showToast(t('questions.generated'), 'success');
    } catch (actionError) {
      const message = formatMockError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusyAction('');
    }
  }

  async function handleQuestionAction(actionId: string, operation: () => Promise<unknown>, success: string) {
    setError('');
    setBusyAction(actionId);
    try {
      await run(operation);
      showToast(success, 'success');
    } catch (actionError) {
      const message = formatMockError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusyAction('');
    }
  }

  async function handleDeleteSet() {
    if (!selectedSet) return;
    await run(() => deleteQuestionSet(selectedSet.id));
    setSetId('');
    showToast(locale === 'zh' ? '题集已删除。' : 'Question set deleted.', 'success');
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{t('errors.MOCK_DATA_INVALID')}</InlineError>;

  return (
    <div className="space-y-7">
      <PageHeading
        eyebrow={t('questions.eyebrow')}
        title={t('questions.title')}
        description={t('questions.description')}
        actions={<Link href={`/${locale}/interview`} className="btn-ghost">{t('backHome')}</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(300px,.8fr)_minmax(0,1.2fr)]">
        <section className="card h-fit p-5 sm:p-6">
          <Tabs
            value={mode}
            onChange={(value) => setMode(value as InputMode)}
            items={[
              { value: 'saved', label: t('questions.savedResume') },
              { value: 'excerpt', label: t('questions.projectText') },
            ]}
          />
          <div className="mt-5 space-y-4">
            {mode === 'saved' ? (
              data.resumes.length ? (
                <label className="block">
                  <span className="label">{t('questions.savedResume')}</span>
                  <select className="input mt-2" value={resumeId} onChange={(event) => setResumeId(event.target.value)}>
                    <option value="">{t('resume.selectResume')}</option>
                    {data.resumes.map((resume) => <option value={resume.id} key={resume.id}>{resume.title}</option>)}
                  </select>
                </label>
              ) : (
                <EmptyState
                  title={t('resume.noResumes')}
                  body={t('resume.noResumesBody')}
                  action={<Link className="btn" href={`/${locale}/interview/resume/assessment`}>{t('dashboard.resumeAssessment')}</Link>}
                />
              )
            ) : (
              <label className="block">
                <span className="label">{t('questions.projectText')}</span>
                <textarea className="input mt-2 min-h-40 resize-y" value={experience} onChange={(event) => setExperience(event.target.value)} placeholder={t('questions.experiencePlaceholder')} maxLength={30000} />
                <span className="mt-1 block text-right text-[11px] text-ink-500">{experience.length.toLocaleString()} / 30,000</span>
              </label>
            )}

            <label className="block">
              <span className="label">{t('resume.targetRole')}</span>
              <input className="input mt-2" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder={t('resume.targetRolePlaceholder')} maxLength={120} />
            </label>
            <label className="block">
              <span className="label">{t('questions.eyebrow')} · {t('resume.seniority')}</span>
              <select className="input mt-2" value={seniority} onChange={(event) => setSeniority(event.target.value as ResumeLevel)}>
                {(['intern', 'junior', 'mid', 'senior', 'unspecified'] as ResumeLevel[]).map((level) => <option key={level} value={level}>{labelForLevel(level, locale)}</option>)}
              </select>
            </label>
            <div className="rounded-xl border border-accent/15 bg-accent-soft/50 p-3">
              <p className="text-xs leading-5 text-ink-700">{t('config.privacy')}</p>
              <label className="mt-2 flex items-start gap-2 text-xs">
                <input type="checkbox" className="mt-0.5 accent-accent" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                <span>{t('resume.consent')}</span>
              </label>
            </div>
            {error ? <InlineError>{error}</InlineError> : null}
            <button type="button" className="btn w-full" disabled={busyAction === 'generate' || (mode === 'saved' && !selectedResume)} onClick={() => void handleGenerate()}>
              {busyAction === 'generate' ? t('questions.generating') : t('questions.generate')}
            </button>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label">{t('questions.questionSets')}</p>
              <h2 className="mt-1 font-serif text-2xl font-semibold">{selectedSet?.title ?? t('questions.noQuestionSets')}</h2>
              {selectedSet ? <p className="mt-1 text-xs text-ink-500">{selectedSet.jobTitle} · {formatDateSafe(selectedSet.createdAt, locale)} · {t('questions.questionCount', { count: selectedSet.items.length })}</p> : null}
            </div>
            {selectedSet ? (
              <ConfirmButton
                danger
                title={t('questions.deleteSetTitle')}
                message={t('questions.deleteSetMessage')}
                confirmLabel={t('questions.deleteSet')}
                cancelLabel={t('cancel')}
                failureLabel={t('errors.UNKNOWN')}
                onConfirm={handleDeleteSet}
              />
            ) : null}
          </div>

          {error ? <div className="mt-4"><InlineError>{error}</InlineError></div> : null}

          {!selectedSet ? (
            <div className="mt-5">
              <EmptyState title={t('questions.noQuestionSets')} body={t('questions.noQuestionSetsBody')} />
            </div>
          ) : (
            <>
              <div className="mt-5">
                <Tabs
                  value={category}
                  onChange={(value) => setCategory(value as CategoryFilter)}
                  items={[
                    { value: 'all', label: t('questions.allCategories'), count: selectedSet.items.length },
                    ...([
                      ['self_intro', 'selfIntro'],
                      ['behavioral', 'behavioral'],
                      ['project_deep_dive', 'projectDeepDive'],
                      ['technical', 'technical'],
                      ['pressure', 'pressure'],
                    ] as Array<[QuestionCategory, string]>).map(([key, translation]) => ({
                      value: key,
                      label: t(`questions.${translation}`),
                      count: selectedSet.items.filter((item) => item.category === key).length,
                    })),
                  ]}
                />
              </div>
              <div className="mt-4 space-y-4">
                {filteredItems.map((item, index) => (
                  <article className="rounded-2xl border border-black/10 bg-ivory-50 p-4 sm:p-5" key={item.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge badge-accent">{labelForCategory(item.category, locale)}</span>
                      <span className="badge badge-grey">{t(`questions.status${item.masteryStatus === 'not_started' ? 'NotStarted' : item.masteryStatus === 'in_progress' ? 'InProgress' : item.masteryStatus === 'mastered' ? 'Mastered' : 'NeedsReview'}`)}</span>
                      {item.isFavorite ? <span className="badge badge-warn">★</span> : null}
                      <span className="ml-auto font-mono text-[10px] text-ink-500">#{index + 1}</span>
                    </div>
                    <h3 className="mt-3 text-base font-semibold leading-6">{item.prompt}</h3>
                    {item.sourceExcerpt ? <p className="mt-2 rounded-lg bg-ivory-100 p-3 text-xs leading-5 text-ink-700"><b>{t('questions.sourceExcerpt')}:</b> {item.sourceExcerpt}</p> : null}
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-black/5 p-3">
                        <p className="label">{t('questions.assessmentFocus')}</p>
                        <p className="mt-1 text-xs leading-5 text-ink-700">{item.assessmentFocus}</p>
                      </div>
                      <div className="rounded-lg border border-black/5 p-3">
                        <p className="label">{t('questions.framework')}</p>
                        <p className="mt-1 text-xs leading-5 text-ink-700">{item.answerFramework}</p>
                      </div>
                      <div className="rounded-lg border border-black/5 p-3 sm:col-span-2">
                        <p className="label">{t('questions.sampleAnswer')}</p>
                        <p className="mt-1 text-xs leading-5 text-ink-700">{item.sampleAnswer}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className="label">{t('questions.pitfalls')}</p>
                      <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-ink-700">
                        {item.pitfalls.map((pitfall) => <li key={pitfall}>{pitfall}</li>)}
                      </ul>
                    </div>
                    {item.followUps.length ? (
                      <div className="mt-3 rounded-lg bg-accent-soft/60 p-3">
                        <p className="label">{t('questions.followUps')}</p>
                        <ul className="mt-1 list-inside list-decimal text-xs leading-5">
                          {item.followUps.map((followUp, followIndex) => <li key={`${item.id}-${followIndex}`}>{followUp}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyAction === `favorite-${item.id}`}
                        className="btn-ghost px-3 py-1.5 text-xs"
                        onClick={() => void handleQuestionAction(`favorite-${item.id}`, () => updateQuestionItem(selectedSet.id, item.id, { isFavorite: !item.isFavorite }, locale), item.isFavorite ? t('questions.unfavorite') : t('questions.favorite'))}
                      >
                        {item.isFavorite ? t('questions.unfavorite') : t('questions.favorite')}
                      </button>
                      <select
                        className="input w-auto py-1.5 text-xs"
                        value={item.masteryStatus}
                        aria-label={t('questions.markNeedsReview')}
                        onChange={(event) => void handleQuestionAction(`status-${item.id}`, () => updateQuestionItem(selectedSet.id, item.id, { masteryStatus: event.target.value as MasteryStatus }, locale), t('questions.statusInProgress'))}
                      >
                        <option value="not_started">{t('questions.statusNotStarted')}</option>
                        <option value="in_progress">{t('questions.statusInProgress')}</option>
                        <option value="needs_review">{t('questions.statusNeedsReview')}</option>
                        <option value="mastered">{t('questions.statusMastered')}</option>
                      </select>
                      <button type="button" disabled={busyAction === `follow-${item.id}`} className="btn-ghost px-3 py-1.5 text-xs" onClick={() => void handleQuestionAction(`follow-${item.id}`, () => addFollowUps(selectedSet.id, item.id, locale), t('questions.followUps'))}>
                        {t('questions.generateFollowUps')}
                      </button>
                      <button type="button" disabled={busyAction === `another-${item.id}`} className="btn-ghost px-3 py-1.5 text-xs" onClick={() => void handleQuestionAction(`another-${item.id}`, () => generateAnotherQuestion(selectedSet.id, item.id, locale), t('questions.generated'))}>
                        {t('questions.generateAnother')}
                      </button>
                    </div>
                  </article>
                ))}
                {!filteredItems.length ? <EmptyState title={t('questions.allCategories')} body={t('questions.noQuestionSetsBody')} /> : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function formatDateSafe(value: string, locale: InterviewLocale) {
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-Hans' : 'en', { dateStyle: 'medium' }).format(new Date(value));
}
