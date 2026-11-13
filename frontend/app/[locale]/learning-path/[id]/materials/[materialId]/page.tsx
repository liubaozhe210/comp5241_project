import { MaterialReader } from '@/components/MaterialReader';
import type { AppLocale } from '@/lib/i18n-config';

export default function Page({ params, searchParams }: {
  params: { locale: AppLocale; id: string; materialId: string };
  searchParams: { version?: string };
}) {
  return <MaterialReader locale={params.locale} id={params.materialId} pathId={params.id} versionId={searchParams.version} />;
}
