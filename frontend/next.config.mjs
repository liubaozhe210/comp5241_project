import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.COURSEHUB_LOCAL_PDF_LAB === '1' ? '.next-pdf-lab' : '.next',
};

export default withNextIntl(nextConfig);
