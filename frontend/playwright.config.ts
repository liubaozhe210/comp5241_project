import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', workers: 1, timeout: 60000,
  use: {baseURL: process.env.E2E_BASE_URL || 'http://localhost:3310',
    headless: true, ...(process.env.E2E_BROWSER_CHANNEL ? {channel: process.env.E2E_BROWSER_CHANNEL} : {})},
});
