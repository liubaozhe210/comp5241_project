'use client';

import { useMemo } from 'react';

import { Shell } from '@/components/Shell';
import type { Me } from '@/lib/api';
import type { AppLocale } from '@/lib/i18n-config';

import { InterviewProvider } from './InterviewProvider';
import { ToastProvider, useInterviewToast } from './Toast';

function MockStudentShell({
  locale,
  children,
}: {
  locale: AppLocale;
  children: React.ReactNode;
}) {
  const { showToast } = useInterviewToast();
  const me = useMemo<Me>(
    () => ({
      id: 'mock-student',
      login_id: 'demo-student',
      name: locale === 'zh' ? '模拟学生' : 'Mock Student',
      email: 'student@example.test',
      role: 'student',
      status: 'active',
      locale,
    }),
    [locale],
  );

  return (
    <Shell
      locale={locale}
      me={me}
      onSignOut={() =>
        showToast(
          locale === 'zh'
            ? '这是纯前端模拟模式，没有真实登录会话可退出。'
            : 'This is frontend-only mock mode; there is no real login session to sign out.',
          'info',
        )
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
        <MockStudentShell locale={locale}>{children}</MockStudentShell>
      </ToastProvider>
    </InterviewProvider>
  );
}
