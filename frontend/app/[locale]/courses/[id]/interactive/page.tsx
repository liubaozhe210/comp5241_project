import { InteractiveCourses } from '@/components/InteractiveCourses';
import type { AppLocale } from '@/lib/i18n-config';

export default function Page({params}: {params: {locale: AppLocale; id: string}}) {
  return <InteractiveCourses locale={params.locale} courseId={params.id}/>;
}
