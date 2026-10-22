'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Shell } from '@/components/Shell';
import { apiFetch, errorText, type Course, type Enrollment } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';
import { useSession } from '@/lib/useSession';

const STATUS_CLASS: Record<string, string> = {
  approved: 'badge-ok',
  pending: 'badge-warn',
  rejected: 'badge-err',
  withdrawn: 'badge-grey',
  dropped: 'badge-grey',
};

export default function MyCoursesPage({ params: { locale } }: { params: { locale: AppLocale } }) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const [rows, setRows] = useState<Array<{ enrollment: Enrollment; course?: Course }> | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace(`/${locale}/login`);
      return;
    }
    if (me.role !== 'student') {
      router.replace(`/${locale}/courses`);
      return;
    }
    Promise.all([apiFetch<Enrollment[]>('/me/enrollments'), apiFetch<Course[]>('/courses')])
      .then(([enrollments, courses]) => {
        setRows(
          enrollments.map((enrollment) => ({
            enrollment,
            course: courses.find((c) => c.id === enrollment.course_id),
          })),
        );
      })
      .catch((err) => setError(errorText(err, t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me, locale]);

  return (
    <Shell locale={locale} me={me} onSignOut={async () => { await signOut(); router.push(`/${locale}/login`); }}>
      <h1 className="text-3xl font-semibold tracking-tight">{t('nav.myCourses')}</h1>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      {rows && rows.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="font-serif text-lg font-semibold">{t('courses.empty')}</p>
          <Link href={`/${locale}/courses`} className="btn mt-4">
            {t('nav.catalog')}
          </Link>
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {(rows ?? []).map(({ enrollment, course }) => (
          <div key={enrollment.id} className="card flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-widest text-ink-500">{course?.code ?? '—'}</p>
              <Link
                href={`/${locale}/courses/${enrollment.course_id}`}
                className="font-serif text-lg font-semibold hover:underline"
              >
                {course?.name ?? enrollment.course_id}
              </Link>
            </div>
            <span className={`badge ${STATUS_CLASS[enrollment.status] ?? 'badge-grey'}`}>
              {t(`status.${enrollment.status}`)}
            </span>
            <Link href={`/${locale}/courses/${enrollment.course_id}`} className="btn-ghost px-3 py-1.5 text-xs">
              {t('course.preview')}
            </Link>
          </div>
        ))}
      </div>
    </Shell>
  );
}
