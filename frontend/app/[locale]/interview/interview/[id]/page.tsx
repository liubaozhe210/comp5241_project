'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useInterview } from '../../_components/InterviewProvider';
import { useInterviewToast } from '../../_components/Toast';
import { ConfirmButton, InlineError, LoadingState, PageHeading } from '../../_components/InterviewUI';
import {
  formatInterviewError,
  interviewPhaseLabel,
  interviewStatusLabel,
} from '@/lib/interview/utils';
import {
  confirmInterviewQuestion,
  finishInterview,
  sendInterviewAnswer,
} from '@/lib/interview/api';
import type { AppLocale } from '@/lib/i18n-config';
import type { InterviewLocale } from '@/lib/interview/types';

type InterviewRouteParams = { locale: AppLocale; id: string };

type SpeechRecognitionResultLike = {
  0: { transcript: string };
  length: number;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorLike = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export default function InterviewConversationPage() {
  const t = useTranslations('interview');
  const params = useParams<InterviewRouteParams>();
  const locale = params.locale as InterviewLocale;
  const router = useRouter();
  const { data, loading, loadError, refresh, run } = useInterview();
  const { showToast } = useInterviewToast();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'recognized' | 'error'>('idle');
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const recognitionBaseRef = useRef('');
  const announcedTurnRef = useRef<string | null>(null);
  const timeoutTurnRef = useRef<string | null>(null);
  const initializedAnswerTurnRef = useRef<string | null>(null);
  const session = useMemo(() => data?.sessions.find((item) => item.id === params.id) ?? null, [data, params.id]);

  useEffect(() => {
    const turnId = session?.currentTurnId;
    if (!turnId || initializedAnswerTurnRef.current === turnId) return;
    initializedAnswerTurnRef.current = turnId;
    const savedAnswer = session.turns.find((turn) => turn.id === `${turnId}:answer`);
    setAnswer(savedAnswer?.text ?? '');
  }, [session?.currentTurnId, session?.turns]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();
  }, []);

  function stopSpeechFeatures() {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    let stopFailed = false;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          stopFailed = true;
        }
      }
    }
    setIsListening(false);
    setVoiceStatus('idle');
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    return stopFailed;
  }

  function readCurrentQuestion() {
    const question = session?.currentQuestion?.text;
    if (!question) return;
    if (typeof window.speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      setIsSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(question);
    utterance.lang = locale === 'zh' ? 'zh-CN' : 'en-US';
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  }

  useEffect(() => {
    if (
      !session ||
      session.status !== 'in_progress' ||
      !session.currentQuestion ||
      !session.currentTurnId
    ) return;

    void run(() => confirmInterviewQuestion(session.id, session.currentTurnId!)).catch((actionError: unknown) => {
      const message = formatInterviewError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    });

    if (announcedTurnRef.current !== session.currentTurnId) {
      announcedTurnRef.current = session.currentTurnId;
      readCurrentQuestion();
    }
  }, [session?.id, session?.currentTurnId, session?.status, session?.currentQuestion?.text]);

  useEffect(() => {
    if (!session?.questionDeadlineAt || !session.currentQuestion || !session.currentTurnId || busy === 'answer') {
      setSecondsRemaining(null);
      return;
    }
    const turnId = session.currentTurnId;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(session.questionDeadlineAt!) - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0 && timeoutTurnRef.current !== turnId) {
        timeoutTurnRef.current = turnId;
        void submitAnswer('timeout');
      }
    };
    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [session?.questionDeadlineAt, session?.currentQuestion, session?.currentTurnId, answer, busy]);

  function toggleVoiceInput() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        const recognition = recognitionRef.current;
        recognitionRef.current = null;
        setIsListening(false);
        try {
          recognition.abort();
        } catch {
          setError(t('conversation.speechStopError'));
        }
      }
      return;
    }

    const speechWindow = window as SpeechRecognitionWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceStatus('error');
      setError(t('conversation.speechRecognitionUnavailable'));
      return;
    }

    const recognition = new Recognition();
    recognition.lang = locale === 'zh' ? 'zh-CN' : 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionBaseRef.current = answer;
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    recognition.onresult = (event) => {
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      const base = recognitionBaseRef.current.trimEnd();
      setAnswer(`${base}${base && transcript ? ' ' : ''}${transcript}`.slice(0, 8000));
      setVoiceStatus('recognized');
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceStatus('error');
      setError(
        event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? t('conversation.microphonePermissionDenied')
          : t('conversation.speechRecognitionError'),
      );
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setIsListening(false);
      setVoiceStatus((current) => current === 'listening' ? 'idle' : current);
    };
    recognitionRef.current = recognition;
    setError('');
    try {
      recognition.start();
      setIsListening(true);
      setVoiceStatus('listening');
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceStatus('error');
      setError(t('conversation.speechStartError'));
    }
  }

  async function submitAnswer(finishReason: 'manual' | 'timeout' = 'manual') {
    if (!session) return;
    const savedAnswer = session.currentTurnId
      ? session.turns.find((turn) => turn.id === `${session.currentTurnId}:answer`)
      : undefined;
    if (finishReason === 'manual' && !savedAnswer && (!answer.trim() || answer.trim().length > 8000)) {
      setError(t('conversation.answerLimit'));
      return;
    }
    stopSpeechFeatures();
    setBusy('answer');
    setError('');
    timeoutTurnRef.current = session.currentTurnId;
    try {
      const requestFinishReason = savedAnswer && !answer.trim() ? 'timeout' : finishReason;
      const updatedSession = await run(() => sendInterviewAnswer(session.id, session.currentTurnId!, answer, locale, requestFinishReason));
      setAnswer('');
      if (updatedSession.status === 'completed') {
        showToast(locale === 'zh' ? '面试复盘已生成。' : 'Interview review generated.', 'success');
        router.push(`/${locale}/interview/interview/${session.id}/report`);
      } else {
        showToast(t('conversation.answerSubmitted'), 'success');
      }
    } catch (actionError) {
      const message = formatInterviewError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function finish() {
    if (!session) return;
    const speechStopFailed = stopSpeechFeatures();
    setBusy('finish');
    setError(speechStopFailed ? t('conversation.speechStopError') : '');
    try {
      const updatedSession = await run(() => finishInterview(session.id, locale));
      if (updatedSession.status === 'completed') {
        showToast(locale === 'zh' ? '面试复盘已生成。' : 'Interview review generated.', 'success');
        router.push(`/${locale}/interview/interview/${session.id}/report`);
      } else {
        showToast(t('conversation.abandonedEmpty'), 'info');
      }
    } catch (actionError) {
      await refresh();
      const message = formatInterviewError(actionError, locale);
      setError(message);
      showToast(message, 'error');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <LoadingState label={t('loading')} />;
  if (loadError || !data) return <InlineError>{formatInterviewError(new Error(loadError), locale)}</InlineError>;
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
        <p className="mt-2 text-sm text-ink-500">{session.jobTitle}</p>
        <Link className="btn mt-5" href={`/${locale}/interview/interview/${session.id}/report`}>{t('report.viewReport')}</Link>
      </div>
    );
  }

  const activeTurns = session.turns.filter((turn) => !turn.superseded);
  const savedCurrentAnswer = session.currentTurnId
    ? session.turns.find((turn) => turn.id === `${session.currentTurnId}:answer`)
    : undefined;
  const canAnswer = session.status === 'in_progress' && Boolean(session.currentQuestion);
  const canFinish = session.status === 'in_progress';

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

          {session.currentQuestion?.index === 1 ? (
            <p className="mx-4 mt-4 rounded-xl border border-black/10 bg-ivory-100 px-4 py-3 text-xs leading-5 text-ink-700">
              {t('conversation.openingRules')}
            </p>
          ) : null}
          {session.latestFeedback ? (
            <p className="mx-4 mt-4 rounded-xl border border-accent/15 bg-accent-soft/50 px-4 py-3 text-sm text-ink-700" aria-live="polite">
              <span className="mr-2 font-semibold">{t('conversation.latestFeedback')}</span>
              {session.latestFeedback}
            </p>
          ) : null}
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
            {session.status === 'abandoned' ? (
              <InlineError>{session.reportErrorCode ? t('conversation.finishError') : t('conversation.abandonedEmpty')}</InlineError>
            ) : null}
          </div>

          {canAnswer ? (
            <div className="border-t border-black/10 p-4 sm:p-5">
              {error ? <div className="mb-3"><InlineError>{error}</InlineError></div> : null}
              <label className="block">
                <span className="label">{t('conversation.answer')}</span>
                <textarea
                  className="input mt-2 min-h-28 resize-y"
                  maxLength={8000}
                  value={answer}
                  disabled={!session.questionDeadlineAt || Boolean(busy)}
                  readOnly={Boolean(savedCurrentAnswer)}
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
              <p className="mt-2 text-xs leading-5 text-ink-500">{t('conversation.voiceHelp')}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold tabular-nums" aria-live="polite">
                  {secondsRemaining === null ? t('conversation.timerStarting') : t('conversation.timeRemaining', { minutes: Math.floor(secondsRemaining / 60), seconds: String(secondsRemaining % 60).padStart(2, '0') })}
                </p>
                <button
                  type="button"
                  className={isListening ? 'btn border border-red-300 bg-red-50 text-red-700' : 'btn-ghost'}
                  aria-pressed={isListening}
                  disabled={!session.questionDeadlineAt || Boolean(busy) || Boolean(savedCurrentAnswer)}
                  onClick={toggleVoiceInput}
                >
                  {isListening ? t('conversation.stopVoiceInput') : t('conversation.startVoiceInput')}
                </button>
                <button type="button" className="btn" disabled={!session.questionDeadlineAt || (!answer.trim() && !savedCurrentAnswer) || Boolean(busy) || isListening} onClick={() => void submitAnswer('manual')}>
                  {busy === 'answer' ? t('conversation.sending') : savedCurrentAnswer ? t('conversation.retryGeneration') : t('conversation.send')}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="card overflow-hidden p-5 text-center">
            <div className="relative mx-auto h-28 w-24 motion-safe:animate-bounce" role="img" aria-label={t('conversation.interviewerAvatar')}>
              <div className={`absolute left-1/2 top-1 h-[70px] w-[70px] -translate-x-1/2 rounded-[45%] border-4 border-ink-900 bg-[#f0c2a0] shadow-md transition-transform ${isSpeaking ? 'scale-105' : 'scale-100'}`}>
                <span className="absolute -top-2 left-0 h-7 w-full rounded-t-full bg-ink-900" />
                <span className="absolute left-4 top-8 h-2 w-2 rounded-full bg-ink-900" />
                <span className="absolute right-4 top-8 h-2 w-2 rounded-full bg-ink-900" />
                <span className="absolute left-1/2 top-12 h-1 w-3 -translate-x-1/2 rounded-full bg-rose-600" />
              </div>
              <div className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-t-[50%] bg-accent">
                <span className="absolute left-1/2 top-0 h-7 w-5 -translate-x-1/2 bg-ivory-50 [clip-path:polygon(0_0,100%_0,50%_100%)]" />
              </div>
            </div>
            <h2 className="mt-2 font-semibold">{t('conversation.interviewerAvatar')}</h2>
            <p className="mt-1 text-xs text-ink-500" aria-live="polite">
              {isListening ? t('conversation.listening') : isSpeaking ? t('conversation.readingQuestion') : voiceStatus === 'recognized' ? t('conversation.voiceRecognized') : voiceStatus === 'error' ? t('conversation.voiceInputError') : t('conversation.interviewerReady')}
            </p>
          </div>
          <div className="card p-5">
            <p className="label">{t('conversation.phase')}</p>
            <p className="mt-2 font-serif text-xl font-semibold">{interviewPhaseLabel(session.phase, locale)}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ivory-300">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (session.askedCount / session.questionLimit) * 100)}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink-500">{t('conversation.question', { count: Math.min(session.askedCount, session.questionLimit), total: session.questionLimit })}</p>
          </div>
          {error && !canAnswer ? <InlineError>{error}</InlineError> : null}
        </aside>
      </div>
    </div>
  );
}
