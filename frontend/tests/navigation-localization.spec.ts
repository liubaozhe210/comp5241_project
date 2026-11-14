import { expect, test } from '@playwright/test';

test('Interview Mastery navigation is localized in Chinese', async ({ page }) => {
  await page.goto('/zh/interview/resume/assessment');

  await expect(page.getByRole('link', { name: '面试精进' })).toBeVisible();
});
