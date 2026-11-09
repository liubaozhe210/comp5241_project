import createMiddleware from 'next-intl/middleware';

import { defaultLocale, locales } from './lib/i18n-config';

export default createMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always',
});

export const config = {
  // 跳过 /_next、静态文件与带扩展名的请求
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};
