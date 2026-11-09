'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Shell } from '@/components/Shell';
import { apiFetch, errorText, type Course } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';
import { useSession } from '@/lib/useSession';

export default function TeachingPage({ params: { locale } }: { params: { locale: AppLocale } }) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace(`/${locale}/login`);
      return;
    }
    apiFetch<Course[]>('/courses/mine')
      .then(setCourses)
      .catch((err) => setError(errorText(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me, locale]);

  return (
    <Shell locale={locale} me={me} onSignOut={async () => { await signOut(); router.push(`/${locale}/login`); }}>
      <h1 className="text-3xl font-semibold tracking-tight">{t('nav.teaching')}</h1>
      <p className="mt-2 text-sm text-ink-500">{t('courses.subtitle')}</p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="mt-6 space-y-3">
        {(courses ?? []).map((course) => (
          <div key={course.id} className="card flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-widest text-ink-500">{course.code}</p>
              <Link href={`/${locale}/courses/${course.id}`} className="font-serif text-lg font-semibold hover:underline">
                {course.name}
              </Link>
              <p className="mt-0.5 text-xs text-ink-500">
                {course.semester} · {t('courses.seats')} {course.approved_count}/{course.capacity}
              </p>
            </div>
            <span className={`badge ${course.status === 'published' ? 'badge-ok' : 'badge-grey'}`}>
              {t(`status.${course.status}`)}
            </span>
          </div>
        ))}
        {courses && courses.length === 0 ? (
          <div className="card p-10 text-center text-sm text-ink-500">{t('courses.empty')}</div>
        ) : null}
      </div>
    </Shell>
  );
}
