import { LearningPaths } from '@/components/LearningPaths';
import type { AppLocale } from '@/lib/i18n-config';

export default function Page({ params }: { params: { locale: AppLocale; id: string } }) {
  return <LearningPaths locale={params.locale} id={params.id} />;
}
