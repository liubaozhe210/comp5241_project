'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { Me } from '@/lib/api';
import { localeLabels, locales, type AppLocale } from '@/lib/i18n-config';

function LocaleSwitch({ locale }: { locale: AppLocale }) {
  const pathname = usePathname() || `/${locale}`;
  const rest = pathname.replace(/^\/(en|zh)/, '');
  return (
    <div className="flex items-center gap-1 rounded-full border border-black/10 bg-ivory-50 p-0.5">
      {locales.map((code) => (
        <Link
          key={code}
          href={`/${code}${rest || ''}`}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            code === locale ? 'bg-accent text-ivory-50' : 'text-ink-500 hover:text-ink-900'
          }`}
        >
          {localeLabels[code]}
        </Link>
      ))}
    </div>
  );
}

export function Shell({
  locale,
  me,
  onSignOut,
  children,
}: {
  locale: AppLocale;
  me: Me | null;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const pathname = usePathname() || '';

  const links: Array<{ href: string; label: string; show: boolean }> = [
    { href: `/${locale}/courses`, label: t('nav.catalog'), show: true },
    { href: `/${locale}/my`, label: t('nav.myCourses'), show: me?.role === 'student' },
    { href: `/${locale}/teaching`, label: t('nav.teaching'), show: me?.role === 'teacher' || me?.role === 'admin' },
    { href: `/${locale}/admin`, label: t('nav.admin'), show: me?.role === 'admin' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-ivory-200/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <Link href={`/${locale}`} className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-ivory-50">
              CH
            </span>
            <span className="font-serif text-lg font-semibold tracking-tight">{t('common.appName')}</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {links
              .filter((l) => l.show)
              .map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`rounded-lg px-3 py-2 text-sm transition ${
                      active ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-700 hover:bg-black/[0.04]'
                    }`}
                  >
                    {link.label}
                  </Link>
                );
              })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <LocaleSwitch locale={locale} />
            {me ? (
              <>
                <span className="hidden text-sm text-ink-700 sm:inline">{me.name}</span>
                <span className="badge badge-accent">{t(`nav.${me.role === 'admin' ? 'admin' : me.role}`)}</span>
                <button type="button" onClick={onSignOut} className="btn-ghost px-3 py-1.5 text-xs">
                  {t('common.signOut')}
                </button>
              </>
            ) : (
              <Link href={`/${locale}/login`} className="btn px-3 py-1.5 text-xs">
                {t('common.signIn')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
