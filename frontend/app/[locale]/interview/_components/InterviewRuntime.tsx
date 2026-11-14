'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Shell } from '@/components/Shell';
import type { AppLocale } from '@/lib/i18n-config';
import { useSession } from '@/lib/useSession';

import { InterviewProvider } from './InterviewProvider';
import { ToastProvider, useInterviewToast } from './Toast';

function AuthenticatedStudentShell({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  const t = useTranslations('interview');
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const { showToast } = useInterviewToast();

  if (loading) return <main className="mx-auto max-w-6xl px-5 py-8">{t('loading')}</main>;
  if (!me || me.role !== 'student') {
    return (
      <Shell locale={locale} me={me} onSignOut={async () => { await signOut(); router.push(`/${locale}/login`); }}>
        <div className="card mx-auto max-w-xl p-8 text-center">
          <h1 className="font-serif text-xl font-semibold">{t('authRequired')}</h1>
          <p className="mt-2 text-sm text-ink-500">{t('authRequiredBody')}</p>
          <Link className="btn mt-5" href={`/${locale}/login`}>{t('signIn')}</Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      locale={locale}
      me={me}
      onSignOut={() =>
        signOut().then(() => {
          showToast(locale === 'zh' ? '已退出登录。' : 'You have signed out.', 'info');
          router.push(`/${locale}/login`);
        })
      }
    >
      {children}
    </Shell>
  );
}

export function InterviewRuntime({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  return (
    <InterviewProvider>
      <ToastProvider>
      <AuthenticatedStudentShell locale={locale}>{children}</AuthenticatedStudentShell>
      </ToastProvider>
    </InterviewProvider>
  );
}
