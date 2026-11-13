'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch, errorText } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';

type Resources = {
  version_id: string; course_id: string | null;
  status: 'available' | 'locked' | 'no_course' | 'unavailable';
  materials: { id: string; title: string; pages: number | null; size_bytes: number }[];
};

export function PathResources({ locale, pathId, versionId }: { locale: AppLocale; pathId: string; versionId: string }) {
  const t = useTranslations();
  const [data, setData] = useState<Resources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(''); setLoading(true);
    apiFetch<Resources>(`/learning-paths/${pathId}/resources?version_id=${encodeURIComponent(versionId)}`)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(errorText(err, t)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pathId, versionId, retry, t]);
  return <section className="card mb-8 space-y-4 p-5">
    <h2 className="text-xl font-semibold">{t('pathResources.title')}</h2>
    <p className="text-sm text-ink-500">{t('pathResources.note')}</p>
    {loading && <p role="status">{t('common.loading')}</p>}
    {error && <div role="alert"><p className="text-red-800">{error}</p><button className="btn-ghost mt-2" onClick={() => setRetry((n) => n + 1)}>{t('reading.retry')}</button></div>}
    {!loading && data && <>
      {data.status !== 'available' && <p>{t(`pathResources.${data.status}`)}</p>}
      {data.status === 'locked' && data.course_id && <Link className="btn-ghost inline-block" href={`/${locale}/courses/${data.course_id}`}>{t('pathResources.enrollment')}</Link>}
      {data.status === 'available' && (data.materials.length ? <ul className="divide-y divide-black/10">
        {data.materials.map((material) => <li key={material.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div><h3 className="font-semibold">{material.title}</h3>{material.pages != null && <p className="text-sm text-ink-500">{material.pages} {t('course.pages')}</p>}</div>
          <Link className="btn" href={`/${locale}/learning-path/${pathId}/materials/${material.id}?version=${encodeURIComponent(data.version_id)}`}>{t('pathResources.read')}</Link>
        </li>)}
      </ul> : <p>{t('pathResources.empty')}</p>)}
    </>}
  </section>;
}
