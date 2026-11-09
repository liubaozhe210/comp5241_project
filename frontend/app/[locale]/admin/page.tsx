'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Shell } from '@/components/Shell';
import { apiFetch, errorText, type Me } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';
import { useSession } from '@/lib/useSession';

export default function AdminPage({ params: { locale } }: { params: { locale: AppLocale } }) {
  const t = useTranslations();
  const router = useRouter();
  const { me, loading, signOut } = useSession();
  const [users, setUsers] = useState<Me[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      setUsers(await apiFetch<Me[]>('/admin/users'));
    } catch (err) {
      setError(errorText(err, t));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!me) {
      router.replace(`/${locale}/login`);
      return;
    }
    if (me.role !== 'admin') {
      router.replace(`/${locale}/courses`);
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, me, locale, load]);

  async function toggle(user: Me) {
    setBusyId(user.id);
    setError('');
    try {
      await apiFetch(`/admin/users/${user.id}/${user.status === 'active' ? 'disable' : 'enable'}`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusyId('');
    }
  }

  return (
    <Shell locale={locale} me={me} onSignOut={async () => { await signOut(); router.push(`/${locale}/login`); }}>
      <h1 className="text-3xl font-semibold tracking-tight">{t('nav.admin')}</h1>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-800/25 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-black/[0.02] text-[10px] uppercase tracking-[0.14em] text-ink-500">
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Role</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((user) => (
              <tr key={user.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02]">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-ink-500">{user.login_id}</td>
                <td className="px-4 py-3 text-xs text-ink-700">{user.email}</td>
                <td className="px-4 py-3">
                  <span className="badge badge-accent">{user.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${user.status === 'active' ? 'badge-ok' : 'badge-err'}`}>{user.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className={user.status === 'active' ? 'btn-ghost px-3 py-1.5 text-xs' : 'btn px-3 py-1.5 text-xs'}
                    disabled={busyId === user.id || user.id === me?.id}
                    onClick={() => toggle(user)}
                  >
                    {user.status === 'active' ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
