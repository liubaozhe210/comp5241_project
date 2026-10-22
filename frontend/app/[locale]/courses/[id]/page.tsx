'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Shell } from '@/components/Shell';
import { apiFetch, errorText, type Course, type Enrollment, type Material } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';
import { useSession } from '@/lib/useSession';

export default function CourseDetailPage({
  params: { locale, id },
}: {
  params: { locale: AppLocale; id: string };
}) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();

  const [course, setCourse] = useState<Course | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const detail = await apiFetch<Course>(`/courses/${id}`);
      setCourse(detail);

      if (me?.role === 'student') {
        const mine = await apiFetch<Enrollment[]>('/me/enrollments');
        setEnrollment(mine.find((e) => e.course_id === id) ?? null);
      }

      try {
        const list = await apiFetch<Material[]>(`/courses/${id}/materials`);
        setMaterials(list);
        setLocked(false);
      } catch {
        setMaterials(null);
        setLocked(true);
      }
    } catch (err) {
      setError(errorText(err, t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, me?.role]);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace(`/${locale}/login`);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me, load]);

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const created = await apiFetch<Enrollment>(`/courses/${id}/enrollments`, { method: 'POST' });
      setEnrollment(created);
      await load();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError('');
    try {
      const updated = await apiFetch<Enrollment>(`/courses/${id}/enrollments/me`, { method: 'DELETE' });
      setEnrollment(updated);
      setMaterials(null);
      setLocked(true);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function openMaterial(material: Material) {
    try {
      const signed = await apiFetch<{ url: string }>(`/materials/${material.id}/url`);
      window.open(signed.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(errorText(err, t));
    }
  }

  const isMember = enrollment?.status === 'approved';
  const isPending = enrollment?.status === 'pending';
  const isRejected = enrollment?.status === 'rejected';
  const isFull = course ? course.approved_count >= course.capacity : false;
  const isClosed = course?.enrollment_policy === 'closed';

  return (
    <Shell locale={locale} me={me} onSignOut={async () => { await signOut(); router.push(`/${locale}/login`); }}>
      <Link href={`/${locale}/courses`} className="text-sm text-ink-500 hover:text-ink-900">
        ← {t('nav.catalog')}
      </Link>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {!course ? (
        <p className="mt-6 text-sm text-ink-500">{t('common.loading')}</p>
      ) : (
        <>
          <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-gradient-to-br from-accent-soft via-ivory-100 to-ivory-300 px-6 pb-6 pt-16">
            <span className="rounded border border-black/10 bg-ivory-50/90 px-2 py-1 font-mono text-[10px] font-semibold tracking-widest">
              {course.code}
            </span>
            <span className="badge badge-grey ml-2 bg-ivory-50/90">{t(`status.${course.status}`)}</span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{course.name}</h1>
            <p className="mt-1 text-sm text-ink-700">
              {course.semester} · {t('courses.seats')} {course.approved_count}/{course.capacity}
            </p>
          </div>

          <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-5">
              <section className="card p-5">
                <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">{t('course.about')}</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-700">{course.description || '—'}</p>
              </section>

              <section className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-black/10 px-5 py-3">
                  <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-ink-500">{t('course.materials')}</h2>
                  {materials ? <span className="badge badge-grey">{materials.length}</span> : null}
                </div>

                {locked ? (
                  <div className="m-4 rounded-xl border border-dashed border-black/20 bg-ivory-100 p-5">
                    <p className="font-semibold">{t('course.lockedTitle')}</p>
                    <p className="mt-1 text-sm text-ink-500">{t('course.lockedBody')}</p>
                  </div>
                ) : materials && materials.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="font-serif text-base font-semibold">{t('course.noMaterials')}</p>
                    <p className="mt-1 text-sm text-ink-500">{t('course.noMaterialsBody')}</p>
                  </div>
                ) : (
                  <ul>
                    {(materials ?? []).map((material) => (
                      <li
                        key={material.id}
                        className="flex items-center gap-4 border-b border-black/5 px-5 py-3 last:border-0 hover:bg-black/[0.02]"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent-soft text-[10px] font-bold text-accent">
                          PDF
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{material.title}</p>
                          <p className="text-xs text-ink-500">
                            {(material.size_bytes / 1024 / 1024).toFixed(1)} MB
                            {material.pages ? ` · ${material.pages} ${t('course.pages')}` : ''}
                          </p>
                        </div>
                        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => openMaterial(material)}>
                          {t('course.preview')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <aside className="card space-y-4 p-5">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">{t('courses.semester')}</dt>
                  <dd>{course.semester}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">{t('courses.seats')}</dt>
                  <dd>
                    {course.approved_count} / {course.capacity}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">{t('status.apply')}</dt>
                  <dd>
                    <span className="badge badge-accent">{t(`status.${course.enrollment_policy}`)}</span>
                  </dd>
                </div>
              </dl>

              {me?.role === 'student' ? (
                <div className="space-y-2 border-t border-black/10 pt-4">
                  {isMember ? (
                    <p className="rounded-lg border border-emerald-700/25 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      {t('course.enrolledNote')}
                    </p>
                  ) : null}
                  {isPending ? (
                    <>
                      <p className="rounded-lg border border-amber-700/25 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        {t('course.pendingNote')}
                      </p>
                      <button type="button" className="btn-ghost w-full" disabled={busy} onClick={withdraw}>
                        {t('course.withdraw')}
                      </button>
                    </>
                  ) : null}
                  {isRejected ? (
                    <p className="rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-xs text-red-800">
                      {t('course.rejectedNote')}
                    </p>
                  ) : null}

                  {!isMember && !isPending ? (
                    isClosed ? (
                      <p className="rounded-lg border border-black/10 bg-ivory-100 px-3 py-2 text-xs text-ink-500">
                        {t('course.closedNote')}
                      </p>
                    ) : isFull ? (
                      <p className="rounded-lg border border-black/10 bg-ivory-100 px-3 py-2 text-xs text-ink-500">
                        {t('course.fullNote')}
                      </p>
                    ) : (
                      <button type="button" className="btn w-full" disabled={busy} onClick={apply}>
                        {t('course.apply')}
                      </button>
                    )
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </Shell>
  );
}
