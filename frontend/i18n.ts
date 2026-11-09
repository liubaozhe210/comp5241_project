import { getRequestConfig } from 'next-intl/server';

import { defaultLocale } from './lib/i18n-config';

/**
 * next-intl 3.22+ 的写法：用 requestLocale 取代已废弃的 locale 参数，
 * 并且必须把 locale 一并返回，否则静态生成会失败。
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested ?? defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
