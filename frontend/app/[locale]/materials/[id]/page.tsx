import { MaterialReader } from '@/components/MaterialReader';
import type { AppLocale } from '@/lib/i18n-config';

export default function Page({ params }: { params: { locale: AppLocale; id: string } }) {
  return <MaterialReader locale={params.locale} id={params.id} />;
}
