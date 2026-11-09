'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { supabase } from '@/lib/supabase';

export default function LoginPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(t('login.errorInvalid'));
        return;
      }
      router.replace(`/${locale}/courses`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <Link href={`/${locale}`} className="mb-8 text-sm text-ink-500 hover:text-ink-900">
        ← {t('common.appName')}
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">{t('login.title')}</h1>
      <p className="mt-2 text-sm text-ink-500">{t('login.subtitle')}</p>

      {error ? (
        <p className="mt-5 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            {t('login.email')}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            className="input mt-1.5"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {t('login.password')}
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            className="input mt-1.5"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn w-full" disabled={busy}>
          {busy ? t('common.loading') : t('login.submit')}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-500">
        {t('login.noAccount')}{' '}
        <Link href={`/${locale}/register`} className="font-semibold text-accent hover:underline">
          {t('login.goRegister')}
        </Link>
      </p>
    </div>
  );
}
