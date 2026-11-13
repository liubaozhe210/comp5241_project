'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../_components/InterviewProvider';
import { useInterviewToast } from '../../_components/Toast';
import { ConfirmButton, InlineError, LoadingState, PageHeading, Tabs } from '../../_components/InterviewUI';
import {
  finishInterview,
  formatMockError,
  interviewPhaseLabel,
  interviewStatusLabel,
  pauseInterview,
  redoLastAnswer,
  resumeInterview,
  sendInterviewAnswer,
} from '@/lib/interview/mock';
import type { AppLocale } from '@/lib/i18n-config';
import type { InterviewLocale } from '@/lib/interview/types';

type InterviewRouteParams = { locale: AppLocale; id: string };
type ViewTab = 'transcript' | 'guide';

export default function InterviewConversationPage() {
  const t = useTranslations('interview');
  const params = useParams<InterviewRouteParams>();
  const locale = params.locale as InterviewLocale;
  const router = useRouter();
  const { data, loading, loadError, refresh, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [answer, setAnswer] = useState('');
  const [tab, setTab] = useState<ViewTab>('transcript');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const session = useMemo(() => data?.sessions.find((item) => item.id === params.id) ?? null, [data, params.id]);

  async function submitAnswer() {
    if (!session) return;
    if (!answer.trim() || answer.trim().length > 8000) {
      setError(t('conversation.answerLimit'));
      return;
    }
    setBusy('answer');
    setError('');
    try {
      await run(() => sendInterviewAnswer(session.id, answer, locale));
      setAnswer('');
      showToast(locale === 'zh' ? '回答已保存在本地。' : 'Your answer was saved locally.', 'success');
    } catch (actionError) {
      const message = formatMockError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function finish() {
    if (!session) return;
    setBusy('finish');
    setError('');
    try {
      await run(() => finishInterview(session.id, locale));
      showToast(locale === 'zh' ? '面试复盘已生成。' : 'Interview review generated.', 'success');
      router.push(`/${locale}/interview/interview/${session.id}/report`);
    } catch (actionError) {
      await refresh();
      const message = formatMockError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function updateSession(actionName: string, operation: () => Promise<void>, successMessage: string) {
    if (!session) return;
    setBusy(actionName);
    setError('');
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

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{t('errors.MOCK_DATA_INVALID')}</InlineError>;
  if (!session) {
    return (
      <div className="card p-8 text-center">
        <p className="font-serif text-xl font-semibold">{t('conversation.notFound')}</p>
        <Link className="btn mt-4" href={`/${locale}/interview`}>{t('backHome')}</Link>
      </div>
    );
  }

  if (session.status === 'completed') {
    return (
      <div className="card p-8 text-center">
        <p className="font-serif text-xl font-semibold">{t('report.title')}</p>
        <p className="mt-2 text-sm text-ink-500">{session.jobTitle} · {session.report?.overallScore ?? 0}/100</p>
        <Link className="btn mt-5" href={`/${locale}/interview/interview/${session.id}/report`}>{t('report.backToInterview')}</Link>
      </div>
    );
  }

  const activeTurns = session.turns.filter((turn) => !turn.superseded);
  const canAnswer = session.status === 'in_progress' && Boolean(session.currentQuestion);
  const canFinish = ['in_progress', 'paused', 'abandoned'].includes(session.status);

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow={t('conversation.eyebrow')}
        title={session.jobTitle}
        description={`${interviewStatusLabel(session.status, locale)} · ${t('conversation.question', { count: Math.min(session.askedCount, session.questionLimit), total: session.questionLimit })}`}
        actions={<Link href={`/${locale}/interview`} className="btn-ghost">{t('backHome')}</Link>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/10 p-4">
            <div className="flex items-center gap-2">
              <span className="badge badge-accent">{t('conversation.phase')}: {interviewPhaseLabel(session.phase, locale)}</span>
              <span className="badge badge-grey">{session.askedCount}/{session.questionLimit}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {session.status === 'in_progress' ? (
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => void updateSession('pause', () => pauseInterview(session.id), t('conversation.pausedTitle'))}>{t('conversation.pause')}</button>
              ) : null}
              {session.status === 'paused' ? (
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => void updateSession('resume', () => resumeInterview(session.id), t('conversation.resume'))}>{t('conversation.resume')}</button>
              ) : null}
              {session.status === 'in_progress' && session.lastAnswerId ? (
                <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={Boolean(busy)} onClick={() => void updateSession('redo', () => redoLastAnswer(session.id, locale), t('conversation.redoNotice'))}>{t('conversation.redo')}</button>
              ) : null}
              {canFinish ? (
                <ConfirmButton
                  title={t('conversation.endConfirmTitle')}
                  message={t('conversation.endConfirmBody')}
                  confirmLabel={busy === 'finish' ? t('working') : t('conversation.finish')}
                  cancelLabel={t('cancel')}
                  failureLabel={t('conversation.finishError')}
                  disabled={Boolean(busy)}
                  onConfirm={finish}
                />
              ) : null}
            </div>
          </div>

          <Tabs
            value={tab}
            onChange={(value) => setTab(value as ViewTab)}
            items={[
              { value: 'transcript', label: t('conversation.historyTab'), count: activeTurns.length },
              { value: 'guide', label: t('conversation.guideTab') },
            ]}
          />

          {tab === 'guide' ? (
            <div className="p-5">
              <div className="rounded-xl bg-ivory-100 p-4 text-sm leading-6 text-ink-700">{t('conversation.guideBody')}</div>
              <ol className="mt-4 list-inside list-decimal space-y-2 text-sm text-ink-500">
                <li>{locale === 'zh' ? '自我介绍：突出岗位相关经历。' : 'Introduction: highlight role-relevant experience.'}</li>
                <li>{locale === 'zh' ? '基础与深挖：说明行动、取舍和验证。' : 'Fundamentals and deep dive: explain actions, trade-offs, and validation.'}</li>
                <li>{locale === 'zh' ? '反问：提出一个关于团队或岗位的问题。' : 'Your question: ask about the team or role.'}</li>
              </ol>
            </div>
          ) : (
            <>
              <div className="max-h-[55vh] space-y-3 overflow-y-auto bg-ivory-100/70 p-4 sm:p-6">
                {activeTurns.map((turn) => (
                  <div key={turn.id} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${turn.role === 'user' ? 'bg-accent text-white' : 'border border-black/5 bg-ivory-50 text-ink-900'}`}>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest opacity-70">
                        {turn.role === 'user' ? t('conversation.answer') : t('conversation.eyebrow')}
                      </p>
                      <p className="whitespace-pre-wrap">{turn.text}</p>
                    </div>
                  </div>
                ))}
                {session.redoMode ? <p className="rounded-lg border border-amber-700/20 bg-amber-50 p-3 text-xs text-amber-900">{t('conversation.redoNotice')}</p> : null}
                {session.status === 'paused' ? (
                  <div className="rounded-xl border border-amber-700/20 bg-amber-50 p-4">
                    <p className="font-semibold">{t('conversation.pausedTitle')}</p>
                    <p className="mt-1 text-sm">{t('conversation.pausedBody')}</p>
                  </div>
                ) : null}
                {session.status === 'abandoned' ? <InlineError>{t('conversation.finishError')}</InlineError> : null}
              </div>

              {canAnswer ? (
                <div className="border-t border-black/10 p-4 sm:p-5">
                  {error ? <div className="mb-3"><InlineError>{error}</InlineError></div> : null}
                  {session.phase === 'candidate_questions' ? <p className="mb-3 text-xs text-ink-500">{t('conversation.candidatePrompt')}</p> : null}
                  <label className="block">
                    <span className="label">{t('conversation.answer')}</span>
                    <textarea
                      className="input mt-2 min-h-28 resize-y"
                      maxLength={8000}
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder={t('conversation.answerPlaceholder')}
                      onKeyDown={(event) => {
                        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !busy) {
                          event.preventDefault();
                          void submitAnswer();
                        }
                      }}
                    />
                    <span className="mt-1 block text-right text-[11px] text-ink-500">{answer.length.toLocaleString()} / 8,000 · Ctrl/⌘ + Enter</span>
                  </label>
                  <div className="mt-3 flex flex-wrap justify-between gap-2">
                    {session.phase === 'candidate_questions' ? (
                      <button type="button" className="btn-ghost" disabled={Boolean(busy)} onClick={() => void finish()}>{t('conversation.skipCandidateQuestion')}</button>
                    ) : <span />}
                    <button type="button" className="btn" disabled={!answer.trim() || Boolean(busy)} onClick={() => void submitAnswer()}>
                      {busy === 'answer' ? t('conversation.sending') : t('conversation.send')}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="label">{t('conversation.phase')}</p>
            <p className="mt-2 font-serif text-xl font-semibold">{interviewPhaseLabel(session.phase, locale)}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ivory-300">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (session.askedCount / session.questionLimit) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-500">{t('conversation.question', { count: Math.min(session.askedCount, session.questionLimit), total: session.questionLimit })}</p>
          </div>
          <div className="rounded-2xl border border-accent/15 bg-accent-soft/50 p-5">
            <h2 className="text-sm font-semibold">{t('conversation.guideTab')}</h2>
            <p className="mt-2 text-xs leading-5 text-ink-700">{t('conversation.guideBody')}</p>
            <p className="mt-3 text-xs leading-5 text-ink-500">{t('report.description')}</p>
          </div>
          {error && !canAnswer ? <InlineError>{error}</InlineError> : null}
        </aside>
      </div>
    </div>
  );
}
