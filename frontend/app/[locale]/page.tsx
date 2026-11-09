import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function WelcomePage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-bold text-ivory-50">
            CH
          </span>
          <span className="font-serif text-lg font-semibold">{t('common.appName')}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/${locale === 'zh' ? 'en' : 'zh'}`} className="btn-ghost px-3 py-1.5 text-xs">
            {locale === 'zh' ? 'EN' : '中文'}
          </Link>
          <Link href={`/${locale}/login`} className="btn-ghost px-3 py-1.5 text-xs">
            {t('common.signIn')}
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-16 lg:grid-cols-[1.15fr_.85fr] lg:py-24">
        <div>
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            {t('welcome.title')}
          </h1>
          <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-700">{t('welcome.subtitle')}</p>

          <ul className="mt-8 space-y-2.5 text-sm text-ink-700">
            {['welcome.point1', 'welcome.point2', 'welcome.point3'].map((key) => (
              <li key={key} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {t(key)}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={`/${locale}/register`} className="btn">
              {t('welcome.ctaRegister')}
            </Link>
            <Link href={`/${locale}/login`} className="btn-ghost">
              {t('welcome.ctaLogin')}
            </Link>
          </div>
        </div>

        <div className="card self-start p-6">
          <div className="aspect-[4/3] rounded-xl border border-black/10 bg-gradient-to-br from-accent-soft via-ivory-100 to-ivory-300" />
          <p className="mt-4 text-xs leading-relaxed text-ink-500">
            {t('welcome.point3')}
          </p>
        </div>
      </section>
    </div>
  );
}
