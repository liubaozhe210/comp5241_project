import { LearningPaths } from '@/components/LearningPaths';
import type { AppLocale } from '@/lib/i18n-config';

export default function Page({ params, searchParams }: { params: { locale: AppLocale; id: string }; searchParams: { version?: string } }) {
  return <LearningPaths locale={params.locale} id={params.id} initialVersion={searchParams.version} />;
}
