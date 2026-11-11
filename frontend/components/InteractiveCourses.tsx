'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Shell } from './Shell';
import { apiFetch, type Course } from '@/lib/api';
import { copy, downloadSource, emptyProgress, interactiveError, type Content, type Interactive, type Progress } from '@/lib/interactive';
import type { AppLocale } from '@/lib/i18n-config';
import { useSession } from '@/lib/useSession';

type Props = { locale: AppLocale; courseId: string; itemId?: string };

export function InteractiveCourses({ locale, courseId, itemId }: Props) {
  const t = copy(locale); const router = useRouter(); const { me, loading, signOut } = useSession();
  const [course, setCourse] = useState<Course | null>(null);
  const [items, setItems] = useState<{id: string; title: string; revision: number; lessons: number; source_name: string}[]>([]);
  const [item, setItem] = useState<Interactive | null>(null);
  const [content, setContent] = useState<Content | null>(null);
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [busy, setBusy] = useState(false); const [ready, setReady] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [preview, setPreview] = useState(false);
  const manager = !!me && !!course && (me.role === 'admin' || (me.role === 'teacher' && course.teacher_id === me.id));
  const dirty = !!item && JSON.stringify(content) !== JSON.stringify(item.content);
  const base = `/${locale}/courses/${courseId}/interactive`;

  const load = useCallback(async () => {
    setError(''); setReady(false);
    try {
      setCourse(await apiFetch<Course>(`/courses/${courseId}`));
      if (itemId) {
        const revision = new URLSearchParams(window.location.search).get('revision');
        const query = revision && /^\d+$/.test(revision) ? `?revision=${revision}` : '';
        const result = await apiFetch<Interactive>(`/interactive/${itemId}${query}`);
        if (result.course_id !== courseId) throw new Error('Wrong parent course');
        setItem(result); setContent(structuredClone(result.content));
        if (!result.can_edit) {
          setProgress(await apiFetch<Progress>(`/interactive/${itemId}/progress?revision=${result.revision}`));
          window.history.replaceState(window.history.state, '', `${window.location.pathname}?revision=${result.revision}`);
        }
      } else setItems(await apiFetch(`/courses/${courseId}/interactive`));
      setReady(true);
    } catch (e) { setError(interactiveError(e, locale)); }
  }, [courseId, itemId, locale]);

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace(`/${locale}/login`); return; }
    void load();
  }, [loading, me, router, locale, load]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(interactiveError(e, locale)); } finally { setBusy(false); }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const body = new FormData(event.currentTarget);
    await run(async () => {
      const created = await apiFetch<Interactive>(`/courses/${courseId}/interactive`, {method: 'POST', body});
      router.push(`${base}/${created.id}`);
    });
  }

  async function save() {
    if (!item || !content) return;
    await run(async () => {
      const result = await apiFetch<Interactive>(`/interactive/${item.id}`, {method: 'PUT', body: JSON.stringify({version: item.version, content})});
      setItem(result); setContent(structuredClone(result.content)); setMessage(t.saved);
    });
  }

  async function publish() {
    if (!item || dirty) return;
    await run(async () => {
      const result = await apiFetch<Interactive>(`/interactive/${item.id}/publish`, {method: 'POST', body: JSON.stringify({version: item.version})});
      setItem(result); setMessage(t.publishedOk);
    });
  }

  async function activity(kind: 'quiz' | 'scenario' | 'complete', lesson: number, answer = 0, response = '') {
    if (!item || !content) return;
    await run(async () => {
      if (!manager) {
        setProgress(await apiFetch<Progress>(`/interactive/${item.id}/activities`, {method: 'POST', body: JSON.stringify({revision: item.revision, kind, lesson, answer, response})}));
        return;
      }
      // Preview is explicitly local and isolated from all student persistence.
      const next = structuredClone(progress); const section = content.lessons[lesson];
      if (kind === 'quiz' && section.quiz) {
        const previous = next.quizzes[lesson]; const correct = answer === section.quiz.answer;
        next.quizzes[lesson] = {selected: answer, correct, passed: !!previous?.passed || correct, answer: section.quiz.answer!, explanation: section.quiz.explanation!, attempts: (previous?.attempts ?? 0) + 1};
      } else if (kind === 'scenario' && content.scenario) {
        next.scenario = {response, example_answer: content.scenario.example_answer!, checks: content.scenario.rubric.map(r => ({label: r.label, matched: r.keywords!.some(k => response.toLocaleLowerCase().includes(k.toLocaleLowerCase()))}))};
      } else if (kind === 'complete') next.completed = Array.from(new Set([...next.completed, lesson]));
      setProgress(next);
    });
  }

  return <Shell locale={locale} me={me} onSignOut={signOut}>
    <Link href={`/${locale}/courses/${courseId}`} className="text-sm text-accent">← {t.back}</Link>
    <header className="my-6"><p className="label">{course?.code}</p><h1 className="mt-2 text-3xl font-semibold">{manager ? t.studio : t.heading}</h1><p className="mt-2 text-ink-500">{manager ? t.intro : t.learningIntro}</p></header>
    {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</div>}
    {message && <div role="status" className="mb-4 rounded-xl bg-emerald-50 p-4 text-emerald-800">{message}</div>}
    {!ready && !error && <p role="status">{t.loading}</p>}
    {ready && !itemId && <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.2fr]">
      {manager && <form onSubmit={generate} className="card space-y-4 p-6">
        <h2 className="text-xl font-semibold">{t.generate}</h2>
        <label className="block text-sm">{t.file}<input className="input mt-2" name="file" type="file" accept="application/pdf,.pdf" required disabled={busy} onChange={e => {
          const file = e.target.files?.[0]; e.target.setCustomValidity(file && file.size > 20 * 1024 * 1024 ? (locale === 'zh' ? '文件超过 20 MB' : 'File exceeds 20 MB') : '');
        }}/></label>
        <label className="block text-sm">{t.goal}<textarea className="input mt-2" name="goal" maxLength={2000} rows={3}/></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">{t.language}<select className="input mt-2" name="language" defaultValue={locale}><option value="en">English</option><option value="zh">中文</option></select></label>
          <label className="block text-sm">{t.level}<select className="input mt-2" name="level"><option value="beginner">{t.beginner}</option><option value="intermediate">{t.intermediate}</option></select></label>
        </div>
        <label className="block text-sm">{t.activities}<select className="input mt-2" name="activities"><option value="both">{t.both}</option><option value="quiz">{t.quiz}</option><option value="scenario">{t.scenario}</option></select></label>
        <p className="text-xs leading-relaxed text-ink-500">{t.disclosure}</p>
        <button className="btn w-full" disabled={busy || course?.status === 'archived'}>{busy ? t.generating : t.generate}</button>
      </form>}
      <section className="space-y-3">{!items.length && <p className="card p-6 text-ink-500">{t.empty}</p>}{items.map(row => <article className="card p-5" key={row.id}>
        <span className="badge badge-accent">{row.revision ? `${t.published} ${row.revision}` : t.draft}</span>
        <h2 className="mt-3 text-xl font-semibold">{row.title}</h2><p className="mt-2 text-sm text-ink-500">{row.lessons} {t.lessons} · {row.source_name}</p>
        <Link href={`${base}/${row.id}`} className="btn-ghost mt-4">{t.open}</Link>
      </article>)}</section>
    </div>}
    {ready && item && content && <>
      {!manager && item.latest_revision !== item.revision && <p className="mb-4 rounded-xl bg-accent-soft p-4">{t.latest} <a className="underline" href={`${base}/${item.id}`}>{t.open}</a></p>}
      <div className="card mb-5 flex flex-wrap items-center gap-3 p-4">
        <span className="badge badge-accent">{item.revision ? `${t.published} ${item.revision}` : t.draft}</span>
        <button className="btn-ghost" disabled={busy} onClick={() => run(() => downloadSource(item.id))}>{t.source}</button>
        {manager && <><button className="btn-ghost" disabled={dirty || busy} onClick={() => {setPreview(!preview); setProgress(emptyProgress());}}>{preview ? t.edit : t.preview}</button>
          <button className="btn-ghost" disabled={busy} onClick={() => {if (!dirty || window.confirm(t.confirmReload)) void load();}}>{t.refresh}</button></>}
      </div>
      {manager && !preview ? <>
        <p className="mb-4 text-sm text-ink-500">{t.review}</p>
        {course?.status === 'archived' && <p role="alert">{t.archived}</p>}
        <fieldset disabled={busy || course?.status === 'archived'}>
          <Editor content={content} onChange={setContent} locale={locale}/>
          <div className="sticky bottom-3 mt-5 flex flex-wrap items-center gap-3 rounded-xl border bg-ivory-50 p-4 shadow-lg">
            <button className="btn" onClick={save} disabled={!dirty || busy}>{t.save}</button>
            <button className="btn-ghost" onClick={publish} disabled={dirty || busy || course?.status !== 'published'}>{t.publish}</button>
            {dirty && <span className="text-sm text-amber-800">{t.dirty}</span>}
          </div>
        </fieldset>
      </> : <>
        {manager && <div className="mb-4 rounded-xl bg-accent-soft p-4 text-sm">{t.previewNote} <button className="underline" onClick={() => setProgress(emptyProgress())}>{t.restart}</button></div>}
        <Reader content={content} progress={progress} busy={busy} locale={locale} onActivity={activity}/>
      </>}
    </>}
  </Shell>;
}

