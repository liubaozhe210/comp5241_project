import { StageQuiz } from '@/components/StageQuiz';
import type { AppLocale } from '@/lib/i18n-config';

export default function Page({ params }: { params: { locale: AppLocale; id: string; anchor: string } }) {
  return <StageQuiz locale={params.locale} id={params.id} anchor={params.anchor} />;
}
