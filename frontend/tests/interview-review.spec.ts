import { expect, test } from '@playwright/test';

test('review page exposes only pending and mastered states', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'sb-example-auth-token',
      JSON.stringify({
        access_token: 'review-test',
        refresh_token: 'test-refresh',
        token_type: 'bearer',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'review-test', aud: 'authenticated', role: 'authenticated', email: 'review@example.test' },
      }),
    );
    localStorage.setItem(
      'coursehub.interview.mock.v1',
      JSON.stringify({
        resumes: [],
        assessments: [],
        questionSets: [],
        sessions: [],
        reviews: [
          {
            id: 'pending-review',
            source: 'manual',
            sourceId: null,
            question: 'Pending review question',
            category: 'technical',
            tags: [],
            answerFramework: '',
            lastAnswer: '',
            lastFeedback: '',
            masteryStatus: 'in_progress',
            attempts: [],
            createdAt: new Date().toISOString(),
          },
          {
            id: 'mastered-review',
            source: 'manual',
            sourceId: null,
            question: 'Mastered review question',
            category: 'technical',
            tags: [],
            answerFramework: '',
            lastAnswer: '',
            lastFeedback: '',
            masteryStatus: 'mastered',
            attempts: [],
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );
  });

  await page.goto('/zh/interview/review');

  const tabs = page.getByRole('tablist').getByRole('tab');
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(0)).toContainText('待复习');
  await expect(tabs.nth(1)).toContainText('已掌握');
  await expect(page.getByText('全部来源')).toHaveCount(0);
  await expect(page.getByText('全部分类')).toHaveCount(0);
  await expect(page.getByText('生成 2 道变式题')).toHaveCount(0);
  await expect(page.getByText('总数', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Pending review question')).toBeVisible();
  await expect(page.getByText('Mastered review question')).toHaveCount(0);
  await tabs.nth(1).click();
  await expect(page.getByText('Mastered review question')).toBeVisible();
  await expect(page.getByText('Pending review question')).toHaveCount(0);

  const status = page.getByLabel('更新掌握状态').first();
  await expect(status.locator('option')).toHaveCount(2);
  await expect(status.locator('option').nth(0)).toHaveText('未复习');
  await expect(status.locator('option').nth(1)).toHaveText('已掌握');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!));
  expect(stored.reviews.find((item: { id: string }) => item.id === 'pending-review').masteryStatus).toBe('not_reviewed');

  await page.goto('/zh/interview');
  await expect(page.getByText('最近活动')).toHaveCount(0);
});