function Field({label, value, set, large = false}: {label: string; value: string; set: (s: string) => void; large?: boolean}) {
  return <label className="block text-sm">{label}{large ? <textarea className="input mt-1" rows={5} value={value} onChange={e => set(e.target.value)}/> : <input className="input mt-1" value={value} onChange={e => set(e.target.value)}/>}</label>;
}

function Editor({content, onChange, locale}: {content: Content; onChange: (c: Content) => void; locale: string}) {
  const t = copy(locale);
  const change = (fn: (c: Content) => void) => { const next = structuredClone(content); fn(next); onChange(next); };
  return <div className="space-y-5">
    <section className="card space-y-4 p-6"><Field label={t.title} value={content.title} set={v => change(c => {c.title = v;})}/>
      <Field large label={t.objectives} value={content.objectives.join('\n')} set={v => change(c => {c.objectives = v.split('\n');})}/></section>
    {content.lessons.map((lesson, index) => <section className="card space-y-4 p-6" key={index}>
      <h2 className="text-xl font-semibold">{index + 1}. {lesson.title}</h2>
      <Field label={t.lessonTitle} value={lesson.title} set={v => change(c => {c.lessons[index].title = v;})}/>
      <Field large label={t.explanation} value={lesson.explanation} set={v => change(c => {c.lessons[index].explanation = v;})}/>
      <Field large label={t.example} value={lesson.example} set={v => change(c => {c.lessons[index].example = v;})}/>
      <PageField value={lesson.source_pages} label={t.pages} set={v => change(c => {c.lessons[index].source_pages = v;})}/>
      {lesson.quiz && <div className="space-y-3 border-t pt-4">
        <Field label={t.question} value={lesson.quiz.question} set={v => change(c => {c.lessons[index].quiz!.question = v;})}/>
        {lesson.quiz.options.map((option, n) => <Field key={n} label={`${t.option} ${n + 1}`} value={option} set={v => change(c => {c.lessons[index].quiz!.options[n] = v;})}/>)}
        <label className="block text-sm">{t.correct}<select className="input mt-1" value={lesson.quiz.answer} onChange={e => change(c => {c.lessons[index].quiz!.answer = Number(e.target.value);})}>{lesson.quiz.options.map((_, n) => <option key={n} value={n}>{n + 1}</option>)}</select></label>
        <Field large label={t.answerExplanation} value={lesson.quiz.explanation ?? ''} set={v => change(c => {c.lessons[index].quiz!.explanation = v;})}/>
      </div>}
    </section>)}
    {content.scenario && <section className="card space-y-4 p-6"><h2 className="text-xl font-semibold">{t.scenario}</h2>
      <Field large label={t.scenarioPrompt} value={content.scenario.prompt} set={v => change(c => {c.scenario!.prompt = v;})}/>
      <Field large label={t.exampleAnswer} value={content.scenario.example_answer ?? ''} set={v => change(c => {c.scenario!.example_answer = v;})}/>
      {content.scenario.rubric.map((r, i) => <div key={i} className="grid gap-3 md:grid-cols-2"><Field label={t.criterion} value={r.label} set={v => change(c => {c.scenario!.rubric[i].label = v;})}/><Field label={t.keywords} value={r.keywords?.join(',') ?? ''} set={v => change(c => {c.scenario!.rubric[i].keywords = v.split(',');})}/></div>)}
    </section>}
  </div>;
}

