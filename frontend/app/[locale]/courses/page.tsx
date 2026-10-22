'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { Shell } from '@/components/Shell';
import { apiFetch, errorText, type Course } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';
import { useSession } from '@/lib/useSession';

const POLICY_CLASS: Record<Course['enrollment_policy'], string> = {
  open: 'badge-ok',
  approval: 'badge-accent',
  closed: 'badge-grey',
};

export default function CoursesPage({ params: { locale } }: { params: { locale: AppLocale } }) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiFetch<Course[]>('/courses')
      .then(setCourses)
      .catch((err) => setError(errorText(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me, locale]);

  const visible = useMemo(() => {
    if (!courses) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return courses;
    return courses.filter((c) => `${c.name} ${c.code}`.toLowerCase().includes(needle));
  }, [courses, query]);

  return (
    <Shell locale={locale} me={me} onSignOut={async () => { await signOut(); router.push(`/${locale}/login`); }}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t('courses.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-500">{t('courses.subtitle')}</p>
        </div>
        <input
          className="input max-w-xs"
          placeholder={t('common.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error ? (
        <p className="mb-6 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {!courses && !error ? (
        <p className="text-sm text-ink-500">{t('common.loading')}</p>
      ) : null}

      {courses && visible.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-serif text-lg font-semibold">{t('courses.empty')}</p>
          <p className="mt-1 text-sm text-ink-500">{t('courses.emptyBody')}</p>
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((course) => (
          <Link
            key={course.id}
            href={`/${locale}/courses/${course.id}`}
            className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <div className="relative h-28 border-b border-black/10 bg-gradient-to-br from-accent-soft via-ivory-100 to-ivory-300">
              <span className="absolute left-3 top-3 rounded border border-black/10 bg-ivory-50/90 px-2 py-1 font-mono text-[10px] font-semibold tracking-widest">
                {course.code}
              </span>
              <span className={`badge absolute right-3 top-3 ${POLICY_CLASS[course.enrollment_policy]} bg-ivory-50/90`}>
                {t(`status.${course.enrollment_policy}`)}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h2 className="font-serif text-lg font-semibold leading-snug">{course.name}</h2>
              <p className="text-xs text-ink-500">{course.semester}</p>
              <p className="line-clamp-2 min-h-[2.4rem] text-xs leading-relaxed text-ink-700">{course.description}</p>
              <div className="mt-auto flex items-center justify-between border-t border-black/10 pt-2 text-xs text-ink-500">
                <span>
                  {t('courses.seats')} {course.approved_count}/{course.capacity}
                </span>
                <span className="text-accent transition group-hover:translate-x-0.5">→</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
