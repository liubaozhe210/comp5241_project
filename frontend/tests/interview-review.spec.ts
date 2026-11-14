import { expect, test } from '@playwright/test';

import { mockInterviewApi } from './interview-api';

test('review practice updates the latest result and leaves mastery status user-controlled', async ({ page }) => {
  const state = await mockInterviewApi(page, { seedReviews: true });

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

  await page.getByRole('button', { name: '显示反馈' }).click();
  await page.locator('textarea').fill('我会先明确问题，再提出方案并用真实结果验证影响。');
  await page.getByRole('button', { name: '提交练习回答' }).click();
  await expect(page.getByText('Pending review question')).toBeVisible();
  const updated = state.reviews.find((item) => item.id === 'pending-review');
  expect(updated?.mastery_status).toBe('pending');
  expect(updated?.last_answer).toContain('真实结果');
  expect(updated?.last_score).toBe(82);
  expect(updated?.last_feedback).toHaveProperty('mastery_suggested', true);
  await expect(page.getByText('AI 建议将此题标记为已掌握；你可以自行更新状态。')).toBeVisible();

  await tabs.nth(1).click();
  await expect(page.getByText('Mastered review question')).toBeVisible();
  await expect(page.getByText('Pending review question')).toHaveCount(0);

  const status = page.getByLabel('更新掌握状态').first();
  await expect(status.locator('option')).toHaveCount(2);
  await expect(status.locator('option').nth(0)).toHaveText('待复习');
  await expect(status.locator('option').nth(1)).toHaveText('已掌握');
});