function PageField({value, label, set}: {value: number[]; label: string; set: (v: number[]) => void}) {
  const [text, setText] = useState(value.join(','));
  useEffect(() => {setText(value.join(','));}, [value.join(',')]);
  return <label className="block text-sm">{label}<input className="input mt-1" value={text} onChange={e => setText(e.target.value)} onBlur={() => set(text.split(',').map(x => Number(x.trim())))}/></label>;
}

function Reader({content, progress, busy, locale, onActivity}: {content: Content; progress: Progress; busy: boolean; locale: string; onActivity: (kind: 'quiz' | 'scenario' | 'complete', lesson: number, answer?: number, response?: string) => Promise<void>}) {
  const t = copy(locale); const [selected, setSelected] = useState<Record<number, number>>({});
  const [response, setResponse] = useState(progress.scenario?.response ?? '');
  const [active, setActive] = useState(0);
  const lesson = content.lessons[active]; const result = progress.quizzes[active]; const last = active === content.lessons.length - 1;
  const canComplete = (!lesson.quiz || result?.passed) && (!last || !content.scenario || !!progress.scenario);
  return <div className="grid items-start gap-5 lg:grid-cols-[250px_1fr]">
    <aside className="card space-y-3 p-5"><h2 className="font-semibold">{content.title}</h2><p className="text-sm">{t.progress}: {progress.completed.length}/{content.lessons.length}</p>
      <progress className="w-full accent-blue-900" max={content.lessons.length} value={progress.completed.length} aria-label={t.progress}/>
      <nav aria-label={t.lessons} className="space-y-2">{content.lessons.map((l, n) => <button className={`w-full rounded-lg border p-3 text-left text-sm ${active === n ? 'border-accent bg-accent-soft' : 'border-black/10'}`} key={n} onClick={() => setActive(n)}>{n + 1}. {l.title}{progress.completed.includes(n) && <span className="ml-2 text-emerald-800">✓</span>}</button>)}</nav>
    </aside>
    <div className="space-y-5"><section className="card p-6"><h2 className="text-2xl font-semibold">{lesson.title}</h2><p className="mt-2 text-xs text-ink-500">{t.sourcePages}: {lesson.source_pages.join(', ')}</p>
      <ul className="my-4 list-inside list-disc text-sm text-ink-500">{content.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
      <p className="whitespace-pre-wrap leading-8">{lesson.explanation}</p><h3 className="mt-6 font-semibold">{t.example}</h3><p className="mt-3 whitespace-pre-wrap rounded-xl bg-accent-soft p-4 leading-7">{lesson.example}</p></section>
      {lesson.quiz && <section className="card space-y-4 p-6"><h3 className="font-semibold">{lesson.quiz.question}</h3>
        <fieldset disabled={busy} className="space-y-2"><legend className="sr-only">{lesson.quiz.question}</legend>{lesson.quiz.options.map((o, n) => <label key={n} className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm"><input type="radio" name={`quiz-${active}`} checked={(selected[active] ?? result?.selected) === n} onChange={() => setSelected({...selected, [active]: n})}/>{o}</label>)}</fieldset>
        <button className="btn" disabled={busy || (selected[active] ?? result?.selected) === undefined} onClick={() => onActivity('quiz', active, selected[active] ?? result?.selected)}>{t.submit}</button>
        {result && <div role="status" className="rounded-xl bg-ivory-200 p-4"><p className="font-semibold">{result.correct ? t.passed : t.retry} · {t.attempts}: {result.attempts}</p><p className="mt-2">{t.correct}: {lesson.quiz.options[result.answer]}</p><p className="mt-2 whitespace-pre-wrap text-sm">{result.explanation}</p></div>}
      </section>}
      {last && content.scenario && <section className="card space-y-4 p-6"><h3 className="font-semibold">{t.scenario}</h3><p className="whitespace-pre-wrap">{content.scenario.prompt}</p>
        <label className="block text-sm">{t.response}<textarea className="input mt-2" rows={6} maxLength={10000} value={response} onChange={e => setResponse(e.target.value)}/></label>
        <button className="btn" disabled={busy || response.replace(/\s/g, '').length < 30} onClick={() => onActivity('scenario', active, 0, response)}>{t.submitScenario}</button>
        <p className="text-xs text-ink-500">{t.checklist}</p>
        {progress.scenario && <div role="status" className="space-y-3 rounded-xl bg-ivory-200 p-4">{progress.scenario.checks.map((check, n) => <p key={n}>{check.matched ? '✓' : '—'} {check.label}</p>)}<h4 className="font-semibold">{t.exampleAnswer}</h4><p className="whitespace-pre-wrap text-sm">{progress.scenario.example_answer}</p></div>}
      </section>}
      <button className="btn" disabled={busy || !canComplete || progress.completed.includes(active)} onClick={() => onActivity('complete', active)}>{progress.completed.includes(active) ? t.completed : t.complete}</button>
    </div>
  </div>;
}
