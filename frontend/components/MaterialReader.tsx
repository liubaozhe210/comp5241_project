'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Shell } from '@/components/Shell';
import { apiFetch, errorText } from '@/lib/api';
import { useSession } from '@/lib/useSession';
import type { AppLocale } from '@/lib/i18n-config';
import type { LearningPath } from '@/lib/learning-path';

type Reading = {
  material_id: string; course_id: string; title: string;
  status: 'ready' | 'partial' | 'no_text'; page_count: number;
  pages: { number: number; text: string; truncated: boolean }[];
};

type TaskStudy = {
  id: string; title: string; stage: string; instructions: string; minutes: number;
  done: boolean; version_id: string; read_only: boolean;
  source_status: 'linked' | 'not_linked' | 'migration_pending'; reading: Reading | null;
};

export function MaterialReader({ locale, id, pathId, versionId, taskId }: { locale: AppLocale; id: string; pathId?: string; versionId?: string; taskId?: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const [reading, setReading] = useState<Reading | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [pdfError, setPdfError] = useState('');
  const [fetching, setFetching] = useState(true);
  const [retry, setRetry] = useState(0);
  const [pdf, setPdf] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [task, setTask] = useState<TaskStudy | null>(null);
  const [saving, setSaving] = useState(false);
  const [nextTask, setNextTask] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const pdfRequest = useRef(0);
  const contextEpoch = useRef(0);
  const endpoint = pathId && taskId ? `/learning-paths/${pathId}/tasks/${taskId}/study` : pathId ? `/learning-paths/${pathId}/resources/${id}` : `/materials/${id}`;
  const versionQuery = versionId ? `?version_id=${encodeURIComponent(versionId)}` : '';

  useEffect(() => {
    if (loading) return;
    if (!me) { router.replace(`/${locale}/login`); return; }
    let active = true;
    pdfRequest.current += 1;
    contextEpoch.current += 1;
    setFetching(true); setError(''); setReading(null); setPdf(''); setPdfError(''); setPdfBusy(false); setPage(0);
    setTask(null); setNextTask(null); setSaveError(''); setSaving(false);
    const load = async () => {
      if (taskId) {
        const data = await apiFetch<TaskStudy>(endpoint);
        if (active) { setTask(data); setReading(data.reading); }
      } else {
        const data = await apiFetch<Reading>(`${endpoint}/text${versionQuery}`);
        if (active) setReading(data);
      }
    };
    load()
      .catch((err) => { if (active) setError(errorText(err, t)); })
      .finally(() => { if (active) setFetching(false); });
    return () => { active = false; pdfRequest.current += 1; contextEpoch.current += 1; };
  }, [loading, me, endpoint, versionQuery, locale, router, t, retry, taskId]);

  async function confirmDone() {
    if (!task || !pathId || task.read_only) return;
    setSaving(true); setSaveError('');
    const request = contextEpoch.current;
    try {
      const updated = await apiFetch<LearningPath>(`/learning-paths/${pathId}/tasks/${task.id}`, {
        method: 'PATCH', body: JSON.stringify({ done: !task.done }),
      });
      if (request === contextEpoch.current) {
        setTask({ ...task, done: !task.done }); setNextTask(updated.next_task_id);
      }
    } catch (err) { if (request === contextEpoch.current) setSaveError(errorText(err, t)); }
    finally { if (request === contextEpoch.current) setSaving(false); }
  }

  async function openPdf() {
    const request = ++pdfRequest.current;
    setPdfBusy(true); setPdfError(''); setPdf('');
    try {
      const result = await apiFetch<{ url: string }>(`${endpoint}/url${versionQuery}`);
      const url = new URL(result.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid PDF URL');
      if (request === pdfRequest.current) setPdf(url.href);
    } catch (err) { if (request === pdfRequest.current) setPdfError(errorText(err, t)); }
    finally { if (request === pdfRequest.current) setPdfBusy(false); }
  }

  if (loading || !me) return <p className="p-8">{t('common.loading')}</p>;
  const selected = reading?.pages[page];
  return <Shell locale={locale} me={me} onSignOut={() => { void signOut().then(() => router.push(`/${locale}/login`)); }}>
    <Link href={pathId ? `/${locale}/learning-path/${pathId}${(task?.version_id || versionId) ? `?version=${encodeURIComponent(task?.version_id || versionId || '')}` : ''}` : reading ? `/${locale}/courses/${reading.course_id}` : `/${locale}/courses`} className="btn-ghost">{t(pathId ? 'pathResources.back' : 'reading.back')}</Link>
    <h1 className="my-5 text-3xl font-semibold">{task?.title ?? reading?.title ?? t('reading.title')}</h1>
    {task && <section className="card mb-5 space-y-3 p-5">
      <p>{task.stage} · {task.minutes} min</p><p className="whitespace-pre-wrap">{task.instructions}</p>
      {task.source_status !== 'linked' && <p>{t(`taskStudy.${task.source_status}`)}</p>}
      {task.read_only && <p>{t('learningPath.readOnly')}</p>}
      <button className="btn" disabled={saving || task.read_only} onClick={() => void confirmDone()}>{t(saving ? 'common.loading' : task.done ? 'taskStudy.undo' : 'taskStudy.confirm')}</button>
      {task.done && <p role="status">{t('taskStudy.completed')}</p>}
      {saveError && <p role="alert" className="text-red-800">{saveError}</p>}
      {task.done && nextTask && pathId && <Link className="btn-ghost inline-block" href={`/${locale}/learning-path/${pathId}/tasks/${nextTask}`}>{t('taskStudy.next')}</Link>}
    </section>}
    <p className="mb-5 text-sm text-ink-500">{t('reading.note')}</p>
    {fetching && <p role="status">{t('reading.loading')}</p>}
    {error && <div className="card mb-5 p-4" role="alert"><p>{error}</p><button className="btn-ghost mt-3" onClick={() => setRetry((n) => n + 1)}>{t('reading.retry')}</button></div>}
    {(!taskId || reading) && <div className="mb-5 flex flex-wrap items-center gap-3">
      <button className="btn" disabled={pdfBusy} onClick={() => void openPdf()}>{t(pdfBusy ? 'reading.loadingPdf' : 'reading.openPdf')}</button>
      {pdf && <a className="btn-ghost" href={`${pdf}#page=${selected?.number ?? 1}`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t('reading.newTab')}</a>}
    </div>}
    {pdfError && <p role="alert" className="mb-4 text-red-800">{pdfError}</p>}
    {pdf && <div className="mb-6"><iframe title={t('reading.original')} referrerPolicy="no-referrer" className="h-[70vh] w-full rounded-xl border border-black/10" src={`${pdf}#page=${selected?.number ?? 1}`} /><p className="mt-2 text-sm text-ink-500">{t('reading.pdfHint')}</p></div>}
    {reading && <section className="card p-5">
      <h2 className="mb-3 text-xl font-semibold">{t('reading.extracted')}</h2>
      {reading.status !== 'ready' && <p className="mb-4 rounded-lg bg-amber-50 p-3">{t(`reading.${reading.status}`)}</p>}
      {reading.page_count > 0 && <div className="mb-5 flex flex-wrap items-center gap-3">
        <button className="btn-ghost" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>{t('reading.previous')}</button>
        <label>{t('reading.page')} <select className="input inline-block w-auto" value={page} onChange={(event) => setPage(Number(event.target.value))}>{reading.pages.map((item, index) => <option value={index} key={item.number}>{item.number}</option>)}</select> / {reading.page_count}</label>
        <button className="btn-ghost" disabled={page + 1 >= reading.pages.length} onClick={() => setPage((n) => n + 1)}>{t('reading.next')}</button>
      </div>}
      {selected && <><p className="whitespace-pre-wrap break-words leading-8">{selected.text || t('reading.emptyPage')}</p>{selected.truncated && <p className="mt-4 text-amber-900">{t('reading.truncated')}</p>}</>}
    </section>}
  </Shell>;
}
