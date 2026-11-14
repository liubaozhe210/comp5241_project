import type { AppLocale } from '@/lib/i18n-config';

import { InterviewRuntime } from './_components/InterviewRuntime';

export default function InterviewLayout({
  children,
  params: { locale },
}: {
  children: React.ReactNode;
  params: { locale: AppLocale };
}) {
  return <InterviewRuntime locale={locale}>{children}</InterviewRuntime>;
}
