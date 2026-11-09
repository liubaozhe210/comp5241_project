export const locales = ['en', 'zh'] as const;
export const defaultLocale = 'en' as const;

export type AppLocale = (typeof locales)[number];

export const localeLabels: Record<AppLocale, string> = {
  en: 'EN',
  zh: '中文',
};
