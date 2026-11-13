'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Shell } from './Shell';
import { PathResources } from './PathResources';
import { apiFetch, errorText, type Course } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import type { AppLocale } from '@/lib/i18n-config';
import type { LearningPath } from '@/lib/learning-path';

export function LearningPaths({ locale, id, initialVersion }: { locale: AppLocale; id?: string; initialVersion?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const [paths, setPaths] = useState<LearningPath[]>([]);
  const [path, setPath] = useState<LearningPath | null>(null);
  const [versions, setVersions] = useState<LearningPath[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [retry, setRetry] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace(`/${locale}/login`); return; }
    if (me.role !== 'student') { router.replace(`/${locale}/courses`); return; }
    let active = true;
    setFetching(true); setError('');
    const load = async () => {
      try {
        if (id) {
          const [detail, history] = await Promise.all([
            apiFetch<LearningPath>(`/learning-paths/${id}${initialVersion ? `?version_id=${encodeURIComponent(initialVersion)}` : ''}`),
            apiFetch<LearningPath[]>(`/learning-paths/${id}/versions`),
          ]);
          if (active) { setPath(detail); setVersions(history); }
        } else {
          const list = await apiFetch<LearningPath[]>('/me/learning-paths');
          if (active) setPaths(list);
        }
        const catalog = await apiFetch<Course[]>('/courses');
        if (active) setCourses(catalog);
      } catch (err) { if (active) setError(errorText(err, t)); }
      finally { if (active) setFetching(false); }
    };
    void load();
    return () => { active = false; };
  }, [id, initialVersion, loading, me, locale, router, retry, t]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError('');
    try {
      const result = await apiFetch<LearningPath>(id ? `/learning-paths/${id}/versions` : '/learning-paths', {
        method: 'POST', body: JSON.stringify({
          topic: data.get('topic'), goal: data.get('goal'), level: data.get('level'),
          budget_minutes: Number(data.get('hours')) * 60, course_id: data.get('course_id') || null,
        }),
      });
      if (id) {
        setPath(result); setVersions((old) => [result, ...old]);
        router.replace(`/${locale}/learning-path/${id}?version=${encodeURIComponent(result.version_id)}`);
      } else router.push(`/${locale}/learning-path/${result.id}`);
    } catch (err) { setError(errorText(err, t)); }
    finally { setBusy(false); }
  }

  async function toggle(taskId: string, done: boolean) {
    setBusy(true); setError('');
    try {
      const updated = await apiFetch<LearningPath>(`/learning-paths/${id}/tasks/${taskId}`, {
        method: 'PATCH', body: JSON.stringify({ done }),
      });
      setPath(updated);
      setVersions((old) => old.map((v) => v.version_id === updated.version_id ? updated : v));
    } catch (err) { setError(errorText(err, t)); }
    finally { setBusy(false); }
  }

  if (loading || !me || me.role !== 'student') return <p className="p-8">{t('common.loading')}</p>;
  const archived = path && path.version_id !== path.current_version_id;
  return <Shell locale={locale} me={me} onSignOut={() => { void signOut().then(() => router.push(`/${locale}/login`)); }}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold">{t('learningPath.title')}</h1>
      {id && <Link className="btn-ghost" href={`/${locale}/learning-path`}>{t('learningPath.back')}</Link>}
    </div>
    <p className="mb-5 rounded-lg border border-amber-700/25 bg-amber-50 p-4 text-sm">{t('learningPath.unavailable')}</p>
    {error && <div role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-red-800">{error}
      <button type="button" className="btn-ghost ml-3" onClick={() => setRetry((v) => v + 1)}>{t('learningPath.retry')}</button>
    </div>}
    {fetching ? <p>{t('common.loading')}</p> : <>
      {!id && <div className="mb-8 grid gap-4 sm:grid-cols-2">{paths.length ? paths.map((item) =>
        <Link className="card p-5" key={item.id} href={`/${locale}/learning-path/${item.id}`}>
          <h2 className="text-xl font-semibold">{item.topic}</h2><p className="my-2 text-sm">{item.goal}</p>
          <p>{t(`learningPath.${item.status}`)} · {item.progress}%</p>
        </Link>) : <p>{t('learningPath.empty')}</p>}</div>}
      {path && <section className="card mb-8 space-y-4 p-5">
        <h2 className="text-2xl font-semibold">{path.topic} · v{path.version}</h2><p>{path.goal}</p>
        <p>{t(`learningPath.${path.status}`)} · {path.budget_minutes / 60} {t('learningPath.hours')} · {path.completed_tasks}/{path.total_tasks}</p>
        {archived && <p>{t('learningPath.readOnly')}</p>}
        <progress className="w-full" max={100} value={path.progress} aria-label={t('learningPath.progress')} />
        {path.next_task_id && <button className="btn" onClick={() => setFocused(path.next_task_id)}>{t('learningPath.continue')}</button>}
        {path.tasks.map((task) => <article key={task.id} className="rounded-lg border border-black/10 p-4">
          <p className="text-sm text-ink-500">{task.stage} · {task.minutes} min</p>
          <h3 className="font-semibold">{task.title}</h3>
          <button className="btn-ghost my-2" onClick={() => setFocused(focused === task.id ? null : task.id)} aria-expanded={focused === task.id}>{t('learningPath.study')}</button>
          {focused === task.id && <p className="mb-3 whitespace-pre-wrap">{task.instructions}</p>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={task.done} disabled={busy || !!archived || path.status !== 'ready'} onChange={(event) => void toggle(task.id, event.target.checked)} />{t('learningPath.done')}</label>
        </article>)}
        <label className="label">{t('learningPath.history')}
          <select className="input mt-2" value={path.version_id} onChange={(event) => {
            const selected = versions.find((v) => v.version_id === event.target.value);
            if (selected) {
              setPath(selected); setFocused(null);
              router.replace(`/${locale}/learning-path/${id}?version=${encodeURIComponent(selected.version_id)}`);
            }
          }}>{versions.map((v) => <option key={v.version_id} value={v.version_id}>v{v.version} · {v.topic} · {t(`learningPath.${v.status}`)}</option>)}</select>
        </label>
      </section>}
      {id && path && <PathResources key={path.version_id} locale={locale} pathId={id} versionId={path.version_id} />}
      {(!id || path) && <section className="card p-5">
        <h2 className="mb-4 text-xl font-semibold">{t(id ? 'learningPath.revise' : 'learningPath.create')}</h2>
        <form key={path?.version_id ?? 'new'} onSubmit={(event) => void save(event)} className="space-y-4">
          <label className="label">{t('learningPath.topic')}<input name="topic" className="input mt-2" required maxLength={120} defaultValue={path?.topic} /></label>
          <label className="label">{t('learningPath.goal')}<textarea name="goal" className="input mt-2" required maxLength={1000} defaultValue={path?.goal} /></label>
          <label className="label">{t('learningPath.level')}<select name="level" className="input mt-2" defaultValue={path?.level ?? 'beginner'}>{['beginner', 'intermediate', 'advanced'].map((v) => <option key={v} value={v}>{t(`learningPath.${v}`)}</option>)}</select></label>
          <label className="label">{t('learningPath.hours')}<input name="hours" type="number" min={1} max={200} step={0.5} required className="input mt-2" defaultValue={path ? path.budget_minutes / 60 : 10} /></label>
          <label className="label">{t('learningPath.course')}<select name="course_id" className="input mt-2" defaultValue={path?.course_id ?? ''}><option value="">{t('learningPath.optional')}</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.name}</option>)}</select></label>
          <button className="btn" disabled={busy}>{busy ? t('common.loading') : t('learningPath.save')}</button>
        </form>
      </section>}
    </>}
  </Shell>;
}
