import { expect, test } from '@playwright/test';

test('review page migrates legacy items to pending/mastered and keeps only the latest practice result', async ({ page }) => {
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
  await expect(page.getByText('最近活动')).toHaveCount(0);
  await expect(page.getByText('Pending review question')).toBeVisible();
  await expect(page.getByText('Mastered review question')).toHaveCount(0);

  const storedAfterMigration = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!));
  const migrated = storedAfterMigration.reviews.find((item: { id: string }) => item.id === 'pending-review');
  expect(migrated.masteryStatus).toBe('pending');
  expect(migrated.attempts).toBeUndefined();
  expect(migrated.lastScore).toBeNull();

  await page.getByRole('button', { name: '显示反馈' }).click();
  await page.locator('textarea').fill('我会先明确问题，再提出方案并用真实结果验证影响。补充具体行动、依据和结果。');
  await page.getByRole('button', { name: '提交练习回答' }).click();
  await expect(page.getByText('Pending review question')).toHaveCount(0);
  const storedAfterPractice = await page.evaluate(() => JSON.parse(localStorage.getItem('coursehub.interview.mock.v1')!));
  const updated = storedAfterPractice.reviews.find((item: { id: string }) => item.id === 'pending-review');
  expect(updated.masteryStatus).toBe('mastered');
  expect(updated.lastAnswer).toContain('真实结果');
  expect(updated.lastScore).toBeGreaterThanOrEqual(80);
  expect(updated.lastFeedback).not.toBe('');
  expect(updated.lastPracticedAt).not.toBeNull();
  expect(updated.attempts).toBeUndefined();

  await tabs.nth(1).click();
  await expect(page.getByText('Mastered review question')).toBeVisible();
  await expect(page.getByText('Pending review question')).toBeVisible();

  const status = page.getByLabel('更新掌握状态').first();
  await expect(status.locator('option')).toHaveCount(2);
  await expect(status.locator('option').nth(0)).toHaveText('待复习');
  await expect(status.locator('option').nth(1)).toHaveText('已掌握');
});
