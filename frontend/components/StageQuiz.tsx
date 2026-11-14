'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/Shell';
import { apiFetch, errorText } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import type { AppLocale } from '@/lib/i18n-config';
import { LearningAdjustment } from './LearningAdjustment';

type Quiz = { id: string | null; version_id: string; stage_title: string; read_only: boolean;
  attempts?: Attempt[];
  round: number; rounds: { id: string; number: number; locale: string }[]; latest_assessment_id: string | null; rounds_available: boolean;
  locale: string | null; basis: string; questions: { prompt: string; options: string[] }[] };
type Attempt = { id: string; score: number; total: number; passed: boolean; answers: number[]; created_at: string;
  feedback: { prompt: string; options: string[]; selected: number; correct_index: number; explanation: string; concept: string }[] };

export function StageQuiz({ locale, id, anchor, embedded = false, onSubmitted, onPlanChanged }: {
  locale: AppLocale; id: string; anchor: string; embedded?: boolean; onSubmitted?: () => void; onPlanChanged?: () => void | Promise<void>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [history, setHistory] = useState<Attempt[]>([]);
  const [result, setResult] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<number[]>([-1, -1, -1, -1, -1]);
  const [error, setError] = useState('');
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selectedRound, setSelectedRound] = useState('');
  const [confirmRound, setConfirmRound] = useState(false);
  const [adjustmentFor, setAdjustmentFor] = useState<string | null>(null);
  const epoch = useRef(0);
  const submission = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const base = `/learning-paths/${id}/stages/${anchor}/assessment`;

  useEffect(() => { setSelectedRound(''); }, [base]);

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace(`/${locale}/login`); return; }
    if (me.role !== 'student') { router.replace(`/${locale}/courses`); return; }
    const current = ++epoch.current;
    setFetching(true); setBusy(false); setError(''); setQuiz(null); setResult(null); setHistory([]); setConfirmRound(false); setAdjustmentFor(null);
    setAnswers([-1, -1, -1, -1, -1]); submission.current = null;
    const load = async () => {
      try {
        const data = await apiFetch<Quiz>(`${base}?include_attempts=true${selectedRound ? `&assessment_id=${encodeURIComponent(selectedRound)}` : ''}`);
        const attempts = data.attempts ?? [];
        if (current === epoch.current) { setQuiz(data); setHistory(attempts); setResult(attempts.at(-1) ?? null); }
      } catch (err) { if (current === epoch.current) setError(errorText(err, t)); }
      finally { if (current === epoch.current) setFetching(false); }
    };
    void load();
    return () => { epoch.current += 1; };
  }, [base, id, loading, me, locale, router, t, retry, selectedRound]);

  async function generateRound() {
    if (!quiz?.id || quiz.read_only || busy) return;
    const current = epoch.current;
    setBusy(true); setError('');
    try {
      const data = await apiFetch<Quiz>(`${base}/rounds`, {
        method: 'POST', body: JSON.stringify({ locale, previous_assessment_id: quiz.id }),
      });
      if (current === epoch.current) {
        setSelectedRound(data.id ?? ''); setConfirmRound(false);
        onSubmitted?.();
      }
    } catch (err) { if (current === epoch.current) setError(errorText(err, t)); }
    finally { if (current === epoch.current) setBusy(false); }
  }

  async function generate() {
    const current = epoch.current;
    setBusy(true); setError('');
    try {
      const data = await apiFetch<Quiz>(base, { method: 'POST', body: JSON.stringify({ locale }) });
      if (current === epoch.current) { setQuiz(data); setResult(null); setAnswers([-1, -1, -1, -1, -1]); }
    } catch (err) { if (current === epoch.current) setError(errorText(err, t)); }
    finally { if (current === epoch.current) setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!quiz?.id || answers.some((value) => value < 0) || busy) return;
    const current = epoch.current;
    const fingerprint = `${quiz.id}:${answers.join(',')}`;
    if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, requestId: crypto.randomUUID() };
    setBusy(true); setError('');
    try {
      const attempt = await apiFetch<Attempt>(`/learning-paths/${id}/assessments/${quiz.id}/attempts`, {
        method: 'POST', body: JSON.stringify({ request_id: submission.current.requestId, answers }),
      });
      if (current === epoch.current) {
        setAdjustmentFor(null); setResult(attempt); setHistory((old) => old.some((item) => item.id === attempt.id) ? old : [...old, attempt]);
        onSubmitted?.();
      }
    } catch (err) { if (current === epoch.current) setError(errorText(err, t)); }
    finally { if (current === epoch.current) setBusy(false); }
  }

  if (loading || !me || me.role !== 'student') return <p className="p-8">{t('common.loading')}</p>;
  const content = <>
    {!embedded && <Link className="btn-ghost" href={`/${locale}/learning-path/${id}${quiz ? `?version=${encodeURIComponent(quiz.version_id)}` : ''}`}>{t('pathResources.back')}</Link>}
    {!embedded && <h1 className="my-5 text-3xl font-semibold">{quiz?.stage_title || t('quiz.title')}</h1>}
    <p className="mb-5 text-sm text-ink-500">{t('quiz.note')}</p>
    {fetching && <p role="status">{t('common.loading')}</p>}
    {error && <div className="card mb-5 p-4" role="alert"><p>{error}</p>{!quiz && <button className="btn-ghost mt-2" onClick={() => setRetry((n) => n + 1)}>{t('reading.retry')}</button>}</div>}
    {quiz && <>
      {quiz.rounds.length > 0 && <label className="label mb-4">{t('quiz.rounds')}
        <select className="input mt-2" value={quiz.id ?? ''} disabled={busy || fetching} onChange={(event) => setSelectedRound(event.target.value)}>
          {quiz.rounds.map((round) => <option key={round.id} value={round.id}>{t('quiz.round')} {round.number}{round.id === quiz.latest_assessment_id ? ` · ${t('quiz.currentRound')}` : ''}</option>)}
        </select>
      </label>}
      {quiz.read_only && <p className="mb-4">{t(quiz.id !== quiz.latest_assessment_id ? 'quiz.historicalRound' : 'learningPath.readOnly')}</p>}
      {quiz.id && !quiz.rounds_available && <p className="mb-4 text-sm text-ink-500">{t('quiz.roundsMigration')}</p>}
      {!quiz.id && !quiz.read_only && <button className="btn" disabled={busy} onClick={() => void generate()}>{t(busy ? 'quiz.generating' : 'quiz.generate')}</button>}
      {quiz.id && <p className="mb-4 text-sm text-ink-500">{t(`quiz.basis_${quiz.basis}`)} · {t('quiz.language')} {quiz.locale === 'zh' ? '中文' : 'English'}</p>}
      {history.length > 0 && <div className="card mb-5 space-y-3 p-4">
        <p>{t('quiz.first')} {history[0].score}/5 · {t('quiz.latest')} {history[history.length - 1].score}/5</p>
        <div className="flex flex-wrap gap-2">{history.map((attempt, index) => <button className="btn-ghost" key={attempt.id} onClick={() => { setAdjustmentFor(null); setResult(attempt); }}>{index + 1} · {attempt.score}/5</button>)}</div>
      </div>}
      {quiz.id && !result && <form onSubmit={(event) => void submit(event)} className="space-y-5">
        {quiz.questions.map((question, index) => <fieldset className="card p-5" key={index} disabled={busy || quiz.read_only}>
          <legend className="px-2 font-semibold">{index + 1}. {question.prompt}</legend>
          <div className="space-y-3">{question.options.map((option, choice) => <label className="flex cursor-pointer items-start gap-3" key={choice}>
            <input className="mt-1" type="radio" name={`q-${index}`} value={choice} required checked={answers[index] === choice} onChange={() => setAnswers((old) => old.map((v, i) => i === index ? choice : v))} />
            <span>{option}</span>
          </label>)}</div>
        </fieldset>)}
        <button className="btn" disabled={busy || quiz.read_only || answers.some((value) => value < 0)}>{t(busy ? 'common.loading' : 'quiz.submit')}</button>
      </form>}
      {result && <section className="space-y-4">
        <div className="card p-5"><h2 className="text-2xl font-semibold">{result.score}/5 · {t(result.passed ? 'quiz.passed' : 'quiz.review')}</h2>
          <p className="mt-2 text-sm">{t('quiz.resultNote')}</p>
          <p className="mt-3 text-sm">{result.feedback.some((item) => item.selected !== item.correct_index)
            ? `${t('quiz.weakConcepts')} ${[...new Set(result.feedback.filter((item) => item.selected !== item.correct_index).map((item) => item.concept))].join('、')}`
            : t('quiz.noMistakes')}</p>
          {!quiz.read_only && <button className="btn-ghost mt-4" onClick={() => { setResult(null); setAnswers([-1, -1, -1, -1, -1]); submission.current = null; }}>{t('quiz.retake')}</button>}
          {!quiz.read_only && quiz.rounds_available && <div className="mt-4 space-y-3">
            {confirmRound ? <>
              <p className="rounded-lg bg-amber-50 p-3 text-sm">{t('quiz.newRoundNote')}</p>
              <div className="flex flex-wrap gap-3"><button className="btn" disabled={busy} onClick={() => void generateRound()}>{t(busy ? 'quiz.generating' : 'quiz.confirmNewRound')}</button>
                <button className="btn-ghost" disabled={busy} onClick={() => setConfirmRound(false)}>{t('common.cancel')}</button></div>
            </> : <button className="btn-ghost" disabled={busy} onClick={() => setConfirmRound(true)}>{t('quiz.newRound')}</button>}
          </div>}
        </div>
        {adjustmentFor === result.id
          ? <LearningAdjustment key={result.id} pathId={id} attemptId={result.id} onApplied={async () => { if (onPlanChanged) await onPlanChanged(); else onSubmitted?.(); }} />
          : <button className="btn-ghost" onClick={() => setAdjustmentFor(result.id)}>{t('quiz.showAdjustment')}</button>}
        {result.feedback.map((item, index) => <article className="card space-y-2 p-5" key={index}>
          <h3 className="font-semibold">{index + 1}. {item.prompt}</h3>
          <span className={`badge ${item.selected === item.correct_index ? 'badge-ok' : 'badge-warn'}`}>{t(item.selected === item.correct_index ? 'quiz.answerCorrect' : 'quiz.answerWrong')}</span>
          <p>{t('quiz.selected')} {item.options[item.selected]}</p><p>{t('quiz.correct')} {item.options[item.correct_index]}</p>
          <p className="text-sm text-ink-500">{item.concept}</p><p>{item.explanation}</p>
        </article>)}
      </section>}
    </>}
  </>;
  return embedded ? content : <Shell locale={locale} me={me} onSignOut={() => { void signOut().then(() => router.push(`/${locale}/login`)); }}>{content}</Shell>;
}
