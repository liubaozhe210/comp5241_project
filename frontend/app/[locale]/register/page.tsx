'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { apiFetch, errorText } from '@/lib/api';

type Role = 'student' | 'teacher';

export default function RegisterPage({ params: { locale } }: { params: { locale: string } }) {
  const t = useTranslations();
  const [role, setRole] = useState<Role>('student');
  const [form, setForm] = useState({
    login_id: '',
    name: '',
    email: '',
    password: '',
    confirm: '',
    invite_code: '',
  });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError(t('register.mismatch'));
      return;
    }
    setBusy(true);
    try {
      await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          login_id: form.login_id.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role,
          invite_code: role === 'teacher' ? form.invite_code.trim() : undefined,
          locale,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-16">
      <Link href={`/${locale}`} className="mb-8 text-sm text-ink-500 hover:text-ink-900">
        ← {t('common.appName')}
      </Link>

      <h1 className="text-3xl font-semibold tracking-tight">{t('register.title')}</h1>
      <p className="mt-2 text-sm text-ink-500">{t('register.subtitle')}</p>

      {done ? (
        <div className="mt-6 rounded-lg border border-emerald-700/25 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {t('register.success')}{' '}
          <Link href={`/${locale}/login`} className="font-semibold underline">
            {t('register.goLogin')}
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="mt-5 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <span className="label">{t('register.role')}</span>
          <div className="mt-1.5 flex gap-2">
            {(['student', 'teacher'] as Role[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRole(item)}
                className={role === item ? 'btn flex-1' : 'btn-ghost flex-1'}
              >
                {t(`register.${item}`)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="login_id">
            {t('register.loginId')}
          </label>
          <input
            id="login_id"
            required
            className="input mt-1.5"
            value={form.login_id}
            onChange={(e) => update('login_id', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="name">
            {t('register.name')}
          </label>
          <input
            id="name"
            required
            className="input mt-1.5"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="email">
            {t('register.email')}
          </label>
          <input
            id="email"
            type="email"
            required
            className="input mt-1.5"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            {t('register.password')}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className="input mt-1.5"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="confirm">
            {t('register.confirm')}
          </label>
          <input
            id="confirm"
            type="password"
            required
            className="input mt-1.5"
            value={form.confirm}
            onChange={(e) => update('confirm', e.target.value)}
          />
        </div>

        {role === 'teacher' ? (
          <div>
            <label className="label" htmlFor="invite">
              {t('register.inviteCode')}
            </label>
            <input
              id="invite"
              required
              className="input mt-1.5"
              value={form.invite_code}
              onChange={(e) => update('invite_code', e.target.value)}
            />
            <p className="mt-1.5 text-xs text-ink-500">{t('register.inviteHint')}</p>
          </div>
        ) : null}

        <button type="submit" className="btn w-full" disabled={busy}>
          {busy ? t('common.loading') : t('register.submit')}
        </button>
      </form>

      <p className="mt-6 text-sm text-ink-500">
        {t('register.haveAccount')}{' '}
        <Link href={`/${locale}/login`} className="font-semibold text-accent hover:underline">
          {t('register.goLogin')}
        </Link>
      </p>
    </div>
  );
}
